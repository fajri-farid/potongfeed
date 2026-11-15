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

/** Kemampuan API pemrosesan gambar di browser pengguna saat ini. */
export interface BrowserImageCapabilities {
  supportsCreateImageBitmap: boolean;
  supportsOffscreenCanvas: boolean;
  supportsWebWorker: boolean;
  supportsWebpExport: boolean;
  supportsCanvasFilter: boolean;
}

/** Informasi gambar lokal yang baru saja dimuat untuk preview UI. */
export interface LoadedLocalImage {
  name: string;
  file: File;
  naturalWidth: number;
  naturalHeight: number;
  mimeType: string;
  fileSizeBytes: number;
  proxyUrl: string;
}

/** Jalur eksekusi pemotong gambar yang dipakai pada proses ekspor. */
export type ExportExecutionMode = "worker" | "main-thread";

/** Laporan progres pemotongan tile demi tile untuk indikator UI. */
export interface ExportProgress {
  completed: number;
  total: number;
  currentFilename: string;
  phase: "decoding" | "slicing" | "packaging";
}

/** Hasil akhir pipeline ekspor grid beserta metadata eksekusi aktual. */
export interface ExportPipelineResult {
  tiles: TileSliceResult[];
  executionMode: ExportExecutionMode;
  actualFormat: ExportFormat;
  usedFallbackFormat: boolean;
}

/** Kode error terstruktur dari Web Worker pemotong tile. */
export type WorkerErrorCode =
  "OFFSCREEN_UNSUPPORTED" | "DECODE_FAILED" | "ENCODE_FAILED" | "CANCELLED";

/** Pesan perintah yang dikirim UI/orchestrator ke Web Worker pemotong grid. */
export type SplitterWorkerRequest =
  | {
      type: "split";
      jobId: string;
      file: File;
      splitPlan: GridSplitPlan;
      transform: CompositionTransform;
      exportSettings: ExportSettings;
    }
  | {
      type: "cancel";
      jobId: string;
    };

/** Pesan balik dari Web Worker pemotong grid menuju thread utama. */
export type SplitterWorkerResponse =
  | {
      type: "progress";
      jobId: string;
      completed: number;
      total: number;
      currentFilename: string;
    }
  | {
      type: "complete";
      jobId: string;
      tiles: TileSliceResult[];
      actualFormat: ExportFormat;
      usedFallbackFormat: boolean;
    }
  | {
      type: "error";
      jobId: string;
      code: WorkerErrorCode;
      message: string;
    };
