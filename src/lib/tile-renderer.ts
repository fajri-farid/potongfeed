import {
  DEFAULT_EXPORT_QUALITY,
  MAX_EXPORT_QUALITY,
  MIN_EXPORT_QUALITY,
  clamp,
  computeCoverRect,
  formatTileFilename,
  normalizeHexColor,
} from "@/lib/grid-geometry";
import type {
  CompositionTransform,
  ExportFormat,
  ExportSettings,
  GridSplitPlan,
  TileSlicePlan,
  TileSliceResult,
} from "@/types/editor";

export interface Canvas2DContextLike {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  fillStyle: string | CanvasGradient | CanvasPattern;
  filter?: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

export interface RenderCanvasLike {
  width: number;
  height: number;
  getContext(contextId: "2d"): Canvas2DContextLike | null;
  convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>;
  toBlob?: (callback: BlobCallback, type?: string, quality?: number) => void;
}

export type CanvasFactory = (width: number, height: number) => RenderCanvasLike;

export interface RenderTilesOutput {
  tiles: TileSliceResult[];
  actualFormat: ExportFormat;
  usedFallbackFormat: boolean;
}

interface ResolvedEncodingSpec {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
}

const MIME_TO_FORMAT_MAP: Record<string, ExportFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

/** Menyelesaikan pasangan MIME type dan parameter kualitas untuk format ekspor HD. */
export function resolveEncodingSpec(settings: ExportSettings): ResolvedEncodingSpec {
  if (settings.format === "png") {
    return { mimeType: "image/png" };
  }

  const safeQuality = clamp(
    settings.quality,
    MIN_EXPORT_QUALITY,
    MAX_EXPORT_QUALITY,
    DEFAULT_EXPORT_QUALITY,
  );

  if (settings.format === "webp") {
    return { mimeType: "image/webp", quality: safeQuality };
  }

  return { mimeType: "image/jpeg", quality: safeQuality };
}

/** Memilih warna latar solid atau menentukan kebutuhan latar blur/transparan pada tile. */
export function resolveTileBackdropColor(
  transform: CompositionTransform,
  format: ExportFormat,
): string | null {
  if (transform.fitMode === "fill") {
    return format === "jpeg" ? "#FFFFFF" : null;
  }

  if (transform.backgroundType === "white") {
    return "#FFFFFF";
  }
  if (transform.backgroundType === "black") {
    return "#000000";
  }
  if (transform.backgroundType === "custom") {
    return normalizeHexColor(transform.backgroundHex, "#FFFFFF");
  }
  return "#18181B";
}

/** Mengubah elemen `<canvas>` atau `OffscreenCanvas` menjadi `Blob` terstandarisasi. */
export async function canvasLikeToBlob(
  canvas: RenderCanvasLike,
  spec: ResolvedEncodingSpec,
): Promise<Blob> {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob(
      spec.quality !== undefined
        ? { type: spec.mimeType, quality: spec.quality }
        : { type: spec.mimeType },
    );
  }

  if (typeof canvas.toBlob === "function") {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob?.(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas gagal mengodekan gambar tile ke Blob."));
            return;
          }
          resolve(blob);
        },
        spec.mimeType,
        spec.quality,
      );
    });
  }

  throw new Error("Objek kanvas tidak mendukung convertToBlob maupun toBlob.");
}

function buildSeamlessBlurredBackdrop(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  splitPlan: GridSplitPlan,
  createCanvas: CanvasFactory,
): {
  canvas: RenderCanvasLike;
  tileUnitWidth: number;
  tileUnitHeight: number;
} {
  const tileUnitWidth = 180;
  const tileUnitHeight = Math.max(
    60,
    Math.round(tileUnitWidth / splitPlan.geometry.tileAspectRatio),
  );
  const masterBackdropW = tileUnitWidth * splitPlan.geometry.columns;
  const masterBackdropH = tileUnitHeight * splitPlan.geometry.rows;

  const backdropCanvas = createCanvas(masterBackdropW, masterBackdropH);
  const ctx = backdropCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("Konteks 2D tidak tersedia untuk menyiapkan latar blur.");
  }

  ctx.fillStyle = "#18181B";
  ctx.fillRect(0, 0, masterBackdropW, masterBackdropH);

  const coverRect = computeCoverRect(sourceWidth, sourceHeight, masterBackdropW, masterBackdropH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if ("filter" in ctx) {
    ctx.filter = "blur(18px)";
    const bleed = 36;
    ctx.drawImage(
      source,
      coverRect.x - bleed,
      coverRect.y - bleed,
      coverRect.width + bleed * 2,
      coverRect.height + bleed * 2,
    );
    ctx.filter = "none";
  } else {
    // Fallback blur halus saat OffscreenCanvas browser lama belum mendukung ctx.filter
    const lowResW = Math.max(16, Math.round(masterBackdropW / 12));
    const lowResH = Math.max(16, Math.round(masterBackdropH / 12));
    const tinyCanvas = createCanvas(lowResW, lowResH);
    const tinyCtx = tinyCanvas.getContext("2d");
    if (tinyCtx) {
      tinyCtx.imageSmoothingEnabled = true;
      tinyCtx.imageSmoothingQuality = "high";
      const tinyCover = computeCoverRect(sourceWidth, sourceHeight, lowResW, lowResH);
      tinyCtx.drawImage(source, tinyCover.x, tinyCover.y, tinyCover.width, tinyCover.height);
      ctx.drawImage(
        tinyCanvas as unknown as CanvasImageSource,
        0,
        0,
        masterBackdropW,
        masterBackdropH,
      );
    } else {
      ctx.drawImage(source, coverRect.x, coverRect.y, coverRect.width, coverRect.height);
    }
  }

  // Dimming ringan agar foto utama tetap menonjol di atas latar blur
  ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
  ctx.fillRect(0, 0, masterBackdropW, masterBackdropH);

  return {
    canvas: backdropCanvas,
    tileUnitWidth,
    tileUnitHeight,
  };
}

