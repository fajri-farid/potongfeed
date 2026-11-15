/** Rasio tile grid Instagram yang didukung PotongFeed v0.1.0. */
export type AspectPreset = "3:4" | "4:5" | "1:1";

/** Mode penyesuaian foto pada kanvas master grid. */
export type FitMode = "fill" | "fit";

/** Jenis latar belakang saat mode `fit` aktif. */
export type FitBackgroundType = "white" | "black" | "custom" | "blur";

/** Format berkas gambar hasil ekspor. */
export type ExportFormat = "png" | "jpeg" | "webp";

/** Strategi resolusi output per tile. */
export type ResolutionMode = "ig-1080" | "native";

/** Mode tampilan pratinjau grid pada mockup profil Instagram. */
export type PreviewDisplayMode = "profile-3-4" | "full-seamless";

/** Dimensi persegi panjang dalam piksel atau unit ternormalisasi. */
export interface Dimensions {
  width: number;
  height: number;
}

/** Koordinat persegi panjang pada bidang 2D. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Metadata foto sumber yang dimuat secara lokal di memori browser. */
export interface SourceImageMeta {
  id: string;
  signature: string;
  file: File;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
  mimeType: string;
  fileSizeBytes: number;
  proxyUrl: string;
}

/** Konfigurasi tata letak grid profil Instagram (kolom baku = 3). */
export interface GridLayoutConfig {
  aspectPreset: AspectPreset;
  columns: 3;
  rows: number;
}

/** Parameter komposisi foto di dalam kanvas master grid. */
export interface CompositionTransform {
  fitMode: FitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
  backgroundType: FitBackgroundType;
  backgroundHex: string;
}

/** Opsi overlay Safe Area dan tampilan mockup profil Instagram. */
export interface SafeAreaOptions {
  showSplitLines: boolean;
  showRatioSafeCrop: boolean;
  showContentSafeZone: boolean;
  showGutterPreview: boolean;
  showProfileHeaderMockup: boolean;
  previewMode: PreviewDisplayMode;
}

/** Setelan format dan resolusi ekspor HD client-side. */
export interface ExportSettings {
  format: ExportFormat;
  quality: number;
  resolutionMode: ResolutionMode;
}

/** Dimensi aktual kanvas master dan tiap tile output. */
export interface MasterCanvasGeometry {
  aspectPreset: AspectPreset;
  tileAspectRatio: number;
  columns: 3;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  masterWidth: number;
  masterHeight: number;
  wasUpscaledFromSmallSource: boolean;
  wasClampedBySafetyLimit: boolean;
}

/** Penempatan foto sumber di ruang piksel kanvas master & koordinat ternormalisasi [0..1]. */
export interface CompositionPlacement {
  fitMode: FitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
  sourceSize: Dimensions;
  masterSize: Dimensions;
  imageRectOnMaster: Rect;
  normalizedImageRect: Rect;
}

/** Pita batas Safe Area (proporsi terhadap lebar/tinggi tiap tile). */
export interface SafeAreaBands {
  aspectPreset: AspectPreset;
  profileSafeRatio: number;
  ratioCropTrimFraction: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  contentSafeMarginFraction: number;
  trimDescription: string;
}

/** Rencana pemotongan dan penamaan untuk 1 tile grid Instagram. */
export interface TileSlicePlan {
  row: number;
  col: number;
  uploadOrder: number;
  totalTiles: number;
  filename: string;
  masterTileRect: Rect;
  normalizedTileRect: Rect;
  sourceCropRect: Rect | null;
  tileDestRect: Rect | null;
}

/** Rencana lengkap hasil kalkulasi geometri untuk preview maupun worker ekspor. */
export interface GridSplitPlan {
  geometry: MasterCanvasGeometry;
  placement: CompositionPlacement;
  safeArea: SafeAreaBands;
  tiles: TileSlicePlan[];
}

/** Output biner 1 tile pasca-rendering di Web Worker / fallback Canvas. */
export interface TileSliceResult {
  row: number;
  col: number;
  uploadOrder: number;
  filename: string;
  width: number;
  height: number;
  blob: Blob;
}

/** Preferensi ringan editor yang disimpan di `localStorage`. */
export interface PersistedPreferences {
  aspectPreset: AspectPreset;
  rows: number;
  fitMode: FitMode;
  backgroundType: FitBackgroundType;
  backgroundHex: string;
  safeArea: SafeAreaOptions;
  format: ExportFormat;
  quality: number;
  resolutionMode: ResolutionMode;
}

/** Status checklist unggah tile terakhir yang disimpan di `localStorage`. */
export interface UploadChecklistState {
  imageSignature: string;
  totalTiles: number;
  uploadedOrders: number[];
  updatedAt: string;
}
