import {
  DEFAULT_COMPOSITION_TRANSFORM,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_GRID_CONFIG,
  DEFAULT_SAFE_AREA_OPTIONS,
  MAX_EXPORT_QUALITY,
  MAX_GRID_ROWS,
  MIN_EXPORT_QUALITY,
  MIN_GRID_ROWS,
  clamp,
  normalizeHexColor,
} from "@/lib/grid-geometry";
import type {
  AspectPreset,
  ExportFormat,
  FitBackgroundType,
  FitMode,
  PersistedPreferences,
  PreviewDisplayMode,
  ResolutionMode,
  UploadChecklistState,
} from "@/types/editor";

export const STORAGE_KEY_PREFERENCES = "potongfeed:v1:preferences";
export const STORAGE_KEY_UPLOAD_CHECKLIST = "potongfeed:v1:upload-checklist";

export type StorageReader = Pick<Storage, "getItem">;
export type StorageWriter = Pick<Storage, "setItem">;
export type StorageRemover = Pick<Storage, "removeItem">;

const ASPECT_PRESETS = new Set<AspectPreset>(["3:4", "4:5", "1:1"]);
const FIT_MODES = new Set<FitMode>(["fill", "fit"]);
const BACKGROUND_TYPES = new Set<FitBackgroundType>(["white", "black", "custom", "blur"]);
const EXPORT_FORMATS = new Set<ExportFormat>(["png", "jpeg", "webp"]);
const RESOLUTION_MODES = new Set<ResolutionMode>(["ig-1080", "native"]);
const PREVIEW_MODES = new Set<PreviewDisplayMode>(["profile-3-4", "full-seamless"]);

function resolveBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  if (typeof value === "string" && allowed.has(value as T)) {
    return value as T;
  }
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Mengembalikan preferensi default editor PotongFeed. */
export function getDefaultPreferences(): PersistedPreferences {
  return {
    aspectPreset: DEFAULT_GRID_CONFIG.aspectPreset,
    rows: DEFAULT_GRID_CONFIG.rows,
    fitMode: DEFAULT_COMPOSITION_TRANSFORM.fitMode,
    backgroundType: DEFAULT_COMPOSITION_TRANSFORM.backgroundType,
    backgroundHex: DEFAULT_COMPOSITION_TRANSFORM.backgroundHex,
    safeArea: { ...DEFAULT_SAFE_AREA_OPTIONS },
    format: DEFAULT_EXPORT_SETTINGS.format,
    quality: DEFAULT_EXPORT_SETTINGS.quality,
    resolutionMode: DEFAULT_EXPORT_SETTINGS.resolutionMode,
  };
}

/** Membuat sidik unik ringan sesi foto untuk mencocokkan checklist upload saat reload. */
export function buildImageChecklistSignature(input: {
  name: string;
  naturalWidth: number;
  naturalHeight: number;
  fileSizeBytes: number;
  aspectPreset: AspectPreset;
  rows: number;
}): string {
  const safeName = input.name.trim() || "foto";
  return [
    safeName,
    `${input.naturalWidth}x${input.naturalHeight}`,
    String(input.fileSizeBytes),
    input.aspectPreset,
    `r${input.rows}`,
  ].join("|");
}

