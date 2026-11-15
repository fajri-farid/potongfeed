import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION_TRANSFORM,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_GRID_CONFIG,
  computeTileCropPlans,
} from "@/lib/grid-geometry";
import {
  renderAllTileSlices,
  resolveEncodingSpec,
  resolveTileBackdropColor,
  type Canvas2DContextLike,
  type RenderCanvasLike,
} from "@/lib/tile-renderer";

interface RecordedCanvas {
  initialWidth: number;
  initialHeight: number;
  canvas: RenderCanvasLike;
  fillCalls: Array<{ style: string; x: number; y: number; w: number; h: number }>;
  drawCalls: number[][];
  smoothingFlags: boolean[];
  smoothingQualities: ImageSmoothingQuality[];
}

function createMockCanvasFactory(blobMime = "image/png") {
  const allocated: RecordedCanvas[] = [];

  const factory = (width: number, height: number): RenderCanvasLike => {
    const fillCalls: RecordedCanvas["fillCalls"] = [];
    const drawCalls: number[][] = [];
    const smoothingFlags: boolean[] = [];
    const smoothingQualities: ImageSmoothingQuality[] = [];

    const ctx: Canvas2DContextLike = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillStyle: "#000000",
      filter: "none",
      fillRect(x, y, w, h) {
        fillCalls.push({ style: String(this.fillStyle), x, y, w, h });
      },
      drawImage(_img: CanvasImageSource, ...args: number[]) {
        smoothingFlags.push(this.imageSmoothingEnabled);
        smoothingQualities.push(this.imageSmoothingQuality);
        drawCalls.push(args);
      },
    };

    const canvas: RenderCanvasLike = {
      width,
      height,
      getContext: () => ctx,
      convertToBlob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: blobMime }),
    };

    allocated.push({
      initialWidth: width,
      initialHeight: height,
      canvas,
      fillCalls,
      drawCalls,
      smoothingFlags,
      smoothingQualities,
    });

    return canvas;
  };

  return { factory, allocated };
}

