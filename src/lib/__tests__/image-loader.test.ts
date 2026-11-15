import { describe, expect, it, vi } from "vitest";
import {
  computeProxyDimensions,
  detectBrowserImageCapabilities,
  estimateSourceMegapixels,
  formatFileSizeBytes,
  isSupportedImageFile,
  revokeSourceImageProxy,
  shouldWarnLargeImage,
} from "@/lib/image-loader";

describe("image-loader", () => {
  it("memvalidasi format gambar yang didukung dan menolak file kosong atau non-gambar", () => {
    expect(isSupportedImageFile({ name: "foto.jpg", type: "image/jpeg", size: 1024 })).toBe(true);
    expect(isSupportedImageFile({ name: "desain.png", type: "image/png", size: 2048 })).toBe(true);
    expect(isSupportedImageFile({ name: "kampanye.webp", type: "", size: 4096 })).toBe(true);
    expect(isSupportedImageFile({ name: "kamera.AVIF", type: "", size: 4096 })).toBe(true);
    expect(isSupportedImageFile({ name: "kosong.png", type: "image/png", size: 0 })).toBe(false);
    expect(isSupportedImageFile({ name: "dokumen.pdf", type: "application/pdf", size: 5000 })).toBe(
      false,
    );
  });

  it("menghitung ukuran proxy preview maksimal 1800px tanpa me-upscale gambar kecil", () => {
    expect(computeProxyDimensions(6000, 4000, 1800)).toEqual({ width: 1800, height: 1200 });
    expect(computeProxyDimensions(4000, 6000, 1800)).toEqual({ width: 1200, height: 1800 });
    expect(computeProxyDimensions(1080, 1440, 1800)).toEqual({ width: 1080, height: 1440 });
    expect(() => computeProxyDimensions(0, 1000)).toThrow();
  });

  it("menghitung megapiksel, peringatan gambar >40MP, dan format ukuran file", () => {
    expect(estimateSourceMegapixels(6000, 4000)).toBe(24);
    expect(shouldWarnLargeImage(6000, 4000)).toBe(false);
    expect(shouldWarnLargeImage(8000, 6000)).toBe(true);
    expect(formatFileSizeBytes(0)).toBe("0 KB");
    expect(formatFileSizeBytes(512_000)).toBe("500 KB");
    expect(formatFileSizeBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("hanya me-revoke Object URL bertipe blob saat cleanup proxy", () => {
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      revokeSourceImageProxy("blob:https://potongfeed.test/1234");
      revokeSourceImageProxy("https://example.com/image.png");
      revokeSourceImageProxy(null);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("blob:https://potongfeed.test/1234");
    } finally {
      spy.mockRestore();
    }
  });

  it("mendeteksi kapabilitas browser dengan aman pada lingkungan Node/SSR", () => {
    const caps = detectBrowserImageCapabilities(true);
    expect(typeof caps.supportsCreateImageBitmap).toBe("boolean");
    expect(typeof caps.supportsOffscreenCanvas).toBe("boolean");
    expect(typeof caps.supportsWebWorker).toBe("boolean");
    expect(typeof caps.supportsWebpExport).toBe("boolean");
    expect(typeof caps.supportsCanvasFilter).toBe("boolean");
  });
});
