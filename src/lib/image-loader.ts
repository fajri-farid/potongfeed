import type { BrowserImageCapabilities, Dimensions, LoadedLocalImage } from "@/types/editor";

export const DEFAULT_PROXY_MAX_DIMENSION = 1800;
export const LARGE_SOURCE_WARNING_PIXELS = 40_000_000;

export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const ALPHA_FRIENDLY_PROXY_MIMES = new Set(["image/png", "image/webp", "image/avif", "image/gif"]);

export interface DecodedBitmapHandle {
  source: CanvasImageSource;
  naturalWidth: number;
  naturalHeight: number;
  close: () => void;
}

let cachedCapabilities: BrowserImageCapabilities | null = null;

/** Memeriksa apakah tipe MIME atau ekstensi berkas termasuk format foto yang didukung. */
export function isSupportedImageFile(file: Pick<File, "name" | "type" | "size">): boolean {
  if (file.size <= 0) {
    return false;
  }
  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType && SUPPORTED_IMAGE_MIME_TYPES.has(normalizedType)) {
    return true;
  }
  const lowerName = file.name.trim().toLowerCase();
  const dotIndex = lowerName.lastIndexOf(".");
  if (dotIndex < 0) {
    return false;
  }
  return SUPPORTED_EXTENSIONS.has(lowerName.slice(dotIndex));
}

/** Menghitung dimensi proxy pratinjau agar sisi terpanjang tidak melebihi batas layar. */
export function computeProxyDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxDimension: number = DEFAULT_PROXY_MAX_DIMENSION,
): Dimensions {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    throw new Error("Dimensi foto harus bernilai positif yang valid.");
  }

  const safeMax = Math.max(64, Math.round(maxDimension));
  const longestSide = Math.max(naturalWidth, naturalHeight);
  if (longestSide <= safeMax) {
    return {
      width: Math.round(naturalWidth),
      height: Math.round(naturalHeight),
    };
  }

  const scale = safeMax / longestSide;
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

/** Menghitung perkiraan megapiksel gambar sumber. */
export function estimateSourceMegapixels(naturalWidth: number, naturalHeight: number): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return 0;
  }
  return (naturalWidth * naturalHeight) / 1_000_000;
}

/** Mengembalikan `true` jika foto melebihi ambang aman 40 MP untuk peringatan memori mobile. */
export function shouldWarnLargeImage(naturalWidth: number, naturalHeight: number): boolean {
  return naturalWidth * naturalHeight > LARGE_SOURCE_WARNING_PIXELS;
}

/** Memformat ukuran berkas byte ke label singkat (`KB` / `MB`). */
export function formatFileSizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Mendeteksi dukungan API pemrosesan gambar di browser aktif secara aman terhadap SSR. */
export function detectBrowserImageCapabilities(forceRefresh = false): BrowserImageCapabilities {
  if (cachedCapabilities && !forceRefresh) {
    return cachedCapabilities;
  }

  const supportsCreateImageBitmap = typeof createImageBitmap === "function";
  const supportsOffscreenCanvas =
    typeof OffscreenCanvas !== "undefined" &&
    typeof OffscreenCanvas.prototype?.convertToBlob === "function";
  const supportsWebWorker = typeof Worker !== "undefined";

  let supportsWebpExport = false;
  let supportsCanvasFilter = false;

  if (typeof document !== "undefined") {
    try {
      const probeCanvas = document.createElement("canvas");
      probeCanvas.width = 2;
      probeCanvas.height = 2;
      const probeCtx = probeCanvas.getContext("2d");
      supportsCanvasFilter = Boolean(probeCtx && "filter" in probeCtx);
      const dataUrl = probeCanvas.toDataURL("image/webp");
      supportsWebpExport = dataUrl.startsWith("data:image/webp");
    } catch {
      supportsWebpExport = false;
      supportsCanvasFilter = false;
    }
  }

  const capabilities: BrowserImageCapabilities = {
    supportsCreateImageBitmap,
    supportsOffscreenCanvas,
    supportsWebWorker,
    supportsWebpExport,
    supportsCanvasFilter,
  };

  if (typeof window !== "undefined") {
    cachedCapabilities = capabilities;
  }

  return capabilities;
}

