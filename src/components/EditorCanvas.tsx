"use client";

import { useEffect, useRef, useState } from "react";
import {
  CANVAS_ZOOM_STEP,
  MAX_ZOOM,
  applyCanvasPinchZoom,
  applyCanvasZoom,
  applyPanPixelDelta,
  clamp,
  getMinZoomForMode,
  isValidHexColor,
  normalizeCompositionTransform,
  snapTransformToCenter,
  stepCanvasZoom,
} from "@/lib/grid-geometry";
import type {
  CompositionTransform,
  GridLayoutConfig,
  GridSplitPlan,
  SafeAreaOptions,
  SourceImageMeta,
} from "@/types/editor";

interface EditorCanvasProps {
  sourceImage: SourceImageMeta;
  gridConfig: GridLayoutConfig;
  transform: CompositionTransform;
  safeAreaOptions: SafeAreaOptions;
  splitPlan: GridSplitPlan;
  onChangeTransform: (next: CompositionTransform) => void;
}

function getPinchMetrics(points: Array<{ x: number; y: number }>): {
  distance: number;
  midX: number;
  midY: number;
} {
  const [p1, p2] = points;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return {
    distance: Math.hypot(dx, dy),
    midX: (p1.x + p2.x) / 2,
    midY: (p1.y + p2.y) / 2,
  };
}

/**
 * Kanvas interaktif bergaya studio Figma untuk menggeser dan memperbesar foto langsung
 * (mouse, sentuhan/cubit 2 jari, kontrol zoom di kanvas, & trackpad pinch) dengan overlay safe area bebas selisih.
 */