function drawSingleTileToCanvas(params: {
  canvas: RenderCanvasLike;
  source: CanvasImageSource;
  tilePlan: TileSlicePlan;
  transform: CompositionTransform;
  format: ExportFormat;
  blurredBackdrop: {
    canvas: RenderCanvasLike;
    tileUnitWidth: number;
    tileUnitHeight: number;
  } | null;
}): void {
  const { canvas, source, tilePlan, transform, format, blurredBackdrop } = params;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Konteks 2D kanvas tidak tersedia saat merender tile.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (transform.fitMode === "fit" && transform.backgroundType === "blur" && blurredBackdrop) {
    const masterBackdropW = blurredBackdrop.canvas.width || blurredBackdrop.tileUnitWidth * 3;
    const masterBackdropH = blurredBackdrop.canvas.height || blurredBackdrop.tileUnitHeight * 3;
    const sx = tilePlan.normalizedTileRect.x * masterBackdropW;
    const sy = tilePlan.normalizedTileRect.y * masterBackdropH;
    const sw = tilePlan.normalizedTileRect.width * masterBackdropW;
    const sh = tilePlan.normalizedTileRect.height * masterBackdropH;
    ctx.drawImage(
      blurredBackdrop.canvas as unknown as CanvasImageSource,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  } else {
    const backdropColor = resolveTileBackdropColor(transform, format);
    if (backdropColor) {
      ctx.fillStyle = backdropColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  if (tilePlan.sourceCropRect && tilePlan.tileDestRect) {
    const { x: sx, y: sy, width: sw, height: sh } = tilePlan.sourceCropRect;
    const { x: dx, y: dy, width: dw, height: dh } = tilePlan.tileDestRect;
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

async function yieldExecutionTick(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Merender seluruh potongan grid secara **tile demi tile** memakai kanvas berukuran 1 tile
 * (menghindari batas kanvas raksasa Safari/iOS) dan menghasilkan array terurut sesuai `uploadOrder`.
 */
export async function renderAllTileSlices(params: {
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  splitPlan: GridSplitPlan;
  transform: CompositionTransform;
  exportSettings: ExportSettings;
  createCanvas: CanvasFactory;
  yieldBetweenTiles?: boolean;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, currentFilename: string) => void;
}): Promise<RenderTilesOutput> {
  const {
    source,
    sourceWidth,
    sourceHeight,
    splitPlan,
    transform,
    exportSettings,
    createCanvas,
    yieldBetweenTiles = false,
    signal,
    onProgress,
  } = params;

  const encodingSpec = resolveEncodingSpec(exportSettings);
  const orderedPlans = [...splitPlan.tiles].sort((a, b) => a.uploadOrder - b.uploadOrder);
  const total = orderedPlans.length;

  const blurredBackdrop =
    transform.fitMode === "fit" && transform.backgroundType === "blur"
      ? buildSeamlessBlurredBackdrop(source, sourceWidth, sourceHeight, splitPlan, createCanvas)
      : null;

  const results: TileSliceResult[] = [];
  let actualFormat: ExportFormat = exportSettings.format;
  let usedFallbackFormat = false;

  try {
    for (let index = 0; index < orderedPlans.length; index += 1) {
      if (signal?.aborted) {
        throw new Error("CANCELLED");
      }

      const tilePlan = orderedPlans[index];
      const tileCanvas = createCanvas(
        tilePlan.masterTileRect.width,
        tilePlan.masterTileRect.height,
      );
      const tileWidth = tileCanvas.width;
      const tileHeight = tileCanvas.height;

      try {
        drawSingleTileToCanvas({
          canvas: tileCanvas,
          source,
          tilePlan,
          transform,
          format: exportSettings.format,
          blurredBackdrop,
        });

        const blob = await canvasLikeToBlob(tileCanvas, encodingSpec);
        const detectedFormat = MIME_TO_FORMAT_MAP[blob.type.toLowerCase()];
        if (detectedFormat && detectedFormat !== exportSettings.format) {
          actualFormat = detectedFormat;
          usedFallbackFormat = true;
        }

        const resolvedFilename =
          actualFormat === exportSettings.format
            ? tilePlan.filename
            : formatTileFilename(tilePlan.uploadOrder, tilePlan.row, tilePlan.col, actualFormat);

        results.push({
          row: tilePlan.row,
          col: tilePlan.col,
          uploadOrder: tilePlan.uploadOrder,
          filename: resolvedFilename,
          width: tileWidth,
          height: tileHeight,
          blob,
        });

        onProgress?.(index + 1, total, resolvedFilename);
      } finally {
        // Segera lepas backing store kanvas per tile agar memori Safari/mobile tetap aman
        tileCanvas.width = 0;
        tileCanvas.height = 0;
      }

      if (yieldBetweenTiles && index < orderedPlans.length - 1) {
        await yieldExecutionTick();
      }
    }
  } finally {
    if (blurredBackdrop) {
      blurredBackdrop.canvas.width = 0;
      blurredBackdrop.canvas.height = 0;
    }
  }

  return {
    tiles: results,
    actualFormat,
    usedFallbackFormat,
  };
}
