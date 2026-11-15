import { describe, expect, it } from "vitest";
import {
  STORAGE_KEY_PREFERENCES,
  STORAGE_KEY_UPLOAD_CHECKLIST,
  buildImageChecklistSignature,
  clearUploadChecklist,
  getDefaultPreferences,
  loadPreferences,
  loadUploadChecklist,
  savePreferences,
  saveUploadChecklist,
} from "@/lib/local-storage";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("local-storage", () => {
  it("mengembalikan preferensi default (4:5, 3x1) saat storage null atau kosong", () => {
    expect(getDefaultPreferences().aspectPreset).toBe("4:5");
    expect(getDefaultPreferences().columns).toBe(3);
    expect(getDefaultPreferences().rows).toBe(1);
    expect(loadPreferences(null)).toEqual(getDefaultPreferences());
    const memory = createMemoryStorage();
    expect(loadPreferences(memory)).toEqual(getDefaultPreferences());
  });

  it("menyimpan dan memuat ulang preferensi dengan sanitasi data rusak", () => {
    const memory = createMemoryStorage();
    const custom = {
      ...getDefaultPreferences(),
      aspectPreset: "3:4" as const,
      rows: 4,
      fitMode: "fit" as const,
      backgroundType: "custom" as const,
      backgroundHex: "#10B981",
      format: "webp" as const,
      quality: 0.99,
      resolutionMode: "native" as const,
    };

    expect(savePreferences(custom, memory)).toBe(true);
    expect(loadPreferences(memory)).toEqual(custom);

    memory.setItem(
      STORAGE_KEY_PREFERENCES,
      JSON.stringify({
        aspectPreset: "9:16",
        rows: 99,
        quality: 0.2,
        backgroundHex: "not-hex",
        safeArea: { showSplitLines: "yes", previewMode: "full-seamless" },
      }),
    );

    const sanitized = loadPreferences(memory);
    expect(sanitized.aspectPreset).toBe("4:5");
    expect(sanitized.rows).toBe(6);
    expect(sanitized.quality).toBe(0.95);
    expect(sanitized.backgroundHex).toBe("#FFFFFF");
    expect(sanitized.safeArea.showSplitLines).toBe(true);
    expect(sanitized.safeArea.previewMode).toBe("full-seamless");
  });

  it("mengelola checklist upload per tanda tangan gambar dan membersihkannya dengan aman", () => {
    const memory = createMemoryStorage();
    const sig = buildImageChecklistSignature({
      name: "campaign-launch.png",
      naturalWidth: 3240,
      naturalHeight: 4320,
      fileSizeBytes: 4_800_000,
      aspectPreset: "3:4",
      rows: 3,
    });
    expect(sig).toBe("campaign-launch.png|3240x4320|4800000|3:4|r3");

    expect(
      saveUploadChecklist(
        {
          imageSignature: sig,
          totalTiles: 9,
          uploadedOrders: [3, 1, 3, 99, 0],
          updatedAt: "2026-11-15T14:55:00.000Z",
        },
        memory,
      ),
    ).toBe(true);

    expect(loadUploadChecklist(memory)).toEqual({
      imageSignature: sig,
      totalTiles: 9,
      uploadedOrders: [1, 3],
      updatedAt: "2026-11-15T14:55:00.000Z",
    });

    memory.setItem(STORAGE_KEY_UPLOAD_CHECKLIST, "{broken-json");
    expect(loadUploadChecklist(memory)).toBeNull();

    expect(clearUploadChecklist(memory)).toBe(true);
    expect(loadUploadChecklist(memory)).toBeNull();
  });

  it("aman saat storage melempar exception (mode privat / kuota penuh)", () => {
    const failingStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };

    expect(loadPreferences(failingStorage)).toEqual(getDefaultPreferences());
    expect(savePreferences(getDefaultPreferences(), failingStorage)).toBe(false);
    expect(loadUploadChecklist(failingStorage)).toBeNull();
    expect(clearUploadChecklist(failingStorage)).toBe(false);
  });
});