export function EditorCanvas({
  sourceImage,
  gridConfig,
  transform,
  safeAreaOptions,
  splitPlan,
  onChangeTransform,
}: EditorCanvasProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragSessionRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    rawOffsetX: number;
    rawOffsetY: number;
  } | null>(null);
  const pinchSessionRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    prevMidX: number;
    prevMidY: number;
  } | null>(null);
  const latestStateRef = useRef({
    transform,
    onChangeTransform,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });
  const [showFullPhotoGhost, setShowFullPhotoGhost] = useState(true);

  useEffect(() => {
    latestStateRef.current = {
      transform,
      onChangeTransform,
    };
  }, [transform, onChangeTransform]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();

      const { transform: currentTransform, onChangeTransform: updateTransform } =
        latestStateRef.current;
      const deltaMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
      const clampedDeltaY = clamp(event.deltaY * deltaMultiplier, -120, 120, 0);
      const scaleFactor = Math.exp(-clampedDeltaY * 0.0025);
      updateTransform(applyCanvasZoom(currentTransform, currentTransform.zoom * scaleFactor));
    };

    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      frame.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const { geometry, placement, safeArea, tiles } = splitPlan;
  const masterAspect = geometry.masterWidth / geometry.masterHeight;
  const { normalizedImageRect } = placement;
  const minZoom = getMinZoomForMode(transform.fitMode);

  const canPanX = Math.abs(normalizedImageRect.width - 1) > 0.002;
  const canPanY = Math.abs(normalizedImageRect.height - 1) > 0.002;
  const outerSideBleedFraction =
    (tiles[0]?.normalizedTileRect.width ?? 0) * safeArea.ratioCropTrimFraction.left;
  const hasCroppedOverflow =
    normalizedImageRect.x < -0.002 ||
    normalizedImageRect.y < -0.002 ||
    normalizedImageRect.x + normalizedImageRect.width > 1.002 ||
    normalizedImageRect.y + normalizedImageRect.height > 1.002;

  const customHex = isValidHexColor(transform.backgroundHex) ? transform.backgroundHex : "#FFFFFF";
  const frameBackdropStyle =
    transform.fitMode === "fit"
      ? transform.backgroundType === "white"
        ? { backgroundColor: "#FFFFFF" }
        : transform.backgroundType === "black"
          ? { backgroundColor: "#000000" }
          : transform.backgroundType === "custom"
            ? { backgroundColor: customHex }
            : { backgroundColor: "#18181B" }
      : { backgroundColor: "#FFFFFF" };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size === 1) {
      const currentTransform = latestStateRef.current.transform;
      pinchSessionRef.current = null;
      dragSessionRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        rawOffsetX: currentTransform.offsetX,
        rawOffsetY: currentTransform.offsetY,
      };
      setIsDragging(true);
      setSnapGuides({ x: false, y: false });
      return;
    }

    if (activePointersRef.current.size >= 2) {
      dragSessionRef.current = null;
      const points = Array.from(activePointersRef.current.values());
      const metrics = getPinchMetrics(points);
      pinchSessionRef.current = {
        initialDistance: Math.max(1, metrics.distance),
        initialZoom: latestStateRef.current.transform.zoom,
        prevMidX: metrics.midX,
        prevMidY: metrics.midY,
      };
      setIsDragging(true);
      setSnapGuides({ x: false, y: false });
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame || !activePointersRef.current.has(event.pointerId)) {
      return;
    }

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const rect = frame.getBoundingClientRect();

    if (activePointersRef.current.size >= 2 && pinchSessionRef.current) {
      const points = Array.from(activePointersRef.current.values());
      const metrics = getPinchMetrics(points);
      const session = pinchSessionRef.current;

      const zoomed = applyCanvasPinchZoom(
        latestStateRef.current.transform,
        session.initialZoom,
        session.initialDistance,
        metrics.distance,
      );
      const deltaMidX = metrics.midX - session.prevMidX;
      const deltaMidY = metrics.midY - session.prevMidY;
      session.prevMidX = metrics.midX;
      session.prevMidY = metrics.midY;

      const panned = applyPanPixelDelta(
        zoomed,
        { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight },
        gridConfig,
        { x: deltaMidX, y: deltaMidY },
        { width: rect.width, height: rect.height },
      );
      latestStateRef.current.transform = panned;
      onChangeTransform(panned);
      return;
    }

    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - session.lastX;
    const deltaY = event.clientY - session.lastY;
    session.lastX = event.clientX;
    session.lastY = event.clientY;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    const currentTransform = latestStateRef.current.transform;
    const rawMoved = applyPanPixelDelta(
      {
        ...currentTransform,
        offsetX: session.rawOffsetX,
        offsetY: session.rawOffsetY,
      },
      { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight },
      gridConfig,
      { x: deltaX, y: deltaY },
      { width: rect.width, height: rect.height },
    );
    session.rawOffsetX = rawMoved.offsetX;
    session.rawOffsetY = rawMoved.offsetY;

    const snapped = snapTransformToCenter(
      rawMoved,
      { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight },
      gridConfig,
      { width: rect.width, height: rect.height },
    );
    setSnapGuides((prev) =>
      prev.x === snapped.snappedX && prev.y === snapped.snappedY
        ? prev
        : { x: snapped.snappedX, y: snapped.snappedY },
    );
    latestStateRef.current.transform = snapped.transform;
    onChangeTransform(snapped.transform);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointersRef.current.delete(event.pointerId);

    if (activePointersRef.current.size === 1) {
      const remaining = activePointersRef.current.entries().next().value;
      const currentTransform = latestStateRef.current.transform;
      pinchSessionRef.current = null;
      if (remaining) {
        const [remainingId, pos] = remaining;
        dragSessionRef.current = {
          pointerId: remainingId,
          lastX: pos.x,
          lastY: pos.y,
          rawOffsetX: currentTransform.offsetX,
          rawOffsetY: currentTransform.offsetY,
        };
      }
      setSnapGuides({ x: false, y: false });
      return;
    }

    if (activePointersRef.current.size === 0) {
      dragSessionRef.current = null;
      pinchSessionRef.current = null;
      setIsDragging(false);
      setSnapGuides({ x: false, y: false });
    }
  };

  const isCentered = Math.abs(transform.offsetX) < 0.002 && Math.abs(transform.offsetY) < 0.002;
  const isDefaultZoom = Math.abs(transform.zoom - 1) < 0.005;

  const handleCenterPhoto = () => {
    onChangeTransform(
      normalizeCompositionTransform({
        ...transform,
        offsetX: 0,
        offsetY: 0,
      }),
    );
  };

  const handleFitFullPhoto = () => {
    onChangeTransform(
      normalizeCompositionTransform({
        ...transform,
        fitMode: "fit",
        zoom: 1.0,
        offsetX: 0,
        offsetY: 0,
      }),
    );
  };

  const handleFillGrid = () => {
    onChangeTransform(
      normalizeCompositionTransform({
        ...transform,
        fitMode: "fill",
        zoom: 1.0,
        offsetX: 0,
        offsetY: 0,
      }),
    );
  };

  return (
    <div className="studio-dot-grid relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 p-4 sm:p-8">
      <div className="z-20 mb-3 flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={isCentered}
            onClick={handleCenterPhoto}
            title="Kembalikan posisi foto tepat ke tengah"
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium shadow-2xs transition ${
              isCentered
                ? "border-zinc-200 bg-white/75 text-zinc-400"
                : "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            <span>{isCentered ? "Sudah di Tengah ✓" : "Tengahkan Foto"}</span>
          </button>

          {hasCroppedOverflow || transform.fitMode === "fill" ? (
            <button
              type="button"
              onClick={handleFitFullPhoto}
              title="Tampilkan seluruh lebar foto tanpa terpotong di kiri & kanan"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-2xs transition hover:border-indigo-300 hover:text-indigo-700"
            >
              <span>Muat Utuh (Anti-Potong)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFillGrid}
              title="Perbesar foto agar memenuhi seluruh kotak grid"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-2xs transition hover:border-indigo-300 hover:text-indigo-700"
            >
              <span>Penuhi Grid</span>
            </button>
          )}

          {!isDefaultZoom ? (
            <button
              type="button"
              onClick={() =>
                onChangeTransform(
                  normalizeCompositionTransform({
                    ...transform,
                    zoom: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                  }),
                )
              }
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-2xs transition hover:text-zinc-900"
            >
              <span>Reset Zoom</span>
            </button>
          ) : null}
        </div>

        {hasCroppedOverflow ? (
          <button
            type="button"
            onClick={() => setShowFullPhotoGhost((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium shadow-2xs transition ${
              showFullPhotoGhost
                ? "border-indigo-200 bg-white/95 text-indigo-700"
                : "border-zinc-200 bg-white/95 text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <span>{showFullPhotoGhost ? "Sembunyikan Sisa Foto" : "Lihat Full Foto"}</span>
          </button>
        ) : null}
      </div>

      <div
        ref={frameRef}
        role="application"
        aria-label="Kanvas editor komposisi grid Instagram. Seret untuk menggeser posisi foto."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          aspectRatio: String(masterAspect),
          width: masterAspect >= 0.85 ? "min(100%, 540px)" : "auto",
          height: masterAspect < 0.85 ? "min(58vh, 540px)" : "auto",
          maxWidth: "100%",
          maxHeight: "60vh",
        }}
        className={`relative touch-none select-none ${
          isDragging ? "cursor-grabbing" : canPanX || canPanY ? "cursor-grab" : "cursor-default"
        }`}
      >
        {showFullPhotoGhost && hasCroppedOverflow ? (
          <div
            aria-hidden="true"
            style={{
              left: `${normalizedImageRect.x * 100}%`,
              top: `${normalizedImageRect.y * 100}%`,
              width: `${normalizedImageRect.width * 100}%`,
              height: `${normalizedImageRect.height * 100}%`,
            }}
            className={`pointer-events-none absolute z-0 ring-1 ring-indigo-500/40 ring-dashed transition-opacity duration-150 ${
              isDragging ? "opacity-45" : "opacity-30"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Bayangan area foto penuh ala Figma di luar bingkai crop */}
            <img
              src={sourceImage.proxyUrl}
              alt=""
              draggable={false}
              className="h-full w-full max-w-none"
            />
          </div>
        ) : null}

        <div
          style={frameBackdropStyle}
          className="relative z-10 h-full w-full overflow-hidden shadow-lg ring-1 ring-zinc-300/90"
        >
          {transform.fitMode === "fit" && transform.backgroundType === "blur" ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- Proxy Object URL lokal client-side untuk latar blur */}
              <img
                src={sourceImage.proxyUrl}
                alt=""
                draggable={false}
                className="h-full w-full scale-110 object-cover blur-xl"
              />
              <div className="absolute inset-0 bg-black/15" />
            </div>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element -- Proxy Object URL lokal dengan penempatan piksel ternormalisasi 1:1 */}
          <img
            src={sourceImage.proxyUrl}
            alt={sourceImage.name}
            draggable={false}
            style={{
              left: `${normalizedImageRect.x * 100}%`,
              top: `${normalizedImageRect.y * 100}%`,
              width: `${normalizedImageRect.width * 100}%`,
              height: `${normalizedImageRect.height * 100}%`,
            }}
            className="pointer-events-none absolute max-w-none"
          />

          {safeAreaOptions.showRatioSafeCrop && outerSideBleedFraction > 0 ? (
            <>
              <div
                aria-hidden="true"
                style={{ width: `${outerSideBleedFraction * 100}%` }}
                className="pointer-events-none absolute inset-y-0 left-0 z-10 border-r border-dashed border-rose-500/80 bg-rose-500/25"
              />
              <div
                aria-hidden="true"
                style={{ width: `${outerSideBleedFraction * 100}%` }}
                className="pointer-events-none absolute inset-y-0 right-0 z-10 border-l border-dashed border-rose-500/80 bg-rose-500/25"
              />
            </>
          ) : null}

          <div
            aria-hidden="true"
            style={{
              left: `${outerSideBleedFraction * 100}%`,
              right: `${outerSideBleedFraction * 100}%`,
              top: 0,
              bottom: 0,
              gridTemplateColumns: `repeat(${geometry.columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${geometry.rows}, minmax(0, 1fr))`,
            }}
            className="pointer-events-none absolute grid"
          >
            {tiles.map((tile) => (
              <div
                key={`${tile.row}-${tile.col}`}
                className={`relative overflow-hidden ${
                  safeAreaOptions.showSplitLines ? "ring-1 ring-white/85 ring-inset" : ""
                }`}
              >
                {safeAreaOptions.showSplitLines ? (
                  <div className="pointer-events-none absolute inset-0 border border-zinc-900/20" />
                ) : null}

                {safeAreaOptions.showRatioSafeCrop && safeArea.ratioCropTrimFraction.top > 0 ? (
                  <>
                    <div
                      style={{ height: `${safeArea.ratioCropTrimFraction.top * 100}%` }}
                      className="absolute inset-x-0 top-0 border-b border-dashed border-rose-500/80 bg-rose-500/20"
                    />
                    <div
                      style={{ height: `${safeArea.ratioCropTrimFraction.bottom * 100}%` }}
                      className="absolute inset-x-0 bottom-0 border-t border-dashed border-rose-500/80 bg-rose-500/20"
                    />
                  </>
                ) : null}

                {safeAreaOptions.showContentSafeZone ? (
                  <div
                    style={{ inset: `${safeArea.contentSafeMarginFraction * 100}%` }}
                    className="absolute rounded-[2px] border border-dashed border-emerald-500/85 bg-emerald-500/5"
                  />
                ) : null}

                {safeAreaOptions.showSplitLines ? (
                  <span
                    className={`absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-2xs ${
                      tile.uploadOrder === 1
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-900/75 text-white"
                    }`}
                  >
                    #{tile.uploadOrder}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {isDragging && snapGuides.x ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-[1.5px] -translate-x-1/2 bg-indigo-500 shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
            />
          ) : null}

          {isDragging && snapGuides.y ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-[1.5px] -translate-y-1/2 bg-indigo-500 shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
            />
          ) : null}
        </div>
      </div>

      <div className="z-20 mt-3 flex w-full max-w-sm items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-1.5 shadow-2xs">
        <button
          type="button"
          disabled={transform.zoom <= minZoom + 0.001}
          onClick={() => onChangeTransform(stepCanvasZoom(transform, -CANVAS_ZOOM_STEP))}
          aria-label="Perkecil ukuran foto"
          title="Perkecil foto (-10%)"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
        >
          −
        </button>

        <input
          type="range"
          aria-label="Atur perbesaran foto di kanvas"
          min={minZoom}
          max={MAX_ZOOM}
          step={0.01}
          value={transform.zoom}
          onChange={(event) =>
            onChangeTransform(applyCanvasZoom(transform, Number(event.target.value)))
          }
          className="min-w-0 flex-1 accent-indigo-600"
        />

        <button
          type="button"
          disabled={transform.zoom >= MAX_ZOOM - 0.001}
          onClick={() => onChangeTransform(stepCanvasZoom(transform, CANVAS_ZOOM_STEP))}
          aria-label="Perbesar ukuran foto"
          title="Perbesar foto (+10%)"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
        >
          +
        </button>

        <span className="min-w-[3.4ch] text-right font-mono text-[11px] font-semibold text-zinc-800">
          {Math.round(transform.zoom * 100)}%
        </span>
      </div>

      <p className="z-20 mt-2 text-center text-[11px] text-zinc-600">
        {canPanX && canPanY
          ? "Geser foto di kanvas & atur zoom dari slider di atas"
          : canPanX
            ? "Geser kiri–kanan di kanvas (naikkan zoom untuk geser atas–bawah)"
            : canPanY
              ? "Geser atas–bawah di kanvas (naikkan zoom untuk geser kiri–kanan)"
              : "Foto pas dengan bingkai — naikkan zoom (>100%) atau pilih 'Utuh + Latar' untuk menggeser"}{" "}
        • Mulai posting dari <strong className="text-emerald-700">#1</strong> (pojok kanan bawah)
      </p>
    </div>
  );
}
