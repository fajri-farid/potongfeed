import { zipSync, type Zippable } from "fflate";
import {
  DEFAULT_EXPORT_QUALITY,
  MAX_EXPORT_QUALITY,
  MIN_EXPORT_QUALITY,
  clamp,
} from "@/lib/grid-geometry";
import {
  decodeSourceImageFromFile,
  detectBrowserImageCapabilities,
  type DecodedBitmapHandle,
} from "@/lib/image-loader";
import {
  renderAllTileSlices,
  type CanvasFactory,
  type RenderCanvasLike,
} from "@/lib/tile-renderer";
import type {
  CompositionTransform,
  ExportPipelineResult,
  ExportProgress,
  ExportSettings,
  GridLayoutConfig,
  GridSplitPlan,
  MasterCanvasGeometry,
  SourceImageMeta,
  SplitterWorkerRequest,
  SplitterWorkerResponse,
  TileSliceResult,
} from "@/types/editor";

export interface MinimalWorkerClient {
  onmessage: ((event: MessageEvent<SplitterWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: SplitterWorkerRequest) => void;
  terminate: () => void;
}

export interface ExportGridTilesOptions {
  file: File;
  splitPlan: GridSplitPlan;
  transform: CompositionTransform;
  exportSettings: ExportSettings;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
  workerFactory?: () => MinimalWorkerClient;
  mainThreadCanvasFactory?: CanvasFactory;
  decodeSource?: (file: File) => Promise<DecodedBitmapHandle>;
}

/** Membungkus pasangan nama file dan byte array menjadi arsip ZIP (store level 0, tanpa kehilangan kualitas). */
export function bundleNamedEntriesToZip(
  entries: Array<{ filename: string; bytes: Uint8Array }>,
): Uint8Array {
  if (entries.length === 0) {
    throw new Error("Tidak ada tile gambar yang dapat dikemas ke dalam arsip ZIP.");
  }

  const zipInput: Zippable = {};
  for (const entry of entries) {
    // Level 0 (store): file PNG/JPEG/WebP sudah terkompresi biner, menghemat CPU & waktu di browser
    zipInput[entry.filename] = [entry.bytes, { level: 0 }];
  }
  return zipSync(zipInput);
}

/** Menghasilkan nama file ZIP ekspor yang bersih dan aman untuk sistem berkas. */
export function buildZipFilename(sourceFilename: string, gridConfig: GridLayoutConfig): string {
  const withoutExt = sourceFilename.replace(/\.[^/.]+$/, "");
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const safeSlug = slug || "gambar";
  return `potongfeed_${safeSlug}_${gridConfig.columns}x${gridConfig.rows}.zip`;
}

/** Mengemas hasil potongan `TileSliceResult[]` menjadi `Blob` arsip `.zip` siap unduh. */
export async function createTilesZipBlob(tiles: TileSliceResult[]): Promise<Blob> {
  const entries = await Promise.all(
    tiles.map(async (tile) => ({
      filename: tile.filename,
      bytes: new Uint8Array(await tile.blob.arrayBuffer()),
    })),
  );

  const zipBytes = bundleNamedEntriesToZip(entries);
  return new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
}

/** Memicu unduhan berkas `Blob` secara lokal di browser dan membersihkan Object URL setelahnya. */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Pengunduhan file hanya dapat dijalankan di browser.");
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function createJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultWorker(): MinimalWorkerClient {
  return new Worker(new URL("../workers/splitter.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as MinimalWorkerClient;
}

function runWorkerExport(params: {
  workerFactory: () => MinimalWorkerClient;
  file: File;
  splitPlan: GridSplitPlan;
  transform: CompositionTransform;
  exportSettings: ExportSettings;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}): Promise<ExportPipelineResult> {
  const { workerFactory, file, splitPlan, transform, exportSettings, onProgress, signal } = params;
  const jobId = createJobId();

  return new Promise<ExportPipelineResult>((resolve, reject) => {
    let worker: MinimalWorkerClient;
    try {
      worker = workerFactory();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("OFFSCREEN_UNSUPPORTED"));
      return;
    }

    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      worker.postMessage({ type: "cancel", jobId });
      cleanup();
      reject(new Error("CANCELLED"));
    };

    if (signal?.aborted) {
      cleanup();
      reject(new Error("CANCELLED"));
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });

    worker.onmessage = (event: MessageEvent<SplitterWorkerResponse>) => {
      const payload = event.data;
      if (!payload || payload.jobId !== jobId) {
        return;
      }

      if (payload.type === "progress") {
        onProgress?.({
          completed: payload.completed,
          total: payload.total,
          currentFilename: payload.currentFilename,
          phase: "slicing",
        });
        return;
      }

      if (payload.type === "complete") {
        settled = true;
        cleanup();
        resolve({
          tiles: payload.tiles,
          executionMode: "worker",
          actualFormat: payload.actualFormat,
          usedFallbackFormat: payload.usedFallbackFormat,
        });
        return;
      }

      if (payload.type === "error") {
        settled = true;
        cleanup();
        if (payload.code === "OFFSCREEN_UNSUPPORTED" || payload.code === "CANCELLED") {
          reject(new Error(payload.code));
        } else {
          reject(new Error(payload.message));
        }
      }
    };

    worker.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("OFFSCREEN_UNSUPPORTED"));
    };

