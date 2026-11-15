import type {
  AspectPreset,
  CompositionPlacement,
  CompositionTransform,
  Dimensions,
  ExportFormat,
  ExportSettings,
  FitMode,
  GridLayoutConfig,
  GridSplitPlan,
  MasterCanvasGeometry,
  Rect,
  ResolutionMode,
  SafeAreaBands,
  SafeAreaOptions,
  TileSlicePlan,
} from "@/types/editor";

export const GRID_COLUMNS = 3 as const;
export const MIN_GRID_ROWS = 1;
export const MAX_GRID_ROWS = 6;
export const IG_STANDARD_TILE_WIDTH = 1080;

export const MIN_ZOOM_FILL = 1.0;
export const MIN_ZOOM_FIT = 0.5;
export const MAX_ZOOM = 5.0;

export const MIN_EXPORT_QUALITY = 0.95;
export const MAX_EXPORT_QUALITY = 1.0;
export const DEFAULT_EXPORT_QUALITY = 0.96;

export const CONTENT_SAFE_MARGIN_FRACTION = 0.08;
export const IG_PROFILE_SAFE_RATIO = 0.75; // Standar tile grid profil 3:4

/** Batas pengaman dimensi kanvas 1 tile agar aman dari limit Safari/iOS (~16,7 MP). */
export const MAX_SAFE_TILE_PIXELS = 16_000_000;
export const MAX_SAFE_TILE_DIMENSION = 8_192;

export const DEFAULT_GRID_CONFIG: GridLayoutConfig = {
  aspectPreset: "3:4",
  columns: GRID_COLUMNS,
  rows: 3,
};

export const DEFAULT_COMPOSITION_TRANSFORM: CompositionTransform = {
  fitMode: "fill",
  zoom: 1.0,
  offsetX: 0,
  offsetY: 0,
  backgroundType: "white",
  backgroundHex: "#FFFFFF",
};

export const DEFAULT_SAFE_AREA_OPTIONS: SafeAreaOptions = {
  showSplitLines: true,
  showRatioSafeCrop: true,
  showContentSafeZone: true,
  showGutterPreview: true,
  showProfileHeaderMockup: true,
  previewMode: "profile-3-4",
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: "png",
  quality: DEFAULT_EXPORT_QUALITY,
  resolutionMode: "ig-1080",
};

interface AspectSpec {
  aspectRatio: number;
  standardHeight: number;
}

const ASPECT_SPEC_MAP: Record<AspectPreset, AspectSpec> = {
  "3:4": { aspectRatio: 3 / 4, standardHeight: 1440 },
  "4:5": { aspectRatio: 4 / 5, standardHeight: 1350 },
  "1:1": { aspectRatio: 1, standardHeight: 1080 },
};

const SAFE_AREA_BANDS_MAP: Record<AspectPreset, SafeAreaBands> = {
  "3:4": {
    aspectPreset: "3:4",
    profileSafeRatio: IG_PROFILE_SAFE_RATIO,
    ratioCropTrimFraction: {
      top: 0.03125,
      right: 0,
      bottom: 0.03125,
      left: 0,
    },
    contentSafeMarginFraction: CONTENT_SAFE_MARGIN_FRACTION,
    trimDescription:
      "Pas edge-to-edge di grid profil 3:4; area tepi atas dan bawah 3,125% terpotong saat pratinjau feed 4:5.",
  },
  "4:5": {
    aspectPreset: "4:5",
    profileSafeRatio: IG_PROFILE_SAFE_RATIO,
    ratioCropTrimFraction: {
      top: 0,
      right: 0.03125,
      bottom: 0,
      left: 0.03125,
    },
    contentSafeMarginFraction: CONTENT_SAFE_MARGIN_FRACTION,
    trimDescription:
      "Kompatibel untuk feed 4:5; pita kiri dan kanan 3,125% per sisi akan terpotong di tampilan grid profil 3:4.",
  },
  "1:1": {
    aspectPreset: "1:1",
    profileSafeRatio: IG_PROFILE_SAFE_RATIO,
    ratioCropTrimFraction: {
      top: 0,
      right: 0.125,
      bottom: 0,
      left: 0.125,
    },
    contentSafeMarginFraction: CONTENT_SAFE_MARGIN_FRACTION,
    trimDescription:
      "Rasio persegi klasik 1:1; pita kiri dan kanan 12,5% per sisi akan terpotong di grid profil 3:4.",
  },
};

