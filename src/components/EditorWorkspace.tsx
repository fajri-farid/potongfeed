"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DropzoneUpload } from "@/components/DropzoneUpload";
import { EditorCanvas } from "@/components/EditorCanvas";
import { ExportPanel } from "@/components/ExportPanel";
import { GridControls } from "@/components/GridControls";
import { InstagramProfilePreview } from "@/components/InstagramProfilePreview";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { SafeAreaControls } from "@/components/SafeAreaControls";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import {
  DEFAULT_COMPOSITION_TRANSFORM,
  GRID_COLUMNS,
  computeTileCropPlans,
  normalizeCompositionTransform,
} from "@/lib/grid-geometry";
import { loadLocalImageFile, revokeSourceImageProxy } from "@/lib/image-loader";
import { DEFAULT_PREVIEW_IG_USERNAME, loadPreferences, savePreferences } from "@/lib/local-storage";
import type {
  CompositionTransform,
  ExportSettings,
  GridLayoutConfig,
  PersistedPreferences,
  SafeAreaOptions,
  SourceImageMeta,
} from "@/types/editor";

type MobileTab = "canvas" | "controls" | "preview";

const EMPTY_SUBSCRIBE = () => () => {};

function readInitialPreferences(): PersistedPreferences {
  return loadPreferences();
}