/** Memuat preferensi editor dari `localStorage` dengan fallback aman ke nilai default. */
export function loadPreferences(
  storage: StorageReader | null = resolveBrowserStorage(),
): PersistedPreferences {
  const defaults = getDefaultPreferences();
  if (!storage) {
    return defaults;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY_PREFERENCES);
    if (!raw) {
      return defaults;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      return defaults;
    }

    const safeAreaRaw = isPlainRecord(parsed.safeArea) ? parsed.safeArea : {};
    const parsedRows =
      typeof parsed.rows === "number" && Number.isFinite(parsed.rows)
        ? Math.round(clamp(parsed.rows, MIN_GRID_ROWS, MAX_GRID_ROWS, defaults.rows))
        : defaults.rows;
    const parsedQuality =
      typeof parsed.quality === "number" && Number.isFinite(parsed.quality)
        ? clamp(parsed.quality, MIN_EXPORT_QUALITY, MAX_EXPORT_QUALITY, defaults.quality)
        : defaults.quality;

    return {
      aspectPreset: readEnum(parsed.aspectPreset, ASPECT_PRESETS, defaults.aspectPreset),
      rows: parsedRows,
      fitMode: readEnum(parsed.fitMode, FIT_MODES, defaults.fitMode),
      backgroundType: readEnum(parsed.backgroundType, BACKGROUND_TYPES, defaults.backgroundType),
      backgroundHex:
        typeof parsed.backgroundHex === "string"
          ? normalizeHexColor(parsed.backgroundHex, defaults.backgroundHex)
          : defaults.backgroundHex,
      safeArea: {
        showSplitLines: readBoolean(safeAreaRaw.showSplitLines, defaults.safeArea.showSplitLines),
        showRatioSafeCrop: readBoolean(
          safeAreaRaw.showRatioSafeCrop,
          defaults.safeArea.showRatioSafeCrop,
        ),
        showContentSafeZone: readBoolean(
          safeAreaRaw.showContentSafeZone,
          defaults.safeArea.showContentSafeZone,
        ),
        showGutterPreview: readBoolean(
          safeAreaRaw.showGutterPreview,
          defaults.safeArea.showGutterPreview,
        ),
        showProfileHeaderMockup: readBoolean(
          safeAreaRaw.showProfileHeaderMockup,
          defaults.safeArea.showProfileHeaderMockup,
        ),
        previewMode: readEnum(
          safeAreaRaw.previewMode,
          PREVIEW_MODES,
          defaults.safeArea.previewMode,
        ),
      },
      format: readEnum(parsed.format, EXPORT_FORMATS, defaults.format),
      quality: parsedQuality,
      resolutionMode: readEnum(parsed.resolutionMode, RESOLUTION_MODES, defaults.resolutionMode),
    };
  } catch {
    return defaults;
  }
}

/** Menyimpan preferensi ringan editor ke `localStorage` tanpa melempar error kuota/akses. */
export function savePreferences(
  preferences: PersistedPreferences,
  storage: StorageWriter | null = resolveBrowserStorage(),
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

/** Memuat checklist urutan unggah terakhir dari `localStorage` dengan validasi ketat. */
export function loadUploadChecklist(
  storage: StorageReader | null = resolveBrowserStorage(),
): UploadChecklistState | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY_UPLOAD_CHECKLIST);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      return null;
    }

    if (
      typeof parsed.imageSignature !== "string" ||
      parsed.imageSignature.trim().length === 0 ||
      typeof parsed.totalTiles !== "number" ||
      !Number.isInteger(parsed.totalTiles) ||
      parsed.totalTiles < 1 ||
      !Array.isArray(parsed.uploadedOrders)
    ) {
      return null;
    }

    const totalTiles = parsed.totalTiles;
    const validOrders = Array.from(
      new Set(
        parsed.uploadedOrders.filter(
          (item): item is number =>
            typeof item === "number" && Number.isInteger(item) && item >= 1 && item <= totalTiles,
        ),
      ),
    ).sort((a, b) => a - b);

    return {
      imageSignature: parsed.imageSignature,
      totalTiles,
      uploadedOrders: validOrders,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Menyimpan checklist unggah tile sesi aktif ke `localStorage`. */
export function saveUploadChecklist(
  checklist: UploadChecklistState,
  storage: StorageWriter | null = resolveBrowserStorage(),
): boolean {
  if (!storage) {
    return false;
  }

  const sanitizedOrders = Array.from(
    new Set(
      checklist.uploadedOrders.filter(
        (order) =>
          Number.isInteger(order) && order >= 1 && order <= Math.max(1, checklist.totalTiles),
      ),
    ),
  ).sort((a, b) => a - b);

  const payload: UploadChecklistState = {
    imageSignature: checklist.imageSignature,
    totalTiles: checklist.totalTiles,
    uploadedOrders: sanitizedOrders,
    updatedAt: checklist.updatedAt,
  };

  try {
    storage.setItem(STORAGE_KEY_UPLOAD_CHECKLIST, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** Menghapus data checklist unggah tersimpan dari `localStorage`. */
export function clearUploadChecklist(
  storage: StorageRemover | null = resolveBrowserStorage(),
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(STORAGE_KEY_UPLOAD_CHECKLIST);
    return true;
  } catch {
    return false;
  }
}