const FORMAT_EXTENSION_MAP: Record<ExportFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

/** Membatasi angka agar selalu berada di rentang `[min, max]`. */
export function clamp(value: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Memeriksa apakah string adalah kode warna `#RRGGBB` yang valid. */
export function isValidHexColor(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
}

/** Menormalkan input warna hex (`#RGB` atau `#RRGGBB`) menjadi `#RRGGBB` kapital. */
export function normalizeHexColor(input: string, fallback = "#FFFFFF"): string {
  const trimmed = input.trim();
  const shortMatch = /^#([0-9A-Fa-f]{3})$/.exec(trimmed);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return fallback.toUpperCase();
}

/** Mengembalikan rasio aspek lebar/tinggi untuk preset tile (`3:4`, `4:5`, `1:1`). */
export function getTileAspectRatio(aspectPreset: AspectPreset): number {
  return ASPECT_SPEC_MAP[aspectPreset].aspectRatio;
}

/** Mengembalikan zoom minimal yang diizinkan sesuai mode komposisi (`fill` vs `fit`). */
export function getMinZoomForMode(fitMode: FitMode): number {
  return fitMode === "fit" ? MIN_ZOOM_FIT : MIN_ZOOM_FILL;
}

/** Menormalkan jumlah baris (`1..6`) dan mengunci jumlah kolom grid ke `3`. */
export function normalizeGridLayoutConfig(config: GridLayoutConfig): GridLayoutConfig {
  const safeRows = Number.isFinite(config.rows)
    ? Math.round(clamp(config.rows, MIN_GRID_ROWS, MAX_GRID_ROWS, DEFAULT_GRID_CONFIG.rows))
    : DEFAULT_GRID_CONFIG.rows;

  return {
    aspectPreset: config.aspectPreset,
    columns: GRID_COLUMNS,
    rows: safeRows,
  };
}

/** Menormalkan zoom, offset `[-1, 1]`, serta kode warna latar komposisi. */
export function normalizeCompositionTransform(
  transform: CompositionTransform,
): CompositionTransform {
  const minZoom = getMinZoomForMode(transform.fitMode);
  return {
    fitMode: transform.fitMode,
    zoom: clamp(transform.zoom, minZoom, MAX_ZOOM, 1.0),
    offsetX: clamp(transform.offsetX, -1, 1, 0),
    offsetY: clamp(transform.offsetY, -1, 1, 0),
    backgroundType: transform.backgroundType,
    backgroundHex: normalizeHexColor(transform.backgroundHex, "#FFFFFF"),
  };
}

/** Menormalkan setelan ekspor HD (kualitas `0.95..1.0`). */
export function normalizeExportSettings(settings: ExportSettings): ExportSettings {
  return {
    format: settings.format,
    quality: clamp(
      settings.quality,
      MIN_EXPORT_QUALITY,
      MAX_EXPORT_QUALITY,
      DEFAULT_EXPORT_QUALITY,
    ),
    resolutionMode: settings.resolutionMode,
  };
}

function assertValidSourceDimensions(sourceWidth: number, sourceHeight: number): void {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error("Dimensi foto sumber harus bernilai positif yang valid.");
  }
}

function computeBaseScale(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fitMode: FitMode,
): number {
  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;
  return fitMode === "fill" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
}

function clampTileDimensionsToSafetyLimit(
  rawWidth: number,
  rawHeight: number,
  aspectRatio: number,
): { width: number; height: number; wasClamped: boolean } {
  const safeW = Math.max(1, Math.round(rawWidth));
  const safeH = Math.max(1, Math.round(rawHeight));
  const maxSide = Math.max(safeW, safeH);
  const area = safeW * safeH;

  if (maxSide <= MAX_SAFE_TILE_DIMENSION && area <= MAX_SAFE_TILE_PIXELS) {
    return { width: safeW, height: safeH, wasClamped: false };
  }

  const dimFactor = maxSide > MAX_SAFE_TILE_DIMENSION ? MAX_SAFE_TILE_DIMENSION / maxSide : 1;
  const areaFactor = area > MAX_SAFE_TILE_PIXELS ? Math.sqrt(MAX_SAFE_TILE_PIXELS / area) : 1;
  const factor = Math.min(dimFactor, areaFactor);

  let width = Math.max(1, Math.floor(safeW * factor));
  let height = Math.max(1, Math.round(width / aspectRatio));

  while (
    width > 1 &&
    (width > MAX_SAFE_TILE_DIMENSION ||
      height > MAX_SAFE_TILE_DIMENSION ||
      width * height > MAX_SAFE_TILE_PIXELS)
  ) {
    width -= 1;
    height = Math.max(1, Math.round(width / aspectRatio));
  }

  return { width, height, wasClamped: true };
}