function EditorWorkspaceContent() {
  const [initialPrefs] = useState<PersistedPreferences>(() => readInitialPreferences());

  const [sourceImage, setSourceImage] = useState<SourceImageMeta | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("canvas");

  const [gridConfig, setGridConfig] = useState<GridLayoutConfig>({
    aspectPreset: initialPrefs.aspectPreset,
    columns: initialPrefs.columns ?? GRID_COLUMNS,
    rows: initialPrefs.rows,
  });

  const [transform, setTransform] = useState<CompositionTransform>({
    ...DEFAULT_COMPOSITION_TRANSFORM,
    fitMode: initialPrefs.fitMode,
    backgroundType: initialPrefs.backgroundType,
    backgroundHex: initialPrefs.backgroundHex,
  });

  const [safeAreaOptions, setSafeAreaOptions] = useState<SafeAreaOptions>(initialPrefs.safeArea);
  const [previewUsername, setPreviewUsername] = useState<string>(
    initialPrefs.previewUsername ?? DEFAULT_PREVIEW_IG_USERNAME,
  );

  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: initialPrefs.format,
    quality: initialPrefs.quality,
    resolutionMode: initialPrefs.resolutionMode,
  });

  const activeProxyRef = useRef<string | null>(null);

  useEffect(() => {
    activeProxyRef.current = sourceImage?.proxyUrl ?? null;
  }, [sourceImage]);

  useEffect(() => {
    return () => {
      revokeSourceImageProxy(activeProxyRef.current);
    };
  }, []);

  useEffect(() => {
    savePreferences({
      aspectPreset: gridConfig.aspectPreset,
      columns: gridConfig.columns,
      rows: gridConfig.rows,
      fitMode: transform.fitMode,
      backgroundType: transform.backgroundType,
      backgroundHex: transform.backgroundHex,
      safeArea: safeAreaOptions,
      previewUsername,
      format: exportSettings.format,
      quality: exportSettings.quality,
      resolutionMode: exportSettings.resolutionMode,
    });
  }, [gridConfig, transform, safeAreaOptions, previewUsername, exportSettings]);

  const handleSelectFile = useCallback(async (file: File) => {
    setIsImageLoading(true);
    setImageError(null);
    try {
      const loaded = await loadLocalImageFile(file);
      const signature = `${loaded.name}:${loaded.naturalWidth}x${loaded.naturalHeight}:${loaded.fileSizeBytes}`;

      const nextSource: SourceImageMeta = {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}`,
        signature,
        file: loaded.file,
        name: loaded.name,
        naturalWidth: loaded.naturalWidth,
        naturalHeight: loaded.naturalHeight,
        mimeType: loaded.mimeType,
        fileSizeBytes: loaded.fileSizeBytes,
        proxyUrl: loaded.proxyUrl,
      };

      setSourceImage((prev) => {
        if (prev) {
          revokeSourceImageProxy(prev.proxyUrl);
        }
        return nextSource;
      });

      setTransform((prev) =>
        normalizeCompositionTransform({
          ...prev,
          zoom: 1.0,
          offsetX: 0,
          offsetY: 0,
        }),
      );
      setMobileTab("canvas");
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Gagal memuat berkas gambar lokal.");
    } finally {
      setIsImageLoading(false);
    }
  }, []);

  // Mendukung paste gambar dari clipboard (Ctrl+V / Cmd+V) di seluruh halaman editor
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void handleSelectFile(file);
            return;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [handleSelectFile]);

  const handleGridConfigChange = (nextGrid: GridLayoutConfig) => {
    setGridConfig(nextGrid);
  };

  const splitPlan = useMemo(() => {
    if (!sourceImage) return null;
    return computeTileCropPlans({
      sourceWidth: sourceImage.naturalWidth,
      sourceHeight: sourceImage.naturalHeight,
      gridConfig,
      transform,
      exportSettings,
    });
  }, [sourceImage, gridConfig, transform, exportSettings]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 32 32"
                className="h-7 w-7 rounded-lg border border-zinc-200 bg-zinc-50 p-1"
                fill="none"
              >
                <rect x="4" y="3" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="12.75" y="3" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="21.5" y="3" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="4" y="12.25" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="12.75" y="12.25" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="21.5" y="12.25" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="4" y="21.5" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="12.75" y="21.5" width="6.5" height="7.5" rx="1.2" fill="#18181b" />
                <rect x="21.5" y="21.5" width="6.5" height="7.5" rx="1.2" fill="#4f46e5" />
              </svg>
              <span className="text-sm font-bold tracking-tight text-zinc-950">{APP_NAME}</span>
            </Link>
            <span className="hidden rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline-block">
              v{APP_VERSION}
            </span>
            <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/15 md:inline-flex">
              Aman &amp; Privat • Foto Tidak Pernah Diunggah ke Server
            </span>
          </div>

          <div className="flex items-center gap-2">
            <PwaInstallButton />
            <Link
              href="/"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950"
            >
              Beranda
            </Link>
          </div>
        </div>

        {sourceImage ? (
          <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-1.5 lg:hidden">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-200/70 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMobileTab("canvas")}
                className={`rounded-lg py-1.5 transition ${
                  mobileTab === "canvas" ? "bg-white text-zinc-950 shadow-2xs" : "text-zinc-600"
                }`}
              >
                1 · Kanvas
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("controls")}
                className={`rounded-lg py-1.5 transition ${
                  mobileTab === "controls" ? "bg-white text-zinc-950 shadow-2xs" : "text-zinc-600"
                }`}
              >
                2 · Ukuran Grid
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("preview")}
                className={`rounded-lg py-1.5 transition ${
                  mobileTab === "preview" ? "bg-white text-zinc-950 shadow-2xs" : "text-zinc-600"
                }`}
              >
                3 · Cek &amp; Unduh
              </button>
            </div>
          </div>
        ) : null}
      </header>

      {!sourceImage || !splitPlan ? (
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
          <div className="mb-6 text-center">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/15">
              Pemotong Grid Instagram Jernih
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
              Bikin Grid Profil Instagram yang Rapi
            </h1>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-zinc-600 sm:text-sm">
              Pilih 1 foto, geser posisinya, lihat dulu contoh tampilannya di profil Instagram, lalu
              unduh hasilnya sesuai urutan posting tanpa pecah.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-zinc-600">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                1. Pilih Foto
              </span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                2. Atur Grid (Otomatis 3×1 · 4:5 Nyambung)
              </span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                3. Unduh &amp; Posting dari #1
              </span>
            </div>
          </div>

          <DropzoneUpload
            sourceImage={null}
            isLoading={isImageLoading}
            errorMessage={imageError}
            onSelectFile={(file) => void handleSelectFile(file)}
            variant="empty"
          />
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-5 px-4 pt-5 pb-20 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)_370px] lg:pb-5 xl:grid-cols-[340px_minmax(0,1fr)_400px]">
          <aside className={`space-y-4 ${mobileTab === "controls" ? "block" : "hidden lg:block"}`}>
            <DropzoneUpload
              sourceImage={sourceImage}
              isLoading={isImageLoading}
              errorMessage={imageError}
              onSelectFile={(file) => void handleSelectFile(file)}
              variant="compact"
            />
            <GridControls
              gridConfig={gridConfig}
              transform={transform}
              onChangeGridConfig={handleGridConfigChange}
              onChangeTransform={setTransform}
              onResetTransform={() =>
                setTransform((prev) =>
                  normalizeCompositionTransform({
                    ...prev,
                    zoom: 1.0,
                    offsetX: 0,
                    offsetY: 0,
                  }),
                )
              }
            />
            <SafeAreaControls
              aspectPreset={gridConfig.aspectPreset}
              options={safeAreaOptions}
              onChange={setSafeAreaOptions}
            />
          </aside>

          <section
            className={`flex min-h-[420px] flex-col gap-3 ${
              mobileTab === "canvas" ? "flex" : "hidden lg:flex"
            }`}
          >
            <div className="lg:hidden">
              <DropzoneUpload
                sourceImage={sourceImage}
                isLoading={isImageLoading}
                errorMessage={imageError}
                onSelectFile={(file) => void handleSelectFile(file)}
                variant="compact"
              />
            </div>
            <EditorCanvas
              sourceImage={sourceImage}
              gridConfig={gridConfig}
              transform={transform}
              safeAreaOptions={safeAreaOptions}
              splitPlan={splitPlan}
              onChangeTransform={setTransform}
            />
          </section>

          <aside className={`space-y-4 ${mobileTab === "preview" ? "block" : "hidden lg:block"}`}>
            <InstagramProfilePreview
              sourceImage={sourceImage}
              transform={transform}
              safeAreaOptions={safeAreaOptions}
              previewUsername={previewUsername}
              splitPlan={splitPlan}
              onChangeSafeAreaOptions={setSafeAreaOptions}
              onChangePreviewUsername={setPreviewUsername}
            />
            <ExportPanel
              sourceImage={sourceImage}
              gridConfig={gridConfig}
              transform={transform}
              splitPlan={splitPlan}
              exportSettings={exportSettings}
              onChangeExportSettings={setExportSettings}
            />
          </aside>
        </main>
      )}

      {sourceImage && mobileTab !== "preview" ? (
        <button
          type="button"
          onClick={() => {
            setMobileTab("preview");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="fixed right-4 bottom-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg ring-2 ring-white transition hover:bg-indigo-700 active:scale-95 lg:hidden"
        >
          <span>Lanjut Cek &amp; Unduh</span>
          <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * Wrapper client-safe untuk menjaga hydration SSR tetap identik sebelum memuat preferensi lokal.
 */
export function EditorWorkspace() {
  const isClient = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    () => true,
    () => false,
  );

  if (!isClient) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-sm text-zinc-500">
        Memuat ruang kerja editor PotongFeed...
      </div>
    );
  }

  return <EditorWorkspaceContent />;
}
