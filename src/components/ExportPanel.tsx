"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildZipFilename,
  createTilesZipBlob,
  estimateOutputSizeBytes,
  exportGridTiles,
  getExportOptimizationHint,
  triggerBrowserDownload,
} from "@/lib/export-pipeline";
import {
  DEFAULT_EXPORT_QUALITY,
  MAX_EXPORT_QUALITY,
  MIN_EXPORT_QUALITY,
} from "@/lib/grid-geometry";
import {
  detectBrowserImageCapabilities,
  formatFileSizeBytes,
  revokeSourceImageProxy,
} from "@/lib/image-loader";
import type {
  CompositionTransform,
  ExportFormat,
  ExportProgress,
  ExportSettings,
  GridLayoutConfig,
  GridSplitPlan,
  ResolutionMode,
  SourceImageMeta,
  TileSliceResult,
} from "@/types/editor";

interface GeneratedTilePreview {
  tile: TileSliceResult;
  thumbnailUrl: string;
}

interface ExportPanelProps {
  sourceImage: SourceImageMeta;
  gridConfig: GridLayoutConfig;
  transform: CompositionTransform;
  splitPlan: GridSplitPlan;
  exportSettings: ExportSettings;
  onChangeExportSettings: (next: ExportSettings) => void;
}

const QUICK_FORMAT_OPTIONS: Array<{
  value: Extract<ExportFormat, "png" | "jpeg">;
  label: string;
  hint: string;
}> = [
  {
    value: "png",
    label: "PNG · Desain & Teks",
    hint: "Paling pas untuk poster, logo & tulisan",
  },
  {
    value: "jpeg",
    label: "JPG · Foto & Upload IG",
    hint: "Tetap tajam & ~3× lebih ringan",
  },
];

const RESOLUTION_OPTIONS: Array<{ value: ResolutionMode; label: string; hint: string }> = [
  {
    value: "ig-1080",
    label: "Standar HD Instagram",
    hint: "Tajam & pas untuk langsung di-upload (1080 px)",
  },
  {
    value: "native",
    label: "Ukuran Asli Foto",
    hint: "Ikuti ukuran piksel penuh dari foto asli",
  },
];

function revokePreviewList(items: GeneratedTilePreview[]): void {
  for (const item of items) {
    revokeSourceImageProxy(item.thumbnailUrl);
  }
}

function buildConfigFingerprint(
  imageId: string,
  gridConfig: GridLayoutConfig,
  transform: CompositionTransform,
  exportSettings: ExportSettings,
): string {
  return JSON.stringify({
    imageId,
    gridConfig,
    transform,
    exportSettings,
  });
}

function getUploadStepCopy(
  uploadOrder: number,
  totalTiles: number,
): { title: string; subtitle: string } {
  if (totalTiles === 1) {
    return {
      title: "Foto Siap Posting",
      subtitle: "Langsung upload ke Instagram",
    };
  }
  if (uploadOrder === 1) {
    return {
      title: "Upload Pertama ke IG",
      subtitle: "Mulai posting dari gambar ini (pojok kanan bawah)",
    };
  }
  if (uploadOrder === totalTiles) {
    return {
      title: "Upload Terakhir ke IG",
      subtitle: "Posting paling terakhir (pojok kiri atas)",
    };
  }
  return {
    title: `Upload ke-${uploadOrder} ke IG`,
    subtitle: `Lanjutkan setelah nomor #${uploadOrder - 1}`,
  };
}

/**
 * Panel pengunduhan hasil potongan foto (unduh sekaligus sebagai ZIP, satu per satu untuk HP, atau Bagikan ke Galeri).
 */