/**
 * Menghitung dimensi piksel target tiap tile dan kanvas master untuk mode `ig-1080`
 * maupun `native` tanpa downscale merusak, sekaligus menerapkan batas pengaman kanvas browser.
 */
export function calculateTargetTileDimensions(
  sourceWidth: number,
  sourceHeight: number,
  gridConfig: GridLayoutConfig,
  transform: CompositionTransform,
  resolutionMode: ResolutionMode,
): MasterCanvasGeometry {
  assertValidSourceDimensions(sourceWidth, sourceHeight);

  const safeGrid = normalizeGridLayoutConfig(gridConfig);
  const safeTransform = normalizeCompositionTransform(transform);
  const spec = ASPECT_SPEC_MAP[safeGrid.aspectPreset];
  const virtualMasterW = safeGrid.columns;
  const virtualMasterH = safeGrid.rows / spec.aspectRatio;

  const baseScale = computeBaseScale(
    sourceWidth,
    sourceHeight,
    virtualMasterW,
    virtualMasterH,
    safeTransform.fitMode,
  );
  const virtualScale = baseScale * safeTransform.zoom;
  const effectiveSourceMasterWidth = virtualMasterW / virtualScale;
  const rawNativeTileWidth = Math.max(1, Math.round(effectiveSourceMasterWidth / safeGrid.columns));

  if (resolutionMode === "ig-1080") {
    const tileWidth = IG_STANDARD_TILE_WIDTH;
    const tileHeight = spec.standardHeight;
    return {
      aspectPreset: safeGrid.aspectPreset,
      tileAspectRatio: spec.aspectRatio,
      columns: GRID_COLUMNS,
      rows: safeGrid.rows,
      tileWidth,
      tileHeight,
      masterWidth: tileWidth * safeGrid.columns,
      masterHeight: tileHeight * safeGrid.rows,
      wasUpscaledFromSmallSource: rawNativeTileWidth < IG_STANDARD_TILE_WIDTH,
      wasClampedBySafetyLimit: false,
    };
  }

  const rawNativeTileHeight = Math.max(1, Math.round(rawNativeTileWidth / spec.aspectRatio));
  const clampedTile = clampTileDimensionsToSafetyLimit(
    rawNativeTileWidth,
    rawNativeTileHeight,
    spec.aspectRatio,
  );

  return {
    aspectPreset: safeGrid.aspectPreset,
    tileAspectRatio: spec.aspectRatio,
    columns: GRID_COLUMNS,
    rows: safeGrid.rows,
    tileWidth: clampedTile.width,
    tileHeight: clampedTile.height,
    masterWidth: clampedTile.width * safeGrid.columns,
    masterHeight: clampedTile.height * safeGrid.rows,
    wasUpscaledFromSmallSource: false,
    wasClampedBySafetyLimit: clampedTile.wasClamped,
  };
}

/**
 * Menghitung penempatan kotak foto sumber di atas kanvas master serta bentuk
 * ternormalisasi `[0..1]` untuk menyamakan preview UI dan worker ekspor 100%.
 */
