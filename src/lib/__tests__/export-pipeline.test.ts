import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMPOSITION_TRANSFORM,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_GRID_CONFIG,
  computeTileCropPlans,
} from "@/lib/grid-geometry";
import {
  IG_LARGE_TILE_THRESHOLD_BYTES,
  buildZipFilename,
  bundleNamedEntriesToZip,
  createTilesZipBlob,
  estimateOutputSizeBytes,
  exportGridTiles,
  getExportOptimizationHint,
  type MinimalWorkerClient,
} from "@/lib/export-pipeline";
import type { Canvas2DContextLike, RenderCanvasLike } from "@/lib/tile-renderer";
import type { SplitterWorkerRequest, TileSliceResult } from "@/types/editor";

function createTestMainCanvasFactory() {
  return (width: number, height: number): RenderCanvasLike => {
    const ctx: Canvas2DContextLike = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      fillStyle: "#FFFFFF",
      fillRect() {},
      drawImage() {},
    };
    return {
      width,
      height,
      getContext: () => ctx,
      convertToBlob: async () => new Blob([new Uint8Array([9, 8, 7])], { type: "image/png" }),
    };
  };
}

describe("export-pipeline", () => {
  it("membuat nama berkas ZIP yang bersih dan aman", () => {
    expect(buildZipFilename("Liburan Bali (Final)!.JPG", DEFAULT_GRID_CONFIG)).toBe(
      "potongfeed_liburan-bali-final_3x1.zip",
    );
    expect(buildZipFilename("???.png", { aspectPreset: "3:4", columns: 3, rows: 4 })).toBe(
      "potongfeed_gambar_3x4.zip",
    );
  });

  it("membungkus seluruh tile menjadi arsip ZIP lossless yang valid saat di-unzip", async () => {
    const sampleBytes1 = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const sampleBytes2 = new Uint8Array([137, 80, 78, 71, 5, 6, 7, 8]);

    const rawZip = bundleNamedEntriesToZip([
      { filename: "01_potongfeed_b1-k3.png", bytes: sampleBytes1 },
      { filename: "02_potongfeed_b1-k2.png", bytes: sampleBytes2 },
    ]);
    const unpackedRaw = unzipSync(rawZip);
    expect(unpackedRaw["01_potongfeed_b1-k3.png"]).toEqual(sampleBytes1);
    expect(unpackedRaw["02_potongfeed_b1-k2.png"]).toEqual(sampleBytes2);
    expect(() => bundleNamedEntriesToZip([])).toThrow();

    const tileResults: TileSliceResult[] = [
      {
        row: 1,
        col: 3,
        uploadOrder: 1,
        filename: "01_potongfeed_b1-k3.png",
        width: 1080,
        height: 1440,
        blob: new Blob([sampleBytes1], { type: "image/png" }),
      },
      {
        row: 1,
        col: 2,
        uploadOrder: 2,
        filename: "02_potongfeed_b1-k2.png",
        width: 1080,
        height: 1440,
        blob: new Blob([sampleBytes2], { type: "image/png" }),
      },
    ];

    const zipBlob = await createTilesZipBlob(tileResults);
    expect(zipBlob.type).toBe("application/zip");
    const unpackedBlob = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
    expect(unpackedBlob["01_potongfeed_b1-k3.png"]).toEqual(sampleBytes1);
    expect(unpackedBlob["02_potongfeed_b1-k2.png"]).toEqual(sampleBytes2);
  });

  it("menjalankan ekspor via Web Worker dan membersihkan worker saat selesai", async () => {
    const splitPlan = computeTileCropPlans({
      sourceWidth: 3240,
      sourceHeight: 1440,
      gridConfig: { aspectPreset: "3:4", columns: 3, rows: 1 },
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const terminated = vi.fn();
    const fakeWorkerFactory = (): MinimalWorkerClient => {
      const client: MinimalWorkerClient = {
        onmessage: null,
        onerror: null,
        terminate: terminated,
        postMessage(message: SplitterWorkerRequest) {
          if (message.type !== "split") return;
          queueMicrotask(() => {
            client.onmessage?.({
              data: {
                type: "progress",
                jobId: message.jobId,
                completed: 1,
                total: 3,
                currentFilename: "01_potongfeed_b1-k3.png",
              },
            } as MessageEvent);
            client.onmessage?.({
              data: {
                type: "complete",
                jobId: message.jobId,
                actualFormat: "png",
                usedFallbackFormat: false,
                tiles: [
                  {
                    row: 1,
                    col: 3,
                    uploadOrder: 1,
                    filename: "01_potongfeed_b1-k3.png",
                    width: 1080,
                    height: 1440,
                    blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
                  },
                ],
              },
            } as MessageEvent);
          });
        },
      };
      return client;
    };

    const phases: string[] = [];
    const result = await exportGridTiles({
      file: new File([new Uint8Array([1])], "test.png", { type: "image/png" }),
      splitPlan,
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
      workerFactory: fakeWorkerFactory,
      onProgress: (p) => phases.push(`${p.phase}:${p.completed}`),
    });

    expect(result.executionMode).toBe("worker");
    expect(result.tiles).toHaveLength(1);
    expect(phases).toEqual(["decoding:0", "slicing:1"]);
    expect(terminated).toHaveBeenCalledTimes(1);
  });

  it("otomatis jatuh ke fallback main-thread dan memanggil close() saat OffscreenCanvas tidak didukung", async () => {
    const splitPlan = computeTileCropPlans({
      sourceWidth: 3240,
      sourceHeight: 1440,
      gridConfig: { aspectPreset: "3:4", columns: 3, rows: 1 },
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const closeSpy = vi.fn();
    const unsupportedWorkerFactory = (): MinimalWorkerClient => {
      const client: MinimalWorkerClient = {
        onmessage: null,
        onerror: null,
        terminate: vi.fn(),
        postMessage(message: SplitterWorkerRequest) {
          if (message.type !== "split") return;
          queueMicrotask(() => {
            client.onmessage?.({
              data: {
                type: "error",
                jobId: message.jobId,
                code: "OFFSCREEN_UNSUPPORTED",
                message: "OffscreenCanvas tidak tersedia",
              },
            } as MessageEvent);
          });
        },
      };
      return client;
    };

    const result = await exportGridTiles({
      file: new File([new Uint8Array([1])], "test.png", { type: "image/png" }),
      splitPlan,
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
      workerFactory: unsupportedWorkerFactory,
      mainThreadCanvasFactory: createTestMainCanvasFactory(),
      decodeSource: async () => ({
        source: {} as CanvasImageSource,
        naturalWidth: 3240,
        naturalHeight: 1440,
        close: closeSpy,
      }),
    });

    expect(result.executionMode).toBe("main-thread");
    expect(result.tiles).toHaveLength(3);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("mengirim cancel ke worker saat dibatalkan tanpa jatuh ke fallback main-thread", async () => {
    const splitPlan = computeTileCropPlans({
      sourceWidth: 3240,
      sourceHeight: 1440,
      gridConfig: { aspectPreset: "3:4", columns: 3, rows: 1 },
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const controller = new AbortController();
    const postedTypes: string[] = [];
    const terminated = vi.fn();

    const slowWorkerFactory = (): MinimalWorkerClient => ({
      onmessage: null,
      onerror: null,
      terminate: terminated,
      postMessage(message: SplitterWorkerRequest) {
        postedTypes.push(message.type);
        if (message.type === "split") {
          queueMicrotask(() => controller.abort());
        }
      },
    });

    await expect(
      exportGridTiles({
        file: new File([new Uint8Array([1])], "test.png", { type: "image/png" }),
        splitPlan,
        transform: DEFAULT_COMPOSITION_TRANSFORM,
        exportSettings: DEFAULT_EXPORT_SETTINGS,
        workerFactory: slowWorkerFactory,
        signal: controller.signal,
      }),
    ).rejects.toThrow("dibatalkan");

    expect(postedTypes).toEqual(["split", "cancel"]);
    expect(terminated).toHaveBeenCalledTimes(1);
  });

  it("memperkirakan ukuran JPG jauh lebih hemat dan memilih saran optimasi sesuai mode resolusi", () => {
    const sourceMeta = {
      naturalWidth: 3240,
      naturalHeight: 4050,
      fileSizeBytes: 12_000_000,
    };
    const geometry = { tileWidth: 1080, tileHeight: 1350 };

    const pngEstimate = estimateOutputSizeBytes(sourceMeta, geometry, 9, {
      format: "png",
      quality: 0.96,
      resolutionMode: "ig-1080",
    });
    const jpegEstimate = estimateOutputSizeBytes(sourceMeta, geometry, 9, {
      format: "jpeg",
      quality: 0.96,
      resolutionMode: "ig-1080",
    });

    expect(pngEstimate.perTileBytes).toBeGreaterThanOrEqual(IG_LARGE_TILE_THRESHOLD_BYTES);
    expect(jpegEstimate.totalBytes).toBeLessThan(pngEstimate.totalBytes / 2);
    expect(pngEstimate.totalBytes).toBe(pngEstimate.perTileBytes * 9);

    expect(
      getExportOptimizationHint(
        { format: "png", resolutionMode: "ig-1080" },
        pngEstimate.perTileBytes,
      ),
    ).toBe("use-jpeg");
    expect(
      getExportOptimizationHint(
        { format: "png", resolutionMode: "native" },
        pngEstimate.perTileBytes,
      ),
    ).toBe("use-ig-preset");
    expect(
      getExportOptimizationHint(
        { format: "jpeg", resolutionMode: "native" },
        pngEstimate.perTileBytes,
      ),
    ).toBe("use-ig-preset");
    expect(
      getExportOptimizationHint(
        { format: "png", resolutionMode: "ig-1080" },
        IG_LARGE_TILE_THRESHOLD_BYTES - 1,
      ),
    ).toBeNull();
    expect(
      getExportOptimizationHint(
        { format: "jpeg", resolutionMode: "ig-1080" },
        pngEstimate.perTileBytes,
      ),
    ).toBeNull();
  });
});