describe("tile-renderer", () => {
  it("menyelesaikan spesifikasi encoding PNG lossless serta JPEG/WebP ter-clamp 0.95..1.0", () => {
    expect(
      resolveEncodingSpec({ format: "png", quality: 0.96, resolutionMode: "ig-1080" }),
    ).toEqual({
      mimeType: "image/png",
    });
    expect(
      resolveEncodingSpec({ format: "jpeg", quality: 0.5, resolutionMode: "ig-1080" }),
    ).toEqual({
      mimeType: "image/jpeg",
      quality: 0.95,
    });
    expect(resolveEncodingSpec({ format: "webp", quality: 1.0, resolutionMode: "native" })).toEqual(
      {
        mimeType: "image/webp",
        quality: 1.0,
      },
    );
  });

  it("menentukan warna backdrop sesuai mode Fill/Fit dan menjaga transparansi PNG pada Fill", () => {
    expect(resolveTileBackdropColor(DEFAULT_COMPOSITION_TRANSFORM, "png")).toBeNull();
    expect(resolveTileBackdropColor(DEFAULT_COMPOSITION_TRANSFORM, "jpeg")).toBe("#FFFFFF");
    expect(
      resolveTileBackdropColor(
        {
          ...DEFAULT_COMPOSITION_TRANSFORM,
          fitMode: "fit",
          backgroundType: "custom",
          backgroundHex: "#10b981",
        },
        "png",
      ),
    ).toBe("#10B981");
  });

  it("merender tile satu per satu dengan imageSmoothingQuality high lalu mereset kanvas", async () => {
    const splitPlan = computeTileCropPlans({
      sourceWidth: 3240,
      sourceHeight: 4320,
      gridConfig: { ...DEFAULT_GRID_CONFIG, rows: 3 },
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const { factory, allocated } = createMockCanvasFactory("image/png");
    const progressEvents: number[] = [];

    const output = await renderAllTileSlices({
      source: {} as CanvasImageSource,
      sourceWidth: 3240,
      sourceHeight: 4320,
      splitPlan,
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
      createCanvas: factory,
      onProgress: (completed) => progressEvents.push(completed),
    });

    expect(output.actualFormat).toBe("png");
    expect(output.usedFallbackFormat).toBe(false);
    expect(output.tiles).toHaveLength(9);
    expect(output.tiles[0].filename).toBe("01_potongfeed_b3-k3.png");
    expect(output.tiles[8].filename).toBe("09_potongfeed_b1-k1.png");
    expect(progressEvents).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // Memastikan tidak pernah mengalokasikan 1 kanvas raksasa 3240x4050 (default 4:5 = 1080x1350/tile)
    expect(allocated).toHaveLength(9);
    for (const record of allocated) {
      expect(record.initialWidth).toBe(1080);
      expect(record.initialHeight).toBe(1350);
      expect(record.canvas.width).toBe(0);
      expect(record.canvas.height).toBe(0);
      expect(record.smoothingFlags).toEqual([true]);
      expect(record.smoothingQualities).toEqual(["high"]);
      expect(record.drawCalls[0]).toEqual(expect.arrayContaining([0, 0, 1080, 1350]));
    }
  });

  it("membangun backdrop blur ringan untuk mode Fit tanpa celah antar tile", async () => {
    const blurTransform = {
      ...DEFAULT_COMPOSITION_TRANSFORM,
      fitMode: "fit" as const,
      backgroundType: "blur" as const,
    };
    const splitPlan = computeTileCropPlans({
      sourceWidth: 6000,
      sourceHeight: 2000,
      gridConfig: { ...DEFAULT_GRID_CONFIG, rows: 3 },
      transform: blurTransform,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const { factory, allocated } = createMockCanvasFactory("image/png");
    const output = await renderAllTileSlices({
      source: {} as CanvasImageSource,
      sourceWidth: 6000,
      sourceHeight: 2000,
      splitPlan,
      transform: blurTransform,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
      createCanvas: factory,
    });

    expect(output.tiles).toHaveLength(9);
    // Kanvas pertama adalah backdrop ringan (540x675 untuk default 4:5), sisanya 9 tile 1080x1350
    expect(allocated).toHaveLength(10);
    expect(allocated[0].initialWidth).toBe(540);
    expect(allocated[0].initialHeight).toBe(675);
    expect(allocated[0].canvas.width).toBe(0);
    expect(allocated[0].canvas.height).toBe(0);
    // Baris bawah (uploadOrder #1) hanya berisi latar blur; baris tengah (#4) berisi blur + foto utama
    expect(allocated[1].drawCalls).toHaveLength(1);
    expect(allocated[4].drawCalls).toHaveLength(2);
  });

  it("mendeteksi fallback browser saat WebP di-encode sebagai PNG dan menyesuaikan ekstensi file", async () => {
    const splitPlan = computeTileCropPlans({
      sourceWidth: 3240,
      sourceHeight: 1440,
      gridConfig: { aspectPreset: "3:4", columns: 3, rows: 1 },
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: { format: "webp", quality: 0.96, resolutionMode: "ig-1080" },
    });

    const { factory } = createMockCanvasFactory("image/png");
    const output = await renderAllTileSlices({
      source: {} as CanvasImageSource,
      sourceWidth: 3240,
      sourceHeight: 1440,
      splitPlan,
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: { format: "webp", quality: 0.96, resolutionMode: "ig-1080" },
      createCanvas: factory,
    });

    expect(output.usedFallbackFormat).toBe(true);
    expect(output.actualFormat).toBe("png");
    expect(output.tiles[0].filename).toBe("01_potongfeed_b1-k3.png");
  });

  it("menghentikan rendering apabila AbortSignal dibatalkan", async () => {
    const splitPlan = computeTileCropPlans({
      sourceWidth: 3240,
      sourceHeight: 4320,
      gridConfig: DEFAULT_GRID_CONFIG,
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const controller = new AbortController();
    controller.abort();
    const { factory } = createMockCanvasFactory("image/png");

    await expect(
      renderAllTileSlices({
        source: {} as CanvasImageSource,
        sourceWidth: 3240,
        sourceHeight: 4320,
        splitPlan,
        transform: DEFAULT_COMPOSITION_TRANSFORM,
        exportSettings: DEFAULT_EXPORT_SETTINGS,
        createCanvas: factory,
        signal: controller.signal,
      }),
    ).rejects.toThrow("CANCELLED");
  });
});