export function computeCompositionRects(
  sourceWidth: number,
  sourceHeight: number,
  masterWidth: number,
  masterHeight: number,
  transform: CompositionTransform,
): CompositionPlacement {
  assertValidSourceDimensions(sourceWidth, sourceHeight);
  assertValidSourceDimensions(masterWidth, masterHeight);

  const safeTransform = normalizeCompositionTransform(transform);
  const baseScale = computeBaseScale(
    sourceWidth,
    sourceHeight,
    masterWidth,
    masterHeight,
    safeTransform.fitMode,
  );
  const finalScale = baseScale * safeTransform.zoom;
  const scaledW = sourceWidth * finalScale;
  const scaledH = sourceHeight * finalScale;

  const maxShiftX = Math.abs(scaledW - masterWidth) / 2;
  const maxShiftY = Math.abs(scaledH - masterHeight) / 2;

  const imageX = (masterWidth - scaledW) / 2 + safeTransform.offsetX * maxShiftX;
  const imageY = (masterHeight - scaledH) / 2 + safeTransform.offsetY * maxShiftY;

  const imageRectOnMaster: Rect = {
    x: imageX,
    y: imageY,
    width: scaledW,
    height: scaledH,
  };

  const normalizedImageRect: Rect = {
    x: imageX / masterWidth,
    y: imageY / masterHeight,
    width: scaledW / masterWidth,
    height: scaledH / masterHeight,
  };

  return {
    fitMode: safeTransform.fitMode,
    zoom: safeTransform.zoom,
    offsetX: safeTransform.offsetX,
    offsetY: safeTransform.offsetY,
    sourceSize: { width: sourceWidth, height: sourceHeight },
    masterSize: { width: masterWidth, height: masterHeight },
    imageRectOnMaster,
    normalizedImageRect,
  };
}