    onProgress?.({
      completed: 0,
      total: splitPlan.tiles.length,
      currentFilename: "",
      phase: "decoding",
    });

    worker.postMessage({
      type: "split",
      jobId,
      file,
      splitPlan,
      transform,
      exportSettings,
    });
  });
}

async function runMainThreadExport(params: {
  file: File;
  splitPlan: GridSplitPlan;
  transform: CompositionTransform;
  exportSettings: ExportSettings;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
  mainThreadCanvasFactory?: CanvasFactory;
  decodeSource?: (file: File) => Promise<DecodedBitmapHandle>;
}): Promise<ExportPipelineResult> {
  if (!params.mainThreadCanvasFactory && typeof document === "undefined") {
    throw new Error("Lingkungan browser diperlukan untuk fallback rendering kanvas.");
  }

  params.onProgress?.({
    completed: 0,
    total: params.splitPlan.tiles.length,
    currentFilename: "",
    phase: "decoding",
  });

  const decoded = await (params.decodeSource ?? decodeSourceImageFromFile)(params.file);
  try {
    const createHtmlCanvas: CanvasFactory =
      params.mainThreadCanvasFactory ??
      ((width, height) => {
        const el = document.createElement("canvas");
        el.width = width;
        el.height = height;
        return el as unknown as RenderCanvasLike;
      });

    const output = await renderAllTileSlices({
      source: decoded.source,
      sourceWidth: decoded.naturalWidth,
      sourceHeight: decoded.naturalHeight,
      splitPlan: params.splitPlan,
      transform: params.transform,
      exportSettings: params.exportSettings,
      createCanvas: createHtmlCanvas,
      yieldBetweenTiles: true,
      signal: params.signal,
      onProgress: (completed, total, currentFilename) => {
        params.onProgress?.({
          completed,
          total,
          currentFilename,
          phase: "slicing",
        });
      },
    });

    return {
      tiles: output.tiles,
      executionMode: "main-thread",
      actualFormat: output.actualFormat,
      usedFallbackFormat: output.usedFallbackFormat,
    };
  } finally {
    decoded.close();
  }
}

/**
 * Orkestrator utama pemotongan gambar resolusi penuh di sisi klien:
 * mengutamakan Web Worker (`OffscreenCanvas`) dan jatuh mulus ke main-thread `<canvas>`
 * apabila browser tidak mendukungnya.
 */
