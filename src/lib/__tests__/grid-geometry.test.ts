import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION_TRANSFORM,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_GRID_CONFIG,
  applyPanPixelDelta,
  calculateTargetTileDimensions,
  computeCompositionRects,
  computeCoverRect,
  computeTileCropPlans,
  computeUploadOrder,
  formatTileFilename,
  getSafeAreaBands,
  getTileAspectRatio,
  normalizeCompositionTransform,
  normalizeHexColor,
} from "@/lib/grid-geometry";

describe("grid-geometry", () => {
  it("menghitung rasio dan dimensi ig-1080 dengan tepat untuk 3:4, 4:5, dan 1:1", () => {
    expect(getTileAspectRatio("3:4")).toBeCloseTo(0.75);
    expect(getTileAspectRatio("4:5")).toBeCloseTo(0.8);
    expect(getTileAspectRatio("1:1")).toBe(1);

    const g34 = calculateTargetTileDimensions(
      3240,
      4320,
      { aspectPreset: "3:4", columns: 3, rows: 3 },
      DEFAULT_COMPOSITION_TRANSFORM,
      "ig-1080",
    );
    expect(g34.tileWidth).toBe(1080);
    expect(g34.tileHeight).toBe(1440);
    expect(g34.masterWidth).toBe(3240);
    expect(g34.masterHeight).toBe(4320);
    expect(g34.wasUpscaledFromSmallSource).toBe(false);

    const g45 = calculateTargetTileDimensions(
      3240,
      4050,
      { aspectPreset: "4:5", columns: 3, rows: 3 },
      DEFAULT_COMPOSITION_TRANSFORM,
      "ig-1080",
    );
    expect(g45.tileWidth).toBe(1080);
    expect(g45.tileHeight).toBe(1350);

    const g11 = calculateTargetTileDimensions(
      3240,
      3240,
      { aspectPreset: "1:1", columns: 3, rows: 3 },
      DEFAULT_COMPOSITION_TRANSFORM,
      "ig-1080",
    );
    expect(g11.tileWidth).toBe(1080);
    expect(g11.tileHeight).toBe(1080);
  });

  it("menghitung dimensi native tanpa downscale merusak dan menandai sumber kecil di ig-1080", () => {
    const highResNative = calculateTargetTileDimensions(
      4500,
      6000,
      DEFAULT_GRID_CONFIG,
      DEFAULT_COMPOSITION_TRANSFORM,
      "native",
    );
    expect(highResNative.tileWidth).toBe(1500);
    expect(highResNative.tileHeight).toBe(2000);
    expect(highResNative.wasUpscaledFromSmallSource).toBe(false);
    expect(highResNative.wasClampedBySafetyLimit).toBe(false);

    const smallNative = calculateTargetTileDimensions(
      1500,
      2000,
      DEFAULT_GRID_CONFIG,
      DEFAULT_COMPOSITION_TRANSFORM,
      "native",
    );
    expect(smallNative.tileWidth).toBe(500);
    expect(smallNative.tileHeight).toBe(667);
    expect(smallNative.wasUpscaledFromSmallSource).toBe(false);

    const smallOnIg1080 = calculateTargetTileDimensions(
      1500,
      2000,
      DEFAULT_GRID_CONFIG,
      DEFAULT_COMPOSITION_TRANSFORM,
      "ig-1080",
    );
    expect(smallOnIg1080.tileWidth).toBe(1080);
    expect(smallOnIg1080.wasUpscaledFromSmallSource).toBe(true);

    const zoomedInOn3240 = calculateTargetTileDimensions(
      3240,
      4320,
      DEFAULT_GRID_CONFIG,
      { ...DEFAULT_COMPOSITION_TRANSFORM, zoom: 2.0 },
      "ig-1080",
    );
    expect(zoomedInOn3240.wasUpscaledFromSmallSource).toBe(true);
  });

  it("membatasi dimensi tile mode native bila melebihi batas aman kanvas browser", () => {
    const giantNative = calculateTargetTileDimensions(
      18_000,
      24_000,
      { aspectPreset: "3:4", columns: 3, rows: 1 },
      { ...DEFAULT_COMPOSITION_TRANSFORM, fitMode: "fit", zoom: 1.0 },
      "native",
    );
    expect(giantNative.wasClampedBySafetyLimit).toBe(true);
    expect(giantNative.tileWidth * giantNative.tileHeight).toBeLessThanOrEqual(16_000_000);
    expect(Math.max(giantNative.tileWidth, giantNative.tileHeight)).toBeLessThanOrEqual(8_192);
  });

  it("melempar error bila dimensi foto sumber tidak valid", () => {
    expect(() =>
      calculateTargetTileDimensions(
        0,
        1080,
        DEFAULT_GRID_CONFIG,
        DEFAULT_COMPOSITION_TRANSFORM,
        "ig-1080",
      ),
    ).toThrow();
  });

  it("men-clamp zoom berbeda untuk mode fill (1..5) dan mode fit (0.5..5) serta warna hex", () => {
    const fillClamped = normalizeCompositionTransform({
      ...DEFAULT_COMPOSITION_TRANSFORM,
      fitMode: "fill",
      zoom: 0.6,
      offsetX: 3,
      offsetY: -5,
      backgroundHex: "#abc",
    });
    expect(fillClamped.zoom).toBe(1.0);
    expect(fillClamped.offsetX).toBe(1);
    expect(fillClamped.offsetY).toBe(-1);
    expect(fillClamped.backgroundHex).toBe("#AABBCC");

    const fitSmall = normalizeCompositionTransform({
      ...DEFAULT_COMPOSITION_TRANSFORM,
      fitMode: "fit",
      zoom: 0.75,
      backgroundHex: "invalid",
    });
    expect(fitSmall.zoom).toBe(0.75);
    expect(fitSmall.backgroundHex).toBe("#FFFFFF");

    const fitTooSmall = normalizeCompositionTransform({
      ...DEFAULT_COMPOSITION_TRANSFORM,
      fitMode: "fit",
      zoom: 0.1,
    });
    expect(fitTooSmall.zoom).toBe(0.5);
    expect(normalizeHexColor("  #4f46e5 ")).toBe("#4F46E5");
  });

  it("menjamin mode fill tidak menyisakan ruang kosong pada batas pan ekstrim", () => {
    const plan = computeTileCropPlans({
      sourceWidth: 6000,
      sourceHeight: 3000,
      gridConfig: { aspectPreset: "3:4", columns: 3, rows: 3 },
      transform: {
        ...DEFAULT_COMPOSITION_TRANSFORM,
        fitMode: "fill",
        zoom: 1.4,
        offsetX: 1,
        offsetY: -1,
      },
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const { imageRectOnMaster, normalizedImageRect, masterSize } = plan.placement;
    expect(imageRectOnMaster.x).toBeLessThanOrEqual(0.001);
    expect(imageRectOnMaster.y).toBeLessThanOrEqual(0.001);
    expect(imageRectOnMaster.x + imageRectOnMaster.width).toBeGreaterThanOrEqual(
      masterSize.width - 0.001,
    );
    expect(imageRectOnMaster.y + imageRectOnMaster.height).toBeGreaterThanOrEqual(
      masterSize.height - 0.001,
    );

    // Zero-drift antara koordinat ternormalisasi & ukuran piksel kanvas master
    expect(normalizedImageRect.x * masterSize.width).toBeCloseTo(imageRectOnMaster.x, 6);
    expect(normalizedImageRect.width * masterSize.width).toBeCloseTo(imageRectOnMaster.width, 6);
  });

  it("mendukung bingkai 4 sisi pada mode fit dengan zoom < 1.0", () => {
    const placement = computeCompositionRects(2000, 2000, 3240, 4320, {
      ...DEFAULT_COMPOSITION_TRANSFORM,
      fitMode: "fit",
      zoom: 0.7,
      offsetX: 0,
      offsetY: 0,
    });

    expect(placement.imageRectOnMaster.x).toBeGreaterThan(0);
    expect(placement.imageRectOnMaster.y).toBeGreaterThan(0);
    expect(placement.imageRectOnMaster.x + placement.imageRectOnMaster.width).toBeLessThan(3240);
    expect(placement.imageRectOnMaster.y + placement.imageRectOnMaster.height).toBeLessThan(4320);

    const rightBottomEdgePlan = computeTileCropPlans({
      sourceWidth: 2000,
      sourceHeight: 2000,
      gridConfig: { aspectPreset: "3:4", columns: 3, rows: 3 },
      transform: {
        ...DEFAULT_COMPOSITION_TRANSFORM,
        fitMode: "fit",
        zoom: 0.5,
        offsetX: 1,
        offsetY: 1,
      },
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const topLeftTile = rightBottomEdgePlan.tiles.find((t) => t.row === 1 && t.col === 1);
    const bottomRightTile = rightBottomEdgePlan.tiles.find((t) => t.row === 3 && t.col === 3);
    expect(topLeftTile?.sourceCropRect).toBeNull();
    expect(bottomRightTile?.sourceCropRect).not.toBeNull();
  });

  it("menghitung geseran pan 1:1 terhadap piksel preview via applyPanPixelDelta", () => {
    const zoomed = { ...DEFAULT_COMPOSITION_TRANSFORM, fitMode: "fill" as const, zoom: 2.0 };
    const moved = applyPanPixelDelta(
      zoomed,
      { width: 3240, height: 4320 },
      DEFAULT_GRID_CONFIG,
      { x: 180, y: -90 },
      { width: 360, height: 480 },
    );

    // Pada zoom 2.0 di 360px, scaledW=720px -> maxTravelX = (720-360)/2 = 180px -> +180px = offset +1
    expect(moved.offsetX).toBeCloseTo(1, 5);
    expect(moved.offsetY).toBeCloseTo(-0.375, 5);

    const zeroPreview = applyPanPixelDelta(
      zoomed,
      { width: 3240, height: 4320 },
      DEFAULT_GRID_CONFIG,
      { x: 50, y: 50 },
      { width: 0, height: 0 },
    );
    expect(zeroPreview.offsetX).toBe(0);
  });

  it("menjaga kontinuitas antar-tile bersebelahan tanpa celah atau piksel ganda", () => {
    const plan = computeTileCropPlans({
      sourceWidth: 4000,
      sourceHeight: 6000,
      gridConfig: { aspectPreset: "3:4", columns: 3, rows: 3 },
      transform: { ...DEFAULT_COMPOSITION_TRANSFORM, zoom: 1.25 },
      exportSettings: DEFAULT_EXPORT_SETTINGS,
    });

    const tileR1C1 = plan.tiles.find((t) => t.row === 1 && t.col === 1);
    const tileR1C2 = plan.tiles.find((t) => t.row === 1 && t.col === 2);
    const tileR2C1 = plan.tiles.find((t) => t.row === 2 && t.col === 1);

    expect(tileR1C1?.sourceCropRect).not.toBeNull();
    expect(tileR1C2?.sourceCropRect).not.toBeNull();
    expect(tileR2C1?.sourceCropRect).not.toBeNull();

    if (tileR1C1?.sourceCropRect && tileR1C2?.sourceCropRect && tileR2C1?.sourceCropRect) {
      expect(tileR1C1.sourceCropRect.x + tileR1C1.sourceCropRect.width).toBeCloseTo(
        tileR1C2.sourceCropRect.x,
        6,
      );
      expect(tileR1C1.sourceCropRect.y + tileR1C1.sourceCropRect.height).toBeCloseTo(
        tileR2C1.sourceCropRect.y,
        6,
      );
    }
  });

  it("menghitung urutan posting Instagram (kanan-bawah ke kiri-atas) dan penamaan file", () => {
    expect(computeUploadOrder(3, 3, 3)).toBe(1);
    expect(computeUploadOrder(3, 1, 3)).toBe(3);
    expect(computeUploadOrder(1, 1, 3)).toBe(9);

    expect(formatTileFilename(1, 3, 3, "png")).toBe("01_potongfeed_b3-k3.png");
    expect(formatTileFilename(12, 1, 1, "jpeg")).toBe("12_potongfeed_b1-k1.jpg");

    const plan3x4 = computeTileCropPlans({
      sourceWidth: 3240,
      sourceHeight: 5400,
      gridConfig: { aspectPreset: "4:5", columns: 3, rows: 4 },
      transform: DEFAULT_COMPOSITION_TRANSFORM,
      exportSettings: { format: "jpeg", quality: 0.98, resolutionMode: "ig-1080" },
    });

    expect(plan3x4.tiles).toHaveLength(12);
    expect(plan3x4.tiles[0].filename).toBe("12_potongfeed_b1-k1.jpg");
    expect(plan3x4.tiles[11].filename).toBe("01_potongfeed_b4-k3.jpg");
  });

  it("mengembalikan pita batas Safe Area yang akurat sesuai rasio dan margin 8%", () => {
    const band34 = getSafeAreaBands("3:4");
    expect(band34.ratioCropTrimFraction).toEqual({
      top: 0.03125,
      right: 0,
      bottom: 0.03125,
      left: 0,
    });
    expect(band34.contentSafeMarginFraction).toBe(0.08);

    const band45 = getSafeAreaBands("4:5");
    expect(band45.ratioCropTrimFraction).toEqual({
      top: 0,
      right: 0.03125,
      bottom: 0,
      left: 0.03125,
    });

    const band11 = getSafeAreaBands("1:1");
    expect(band11.ratioCropTrimFraction).toEqual({
      top: 0,
      right: 0.125,
      bottom: 0,
      left: 0.125,
    });

    const cover = computeCoverRect(4000, 2000, 1080, 1440);
    expect(cover.width).toBeCloseTo(2880);
    expect(cover.height).toBeCloseTo(1440);
    expect(cover.x).toBeCloseTo(-900);
  });
});