export function ExportPanel({
  sourceImage,
  gridConfig,
  transform,
  splitPlan,
  exportSettings,
  onChangeExportSettings,
}: ExportPanelProps) {
  const [capabilities] = useState(() => detectBrowserImageCapabilities());
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingBatch, setIsDownloadingBatch] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [savedOrders, setSavedOrders] = useState<number[]>([]);
  const [resultSummary, setResultSummary] = useState<{
    imageId: string;
    configFingerprint: string;
    actualFormat: ExportFormat;
    usedFallbackFormat: boolean;
    zipBlob: Blob;
    zipFilename: string;
    items: GeneratedTilePreview[];
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const latestItemsRef = useRef<GeneratedTilePreview[]>([]);
  const activeRunRef = useRef(0);

  const currentFingerprint = buildConfigFingerprint(
    sourceImage.id,
    gridConfig,
    transform,
    exportSettings,
  );
  const activeResult =
    resultSummary && resultSummary.imageId === sourceImage.id ? resultSummary : null;
  const isResultOutdated =
    activeResult !== null && activeResult.configFingerprint !== currentFingerprint;
  const savedSet = new Set(activeResult ? savedOrders : []);

  const shareableFiles = useMemo(() => {
    if (!activeResult) return [];
    return activeResult.items.map(
      ({ tile }) =>
        new File([tile.blob], tile.filename, {
          type: tile.blob.type || "image/png",
        }),
    );
  }, [activeResult]);

  const canShareFiles = useMemo(() => {
    if (shareableFiles.length === 0) return false;
    if (
      typeof navigator === "undefined" ||
      typeof navigator.share !== "function" ||
      typeof navigator.canShare !== "function"
    ) {
      return false;
    }
    try {
      return navigator.canShare({ files: shareableFiles });
    } catch {
      return false;
    }
  }, [shareableFiles]);

  useEffect(() => {
    latestItemsRef.current = resultSummary?.items ?? [];
  }, [resultSummary]);

  useEffect(() => {
    const runCounter = activeRunRef;
    return () => {
      runCounter.current += 1;
      abortControllerRef.current?.abort();
      revokePreviewList(latestItemsRef.current);
    };
  }, []);

  const handleCancelExport = () => {
    abortControllerRef.current?.abort();
  };

  const handleMarkSaved = (order: number) => {
    setSavedOrders((prev) => (prev.includes(order) ? prev : [...prev, order]));
  };

  const handleRunExport = async (mode: "zip" | "single") => {
    if (isExporting) {
      return;
    }

    activeRunRef.current += 1;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsExporting(true);
    setIsDownloadingBatch(false);
    setExportError(null);
    setShareFeedback(null);
    setSavedOrders([]);
    setProgress({
      completed: 0,
      total: splitPlan.tiles.length,
      currentFilename: "",
      phase: "decoding",
    });

    try {
      const output = await exportGridTiles({
        file: sourceImage.file,
        splitPlan,
        transform,
        exportSettings,
        signal: controller.signal,
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
        },
      });

      setProgress({
        completed: output.tiles.length,
        total: output.tiles.length,
        currentFilename: "",
        phase: "packaging",
      });

      const zipBlob = await createTilesZipBlob(output.tiles);
      const zipFilename = buildZipFilename(sourceImage.name, gridConfig);

      // Urutkan daftar unduhan satuan mulai dari #1 (yang pertama diposting) hingga #N
      const sortedTiles = [...output.tiles].sort((a, b) => a.uploadOrder - b.uploadOrder);
      const newItems: GeneratedTilePreview[] = sortedTiles.map((tile) => ({
        tile,
        thumbnailUrl: URL.createObjectURL(tile.blob),
      }));

      setResultSummary((prev) => {
        if (prev) {
          revokePreviewList(prev.items);
        }
        return {
          imageId: sourceImage.id,
          configFingerprint: currentFingerprint,
          actualFormat: output.actualFormat,
          usedFallbackFormat: output.usedFallbackFormat,
          zipBlob,
          zipFilename,
          items: newItems,
        };
      });

      if (mode === "zip") {
        if (sortedTiles.length === 1) {
          triggerBrowserDownload(sortedTiles[0].blob, sortedTiles[0].filename);
          setSavedOrders([sortedTiles[0].uploadOrder]);
        } else {
          triggerBrowserDownload(zipBlob, zipFilename);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Terjadi kendala saat memproses gambar.";
      setExportError(message);
    } finally {
      abortControllerRef.current = null;
      setIsExporting(false);
    }
  };

  const handleShareToDevice = async () => {
    if (!activeResult || !canShareFiles || shareableFiles.length === 0) {
      return;
    }
    setShareFeedback(null);
    try {
      await navigator.share({
        files: shareableFiles,
        title: `PotongFeed (${shareableFiles.length} foto siap upload ke IG)`,
      });
      setSavedOrders(activeResult.items.map((item) => item.tile.uploadOrder));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setShareFeedback(
        "Simpan langsung lewat menu Bagikan belum didukung untuk banyak file di perangkat ini. Gunakan tombol Unduh Semua Satu-Satu di bawah.",
      );
    }
  };

  const handleDownloadAllSequentially = async () => {
    if (!activeResult || isDownloadingBatch) {
      return;
    }
    const runId = activeRunRef.current;
    setIsDownloadingBatch(true);
    setShareFeedback(null);

    try {
      for (let index = 0; index < activeResult.items.length; index += 1) {
        if (activeRunRef.current !== runId) {
          return;
        }
        const { tile } = activeResult.items[index];
        triggerBrowserDownload(tile.blob, tile.filename);
        handleMarkSaved(tile.uploadOrder);
        if (index < activeResult.items.length - 1) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 220);
          });
        }
      }
    } finally {
      if (activeRunRef.current === runId) {
        setIsDownloadingBatch(false);
      }
    }
  };

  const { geometry } = splitPlan;
  const totalTiles = splitPlan.tiles.length;
  const formatLabel =
    exportSettings.format === "jpeg" ? "JPG" : exportSettings.format.toUpperCase();
  const estimatedSize = estimateOutputSizeBytes(sourceImage, geometry, totalTiles, exportSettings);
  const optimizationHint = getExportOptimizationHint(exportSettings, estimatedSize.perTileBytes);
  const optimizationHintConfig =
    optimizationHint === "use-ig-preset"
      ? {
          description: (
            <>
              Ukuran besar karena memakai <strong>Ukuran Asli Foto</strong>. Untuk Instagram, lebar
              maksimal foto tetap 1080 px.
            </>
          ),
          buttonLabel: "Pakai Optimal IG (JPG · 1080 px)",
          onApply: () =>
            onChangeExportSettings({
              ...exportSettings,
              format: "jpeg",
              resolutionMode: "ig-1080",
            }),
        }
      : optimizationHint === "use-jpeg"
        ? {
            description: (
              <>
                Untuk foto kamera biasa, format <strong>JPG</strong> jauh lebih ringan dan cepat
                di-upload ke Instagram.
              </>
            ),
            buttonLabel: "Ganti ke JPG",
            onApply: () => onChangeExportSettings({ ...exportSettings, format: "jpeg" }),
          }
        : null;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-900 uppercase">
          Unduh Hasil Potongan
        </h2>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
          {totalTiles === 1 ? "1 foto · Kualitas Jernih" : `${totalTiles} kotak · Kualitas Jernih`}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-700">Format Gambar</span>
          {exportSettings.format === "webp" ? (
            <span className="text-[11px] font-semibold text-indigo-700">
              Sedang memakai WebP (Opsional)
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {QUICK_FORMAT_OPTIONS.map((option) => {
            const active = exportSettings.format === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={isExporting}
                onClick={() => onChangeExportSettings({ ...exportSettings, format: option.value })}
                className={`rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-50 ${
                  active
                    ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600/20"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }`}
              >
                <div className="text-[11px] font-bold">{option.label}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-zinc-500">{option.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-3 py-2 text-[11px] text-zinc-600">
        {totalTiles === 1 ? (
          <span>
            Estimasi ukuran file:{" "}
            <strong className="font-mono text-zinc-900">
              ~{formatFileSizeBytes(estimatedSize.totalBytes)}
            </strong>{" "}
            ({formatLabel})
          </span>
        ) : (
          <span>
            Estimasi ukuran:{" "}
            <strong className="font-mono text-zinc-900">
              ~{formatFileSizeBytes(estimatedSize.totalBytes)} total
            </strong>{" "}
            <span className="text-zinc-500">
              (~{formatFileSizeBytes(estimatedSize.perTileBytes)} / foto · {formatLabel})
            </span>
          </span>
        )}

        {optimizationHintConfig ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/90 bg-amber-50/85 px-2.5 py-1.5 text-[11px] text-amber-950">
            <span className="leading-snug">{optimizationHintConfig.description}</span>
            <button
              type="button"
              disabled={isExporting}
              onClick={optimizationHintConfig.onApply}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 shadow-2xs transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
            >
              {optimizationHintConfig.buttonLabel}
            </button>
          </div>
        ) : null}
      </div>

      {isExporting && progress ? (
        <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-indigo-950">
            <span>
              {progress.phase === "decoding"
                ? "Menyiapkan foto kamu..."
                : progress.phase === "packaging"
                  ? "Menyiapkan file unduhan..."
                  : `Memotong bagian ${progress.completed} dari ${progress.total}...`}
            </span>
            <button
              type="button"
              onClick={handleCancelExport}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
            >
              Batalkan
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
            <div
              style={{
                width: `${Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%`,
              }}
              className="h-full rounded-full bg-indigo-600 transition-all"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void handleRunExport("zip")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <span>
              {totalTiles === 1 ? "Simpan Foto Hasil Potong" : "Unduh Semua Sekaligus (.ZIP)"}
            </span>
          </button>

          {totalTiles > 1 ? (
            <button
              type="button"
              onClick={() => void handleRunExport("single")}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700"
            >
              <span>Potong &amp; Simpan Satu-Satu (Mudah di HP)</span>
            </button>
          ) : null}
        </div>
      )}

      <details className="group rounded-xl border border-zinc-200/80 bg-zinc-50/40 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-700 hover:text-zinc-950">
          <span>Pengaturan Ukuran &amp; WebP (Opsional)</span>
          <span className="text-[11px] text-zinc-400 transition group-open:rotate-180">▾</span>
        </summary>

        <div className="mt-3 space-y-3 border-t border-zinc-200/80 pt-3">
          <div className="rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-[11px] text-zinc-600">
            <div className="flex items-center justify-between">
              <span>Ukuran hasil per kotak</span>
              <strong className="font-mono text-zinc-900">
                {geometry.tileWidth} × {geometry.tileHeight} px ({formatLabel})
              </strong>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
              {exportSettings.resolutionMode === "ig-1080"
                ? "Ukuran pas standar Instagram supaya langsung tajam."
                : "Mengikuti piksel penuh dari foto asli (ukuran file lebih besar)."}
            </p>
          </div>

          <div>
            <span className="text-xs font-medium text-zinc-700">Format Alternatif (WebP)</span>
            <button
              type="button"
              disabled={isExporting}
              onClick={() =>
                onChangeExportSettings({
                  ...exportSettings,
                  format: exportSettings.format === "webp" ? "png" : "webp",
                })
              }
              className={`mt-1.5 w-full rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-50 ${
                exportSettings.format === "webp"
                  ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600/20"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold">WebP · Ringan &amp; Tajam</span>
                <span className="text-[10px] font-semibold text-indigo-700">
                  {exportSettings.format === "webp" ? "Aktif ✓ (Klik untuk batal)" : "Pakai WebP"}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-zinc-500">
                {!capabilities.supportsWebpExport
                  ? "Otomatis ke PNG jernih di browser ini"
                  : "Alternatif modern berukuran ringan (didukung browser & perangkat terbaru)"}
              </div>
            </button>
          </div>

          {exportSettings.format !== "png" ? (
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="quality-range" className="font-medium text-zinc-700">
                  Ketajaman Gambar
                </label>
                <span className="font-mono text-[11px] font-semibold text-zinc-900">
                  {Math.round((exportSettings.quality || DEFAULT_EXPORT_QUALITY) * 100)}%
                </span>
              </div>
              <input
                id="quality-range"
                type="range"
                min={MIN_EXPORT_QUALITY}
                max={MAX_EXPORT_QUALITY}
                step={0.01}
                disabled={isExporting}
                value={exportSettings.quality}
                onChange={(event) =>
                  onChangeExportSettings({
                    ...exportSettings,
                    quality: Number(event.target.value),
                  })
                }
                className="mt-1.5 w-full accent-indigo-600"
              />
            </div>
          ) : null}

          <div>
            <span className="text-xs font-medium text-zinc-700">Pilihan Ukuran</span>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {RESOLUTION_OPTIONS.map((option) => {
                const active = exportSettings.resolutionMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isExporting}
                    onClick={() =>
                      onChangeExportSettings({ ...exportSettings, resolutionMode: option.value })
                    }
                    className={`rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-50 ${
                      active
                        ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600/20"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    <div className="text-[11px] font-bold">{option.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-zinc-500">
                      {option.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </details>

      {exportError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {exportError}
        </div>
      ) : null}

      {activeResult ? (
        <div className="space-y-3 border-t border-zinc-200 pt-4">
          {isResultOutdated ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
              Posisi foto atau ukuran grid baru saja kamu ubah. Klik tombol di atas untuk
              memperbarui potongan gambar.
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold text-zinc-950">
              {activeResult.items.length === 1
                ? "Siap Diposting (1 foto utuh)"
                : `Siap Diposting (${activeResult.items.length} potongan)`}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {activeResult.items.length === 1 ? (
                "Foto sudah siap untuk langsung kamu upload ke Instagram:"
              ) : (
                <>
                  Simpan &amp; posting berurutan mulai dari{" "}
                  <strong className="text-emerald-700">#1</strong> sampai{" "}
                  <strong>#{activeResult.items.length}</strong>:
                </>
              )}
            </p>
          </div>

          {canShareFiles || activeResult.items.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {canShareFiles ? (
                <button
                  type="button"
                  onClick={() => void handleShareToDevice()}
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-2xs transition hover:bg-emerald-700"
                >
                  Bagikan / Simpan ke HP
                </button>
              ) : null}

              {activeResult.items.length > 1 ? (
                <>
                  <button
                    type="button"
                    disabled={isDownloadingBatch}
                    onClick={() => void handleDownloadAllSequentially()}
                    className="inline-flex flex-1 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                  >
                    {isDownloadingBatch
                      ? "Mengunduh berurutan..."
                      : `Unduh Semua Satu-Satu (#1 → #${activeResult.items.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerBrowserDownload(activeResult.zipBlob, activeResult.zipFilename)
                    }
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-indigo-300 hover:text-indigo-700"
                  >
                    Unduh Paket .ZIP ({formatFileSizeBytes(activeResult.zipBlob.size)})
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {shareFeedback ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              {shareFeedback}
            </p>
          ) : null}

          {activeResult.usedFallbackFormat ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-600">
              Disimpan otomatis sebagai <strong>PNG jernih</strong> agar didukung penuh oleh browser
              kamu.
            </p>
          ) : null}

          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {activeResult.items.map(({ tile, thumbnailUrl }) => {
              const isSaved = savedSet.has(tile.uploadOrder);
              const stepCopy = getUploadStepCopy(tile.uploadOrder, activeResult.items.length);

              return (
                <div
                  key={tile.filename}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Thumbnail Object URL lokal hasil render */}
                    <img
                      src={thumbnailUrl}
                      alt={tile.filename}
                      className="h-10 w-8 shrink-0 rounded border border-zinc-200 bg-white object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.2 font-mono text-[10px] font-bold ${
                            tile.uploadOrder === 1
                              ? "bg-emerald-600 text-white"
                              : "bg-zinc-200 text-zinc-800"
                          }`}
                        >
                          #{tile.uploadOrder}
                        </span>
                        <p className="truncate text-xs font-semibold text-zinc-900">
                          {stepCopy.title}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                        {stepCopy.subtitle} • {formatFileSizeBytes(tile.blob.size)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      triggerBrowserDownload(tile.blob, tile.filename);
                      handleMarkSaved(tile.uploadOrder);
                    }}
                    className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      isSaved
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-zinc-200 bg-white text-zinc-800 hover:border-indigo-300 hover:text-indigo-700"
                    }`}
                  >
                    {isSaved ? "Tersimpan ✓" : "Simpan"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