/** Menghitung kotak cover penuh pada kanvas ukuran target (dipakai latar blur mode Fit). */
export function computeCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Rect {
  assertValidSourceDimensions(sourceWidth, sourceHeight);
  assertValidSourceDimensions(targetWidth, targetHeight);

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Mengonversi geseran piksel mouse/sentuhan pada kanvas preview menjadi pembaruan
 * `offsetX` / `offsetY` ternormalisasi `[-1, 1]` yang selaras 1:1 dengan kursor.
 */
export function applyPanPixelDelta(
  transform: CompositionTransform,
  sourceSize: Dimensions,
  gridConfig: GridLayoutConfig,
  deltaPx: { x: number; y: number },
  previewSize: Dimensions,
): CompositionTransform {
  const safeTransform = normalizeCompositionTransform(transform);
  if (
    !Number.isFinite(previewSize.width) ||
    !Number.isFinite(previewSize.height) ||
    previewSize.width <= 0 ||
    previewSize.height <= 0
  ) {
    return safeTransform;
  }

  const safeGrid = normalizeGridLayoutConfig(gridConfig);
  const ratio = getTileAspectRatio(safeGrid.aspectPreset);
  const placement = computeCompositionRects(
    sourceSize.width,
    sourceSize.height,
    safeGrid.columns,
    safeGrid.rows / ratio,
    safeTransform,
  );

  const scaledPreviewW = placement.normalizedImageRect.width * previewSize.width;
  const scaledPreviewH = placement.normalizedImageRect.height * previewSize.height;
  const maxTravelX = Math.abs(scaledPreviewW - previewSize.width) / 2;
  const maxTravelY = Math.abs(scaledPreviewH - previewSize.height) / 2;

  const nextOffsetX =
    maxTravelX > 0.0001
      ? clamp(safeTransform.offsetX + deltaPx.x / maxTravelX, -1, 1, safeTransform.offsetX)
      : 0;
  const nextOffsetY =
    maxTravelY > 0.0001
      ? clamp(safeTransform.offsetY + deltaPx.y / maxTravelY, -1, 1, safeTransform.offsetY)
      : 0;

  return {
    ...safeTransform,
    offsetX: nextOffsetX,
    offsetY: nextOffsetY,
  };
}

/** Mengembalikan definisi pita bahaya potong Safe Area dan margin dalam 8%. */
export function getSafeAreaBands(aspectPreset: AspectPreset): SafeAreaBands {
  return SAFE_AREA_BANDS_MAP[aspectPreset];
}

/**
 * Menghitung urutan posting Instagram (dimulai dari #1 kanan-bawah sampai #N kiri-atas).
 */
export function computeUploadOrder(
  row: number,
  col: number,
  rows: number,
  columns: number = GRID_COLUMNS,
): number {
  return (rows - row) * columns + (columns - col + 1);
}

/** Membentuk nama file output sesuai urutan posting (`<NN>_potongfeed_b<baris>-k<kolom>.<ext>`). */
export function formatTileFilename(
  uploadOrder: number,
  row: number,
  col: number,
  format: ExportFormat,
): string {
  const paddedOrder = String(uploadOrder).padStart(2, "0");
  const extension = FORMAT_EXTENSION_MAP[format];
  return `${paddedOrder}_potongfeed_b${row}-k${col}.${extension}`;
}

function computeTileIntersection(
  masterTileRect: Rect,
  imageRectOnMaster: Rect,
  sourceSize: Dimensions,
): { sourceCropRect: Rect | null; tileDestRect: Rect | null } {
  const interLeft = Math.max(masterTileRect.x, imageRectOnMaster.x);
  const interTop = Math.max(masterTileRect.y, imageRectOnMaster.y);
  const interRight = Math.min(
    masterTileRect.x + masterTileRect.width,
    imageRectOnMaster.x + imageRectOnMaster.width,
  );
  const interBottom = Math.min(
    masterTileRect.y + masterTileRect.height,
    imageRectOnMaster.y + imageRectOnMaster.height,
  );

  if (interRight <= interLeft || interBottom <= interTop) {
    return { sourceCropRect: null, tileDestRect: null };
  }

  const sourcePerMasterX = sourceSize.width / imageRectOnMaster.width;
  const sourcePerMasterY = sourceSize.height / imageRectOnMaster.height;

  const sx = clamp((interLeft - imageRectOnMaster.x) * sourcePerMasterX, 0, sourceSize.width);
  const sy = clamp((interTop - imageRectOnMaster.y) * sourcePerMasterY, 0, sourceSize.height);
  const sw = clamp(
    (interRight - interLeft) * sourcePerMasterX,
    0,
    Math.max(0, sourceSize.width - sx),
  );
  const sh = clamp(
    (interBottom - interTop) * sourcePerMasterY,
    0,
    Math.max(0, sourceSize.height - sy),
  );

  if (sw <= 0 || sh <= 0) {
    return { sourceCropRect: null, tileDestRect: null };
  }

  return {
    sourceCropRect: { x: sx, y: sy, width: sw, height: sh },
    tileDestRect: {
      x: interLeft - masterTileRect.x,
      y: interTop - masterTileRect.y,
      width: interRight - interLeft,
      height: interBottom - interTop,
    },
  };
}

/**
 * Menghasilkan rencana lengkap kanvas master, posisi foto, Safe Area, serta daftar
 * potongan tiap tile (urut baris-per-baris visual dari kiri-atas ke kanan-bawah).
 */
export function computeTileCropPlans(params: {
  sourceWidth: number;
  sourceHeight: number;
  gridConfig: GridLayoutConfig;
  transform: CompositionTransform;
  exportSettings: ExportSettings;
}): GridSplitPlan {
  const safeGrid = normalizeGridLayoutConfig(params.gridConfig);
  const safeTransform = normalizeCompositionTransform(params.transform);
  const safeExport = normalizeExportSettings(params.exportSettings);

  const geometry = calculateTargetTileDimensions(
    params.sourceWidth,
    params.sourceHeight,
    safeGrid,
    safeTransform,
    safeExport.resolutionMode,
  );

  const placement = computeCompositionRects(
    params.sourceWidth,
    params.sourceHeight,
    geometry.masterWidth,
    geometry.masterHeight,
    safeTransform,
  );

  const safeArea = getSafeAreaBands(safeGrid.aspectPreset);
  const totalTiles = safeGrid.rows * safeGrid.columns;
  const tiles: TileSlicePlan[] = [];

  for (let row = 1; row <= safeGrid.rows; row += 1) {
    for (let col = 1; col <= safeGrid.columns; col += 1) {
      const uploadOrder = computeUploadOrder(row, col, safeGrid.rows, safeGrid.columns);
      const filename = formatTileFilename(uploadOrder, row, col, safeExport.format);

      const masterTileRect: Rect = {
        x: (col - 1) * geometry.tileWidth,
        y: (row - 1) * geometry.tileHeight,
        width: geometry.tileWidth,
        height: geometry.tileHeight,
      };

      const normalizedTileRect: Rect = {
        x: (col - 1) / safeGrid.columns,
        y: (row - 1) / safeGrid.rows,
        width: 1 / safeGrid.columns,
        height: 1 / safeGrid.rows,
      };

      const { sourceCropRect, tileDestRect } = computeTileIntersection(
        masterTileRect,
        placement.imageRectOnMaster,
        placement.sourceSize,
      );

      tiles.push({
        row,
        col,
        uploadOrder,
        totalTiles,
        filename,
        masterTileRect,
        normalizedTileRect,
        sourceCropRect,
        tileDestRect,
      });
    }
  }

  return {
    geometry,
    placement,
    safeArea,
    tiles,
  };
}