async function decodeWithImageBitmap(file: File): Promise<DecodedBitmapHandle> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = await createImageBitmap(file);
  }

  if (bitmap.width <= 0 || bitmap.height <= 0) {
    bitmap.close();
    throw new Error("Dimensi gambar kosong atau tidak terbaca.");
  }

  return {
    source: bitmap,
    naturalWidth: bitmap.width,
    naturalHeight: bitmap.height,
    close: () => {
      bitmap.close();
    },
  };
}

function decodeWithHtmlImageElement(file: File): Promise<DecodedBitmapHandle> {
  if (typeof Image === "undefined" || typeof URL === "undefined") {
    return Promise.reject(new Error("Lingkungan browser tidak mendukung dekode gambar lokal."));
  }

  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        URL.revokeObjectURL(tempUrl);
        reject(new Error("Gambar tidak memiliki dimensi piksel yang valid."));
        return;
      }

      resolve({
        source: img,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        close: () => {
          URL.revokeObjectURL(tempUrl);
        },
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      reject(new Error("Berkas gagal dibaca sebagai gambar yang valid."));
    };

    img.src = tempUrl;
  });
}

/**
 * Mendekode berkas foto lokal pada resolusi penuh asli sambil menghormati orientasi EXIF.
 * Pemanggil wajib memanggil `handle.close()` setelah selesai memakai `handle.source`.
 */
export async function decodeSourceImageFromFile(file: File): Promise<DecodedBitmapHandle> {
  if (typeof createImageBitmap === "function") {
    try {
      return await decodeWithImageBitmap(file);
    } catch {
      // Lanjut mencoba fallback HTMLImageElement bila browser menolak codec di createImageBitmap
    }
  }
  return decodeWithHtmlImageElement(file);
}

async function buildPreviewProxyUrl(
  decoded: DecodedBitmapHandle,
  mimeType: string,
  maxDimension: number,
  originalFile: File,
): Promise<string> {
  if (typeof document === "undefined") {
    return URL.createObjectURL(originalFile);
  }

  const proxyDims = computeProxyDimensions(
    decoded.naturalWidth,
    decoded.naturalHeight,
    maxDimension,
  );
  const canvas = document.createElement("canvas");
  canvas.width = proxyDims.width;
  canvas.height = proxyDims.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return URL.createObjectURL(originalFile);
  }

  const usePngProxy = ALPHA_FRIENDLY_PROXY_MIMES.has(mimeType.toLowerCase());
  if (!usePngProxy) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

  const proxyMime = usePngProxy ? "image/png" : "image/jpeg";
  const proxyQuality = usePngProxy ? undefined : 0.92;

  const proxyBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), proxyMime, proxyQuality);
  });

  if (!proxyBlob) {
    return URL.createObjectURL(originalFile);
  }

  return URL.createObjectURL(proxyBlob);
}

/**
 * Memuat file foto lokal untuk editor: membaca dimensi asli berorientasi EXIF, membuat
 * proxy preview ringan (maks 1800 px), dan langsung menutup bitmap penuh agar RAM hemat.
 */
export async function loadLocalImageFile(
  file: File,
  maxProxyDimension: number = DEFAULT_PROXY_MAX_DIMENSION,
): Promise<LoadedLocalImage> {
  if (!isSupportedImageFile(file)) {
    throw new Error(
      "Format berkas belum didukung. Gunakan foto PNG, JPEG, WebP, atau AVIF yang valid.",
    );
  }

  const decoded = await decodeSourceImageFromFile(file);
  try {
    const mimeType = file.type.trim() || "image/jpeg";
    const proxyUrl = await buildPreviewProxyUrl(decoded, mimeType, maxProxyDimension, file);

    return {
      name: file.name,
      file,
      naturalWidth: decoded.naturalWidth,
      naturalHeight: decoded.naturalHeight,
      mimeType,
      fileSizeBytes: file.size,
      proxyUrl,
    };
  } finally {
    decoded.close();
  }
}

/** Membersihkan Object URL proxy pratinjau dari memori browser. */
export function revokeSourceImageProxy(proxyUrl: string | null | undefined): void {
  if (!proxyUrl || !proxyUrl.startsWith("blob:")) {
    return;
  }
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(proxyUrl);
  }
}