export async function exportGridTiles(
  options: ExportGridTilesOptions,
): Promise<ExportPipelineResult> {
  const capabilities = detectBrowserImageCapabilities();
  const canTryWorker =
    Boolean(options.workerFactory) ||
    (capabilities.supportsWebWorker && capabilities.supportsOffscreenCanvas);

  if (canTryWorker) {
    try {
      return await runWorkerExport({
        workerFactory: options.workerFactory ?? createDefaultWorker,
        file: options.file,
        splitPlan: options.splitPlan,
        transform: options.transform,
        exportSettings: options.exportSettings,
        onProgress: options.onProgress,
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.message === "CANCELLED")) {
        throw new Error("Proses ekspor dibatalkan oleh pengguna.");
      }
      if (!(error instanceof Error) || error.message !== "OFFSCREEN_UNSUPPORTED") {
        throw error;
      }
    }
  }

  return runMainThreadExport({
    file: options.file,
    splitPlan: options.splitPlan,
    transform: options.transform,
    exportSettings: options.exportSettings,
    onProgress: options.onProgress,
    signal: options.signal,
    mainThreadCanvasFactory: options.mainThreadCanvasFactory,
    decodeSource: options.decodeSource,
  });
}

export const IG_LARGE_TILE_THRESHOLD_BYTES = 1.5 * 1024 * 1024;

export type ExportOptimizationHint = "use-ig-preset" | "use-jpeg" | null;

/**
 * Memperkirakan ukuran berkas hasil per foto dan total unduhan berdasarkan dimensi
 * potongan, kepadatan piksel foto sumber, serta format (`png`, `jpeg`, `webp`).
 */
export function estimateOutputSizeBytes(
  sourceImage: Pick<SourceImageMeta, "naturalWidth" | "naturalHeight" | "fileSizeBytes">,
  geometry: Pick<MasterCanvasGeometry, "tileWidth" | "tileHeight">,
  totalTiles: number,
  exportSettings: ExportSettings,
): { perTileBytes: number; totalBytes: number } {
  const tilePixels = Math.max(1, geometry.tileWidth * geometry.tileHeight);
  const sourcePixels = Math.max(1, sourceImage.naturalWidth * sourceImage.naturalHeight);
  const sourceBpp = clamp(sourceImage.fileSizeBytes / sourcePixels, 0.18, 2.2, 0.75);
  const safeQuality = clamp(
    exportSettings.quality,
    MIN_EXPORT_QUALITY,
    MAX_EXPORT_QUALITY,
    DEFAULT_EXPORT_QUALITY,
  );
  const qualityMultiplier = 0.7 + (safeQuality - 0.9) * 3;

  let bpp: number;
  if (exportSettings.format === "png") {
    bpp = clamp(sourceBpp * 1.35, 0.45, 1.65, 1.0);
  } else if (exportSettings.format === "webp") {
    bpp = clamp(sourceBpp * 0.42, 0.12, 0.45, 0.28) * qualityMultiplier;
  } else {
    bpp = clamp(sourceBpp * 0.55, 0.16, 0.55, 0.35) * qualityMultiplier;
  }

  const perTileBytes = Math.max(25 * 1024, Math.round(tilePixels * bpp));
  const totalBytes = perTileBytes * Math.max(1, totalTiles);
  return { perTileBytes, totalBytes };
}

/**
 * Menentukan saran optimasi ukuran berkas yang paling sesuai:
 * 1) Jika memakai `native` dan per foto >= 1,5 MB, sarankan setelan optimal IG (`JPG · 1080 px`).
 * 2) Jika sudah di `ig-1080` memakai `png` dan per foto >= 1,5 MB, sarankan ganti ke `JPG`.
 */
export function getExportOptimizationHint(
  exportSettings: Pick<ExportSettings, "format" | "resolutionMode">,
  perTileBytes: number,
): ExportOptimizationHint {
  if (!Number.isFinite(perTileBytes) || perTileBytes < IG_LARGE_TILE_THRESHOLD_BYTES) {
    return null;
  }
  if (exportSettings.resolutionMode === "native") {
    return "use-ig-preset";
  }
  if (exportSettings.format === "png") {
    return "use-jpeg";
  }
  return null;
}
