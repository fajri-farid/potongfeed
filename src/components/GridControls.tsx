"use client";

import {
  MAX_GRID_COLUMNS,
  MAX_GRID_ROWS,
  MAX_ZOOM,
  MIN_GRID_COLUMNS,
  MIN_GRID_ROWS,
  getMinZoomForMode,
  isValidHexColor,
  normalizeCompositionTransform,
} from "@/lib/grid-geometry";
import type {
  AspectPreset,
  CompositionTransform,
  FitBackgroundType,
  FitMode,
  GridLayoutConfig,
} from "@/types/editor";

interface GridControlsProps {
  gridConfig: GridLayoutConfig;
  transform: CompositionTransform;
  disabled?: boolean;
  onChangeGridConfig: (next: GridLayoutConfig) => void;
  onChangeTransform: (next: CompositionTransform) => void;
  onResetTransform: () => void;
}

const ASPECT_OPTIONS: Array<{
  value: AspectPreset;
  label: string;
  hint: string;
  badge?: string;
  description: string;
}> = [
  {
    value: "4:5",
    label: "4:5",
    hint: "Standar IG",
    badge: "Default",
    description:
      "Ukuran standar feed IG — otomatis disesuaikan agar sambungan tetap 100% nyambung di profil 3:4.",
  },
  {
    value: "3:4",
    label: "3:4",
    hint: "Penuh Profil",
    description: "Mengikuti bentuk kotak profil Instagram terbaru dari ujung ke ujung.",
  },
  {
    value: "1:1",
    label: "1:1",
    hint: "Kotak",
    description: "Ukuran kotak persegi klasik Instagram.",
  },
];

const QUICK_GRID_PRESETS: Array<{
  columns: number;
  rows: number;
  label: string;
  sublabel: string;
}> = [
  { columns: 1, rows: 1, label: "1×1", sublabel: "1 Foto" },
  { columns: 2, rows: 1, label: "2×1", sublabel: "2 Kotak" },
  { columns: 3, rows: 1, label: "3×1", sublabel: "Default" },
  { columns: 3, rows: 2, label: "3×2", sublabel: "6 Kotak" },
  { columns: 3, rows: 3, label: "3×3", sublabel: "9 Kotak" },
];

const COLUMN_OPTIONS = [1, 2, 3] as const;

const BACKGROUND_OPTIONS: Array<{ value: FitBackgroundType; label: string }> = [
  { value: "white", label: "Putih" },
  { value: "black", label: "Hitam" },
  { value: "blur", label: "Blur Foto" },
  { value: "custom", label: "Pilih Warna" },
];

/**
 * Panel kontrol ukuran rasio potongan Instagram, preset cepat (1x1, 2x1, 3x1, dst.),
 * kustomisasi Kolom (1..3) x Baris (1..6), serta posisi foto.
 */
export function GridControls({
  gridConfig,
  transform,
  disabled = false,
  onChangeGridConfig,
  onChangeTransform,
  onResetTransform,
}: GridControlsProps) {
  const minZoom = getMinZoomForMode(transform.fitMode);
  const selectedAspectInfo =
    ASPECT_OPTIONS.find((item) => item.value === gridConfig.aspectPreset) ?? ASPECT_OPTIONS[0];
  const totalBoxes = gridConfig.columns * gridConfig.rows;

  const handleAspectChange = (aspectPreset: AspectPreset) => {
    onChangeGridConfig({ ...gridConfig, aspectPreset });
  };

  const handleColumnsChange = (nextColumns: number) => {
    const safeColumns = Math.min(
      MAX_GRID_COLUMNS,
      Math.max(MIN_GRID_COLUMNS, Math.round(nextColumns)),
    );
    onChangeGridConfig({ ...gridConfig, columns: safeColumns });
  };

  const handleRowsChange = (nextRows: number) => {
    const safeRows = Math.min(MAX_GRID_ROWS, Math.max(MIN_GRID_ROWS, Math.round(nextRows)));
    onChangeGridConfig({ ...gridConfig, rows: safeRows });
  };

  const handleFitModeChange = (fitMode: FitMode) => {
    onChangeTransform(
      normalizeCompositionTransform({
        ...transform,
        fitMode,
        zoom: fitMode === "fill" && transform.zoom < 1 ? 1.0 : transform.zoom,
      }),
    );
  };

  const handleZoomChange = (zoom: number) => {
    onChangeTransform(normalizeCompositionTransform({ ...transform, zoom }));
  };

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-900 uppercase">
            Ukuran &amp; Bentuk Grid
          </h2>
          <span className="text-[11px] font-medium text-indigo-600">Pilih rasio</span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {ASPECT_OPTIONS.map((option) => {
            const active = gridConfig.aspectPreset === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => handleAspectChange(option.value)}
                className={`relative rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-50 ${
                  active
                    ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600/20"
                    : "border-zinc-200 bg-zinc-50/60 text-zinc-700 hover:border-zinc-300 hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-bold">{option.label}</span>
                  {option.badge ? (
                    <span className="rounded bg-indigo-600 px-1 py-0.2 text-[9px] font-semibold text-white">
                      {option.badge}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-600">{option.hint}</div>
              </button>
            );
          })}
        </div>

        <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-600">
          {selectedAspectInfo.description}
        </p>
      </div>

      <div className="space-y-3 border-t border-zinc-100 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-700">Jumlah Potongan</span>
          <span className="font-mono text-[11px] font-semibold text-indigo-700">
            {gridConfig.columns}×{gridConfig.rows} (
            {totalBoxes === 1 ? "1 foto utuh" : `${totalBoxes} kotak`})
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {QUICK_GRID_PRESETS.map((preset) => {
            const active = gridConfig.columns === preset.columns && gridConfig.rows === preset.rows;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChangeGridConfig({
                    ...gridConfig,
                    columns: preset.columns,
                    rows: preset.rows,
                  })
                }
                className={`rounded-xl border px-1.5 py-1.5 text-center transition disabled:opacity-50 ${
                  active
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-2xs"
                    : "border-zinc-200 bg-zinc-50/70 text-zinc-700 hover:border-zinc-300 hover:bg-white"
                }`}
              >
                <div className="font-mono text-xs font-bold">{preset.label}</div>
                <div className={`text-[9px] ${active ? "text-indigo-100" : "text-zinc-500"}`}>
                  {preset.sublabel}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-2.5">
          <div>
            <span className="block text-[11px] font-medium text-zinc-600">Kolom (Menyamping)</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {COLUMN_OPTIONS.map((cols) => {
                const active = gridConfig.columns === cols;
                return (
                  <button
                    key={cols}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleColumnsChange(cols)}
                    className={`rounded-lg border py-1 font-mono text-xs font-semibold transition ${
                      active
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {cols}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-medium text-zinc-600">Baris (Ke Bawah)</span>
            <div className="mt-1.5 flex items-center justify-between rounded-lg border border-zinc-200 bg-white">
              <button
                type="button"
                disabled={disabled || gridConfig.rows <= MIN_GRID_ROWS}
                aria-label="Kurangi jumlah baris"
                onClick={() => handleRowsChange(gridConfig.rows - 1)}
                className="px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:text-zinc-950 disabled:opacity-40"
              >
                −
              </button>
              <span className="font-mono text-xs font-semibold text-zinc-900">
                {gridConfig.rows}
              </span>
              <button
                type="button"
                disabled={disabled || gridConfig.rows >= MAX_GRID_ROWS}
                aria-label="Tambah jumlah baris"
                onClick={() => handleRowsChange(gridConfig.rows + 1)}
                className="px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:text-zinc-950 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-900 uppercase">
            Posisi &amp; Tampilan Foto
          </h2>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={
                disabled ||
                (Math.abs(transform.offsetX) < 0.002 && Math.abs(transform.offsetY) < 0.002)
              }
              onClick={() =>
                onChangeTransform(
                  normalizeCompositionTransform({
                    ...transform,
                    offsetX: 0,
                    offsetY: 0,
                  }),
                )
              }
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 disabled:text-zinc-400"
            >
              Tengahkan
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onResetTransform}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-40"
            >
              Atur Ulang
            </button>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl bg-zinc-100 p-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleFitModeChange("fill")}
            className={`rounded-lg py-1.5 text-xs font-semibold transition ${
              transform.fitMode === "fill"
                ? "bg-white text-zinc-950 shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Penuhi Grid
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleFitModeChange("fit")}
            className={`rounded-lg py-1.5 text-xs font-semibold transition ${
              transform.fitMode === "fit"
                ? "bg-white text-zinc-950 shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Utuh + Latar
          </button>
        </div>

        <p className="mt-1.5 text-[11px] text-zinc-500">
          {transform.fitMode === "fill"
            ? "Foto memenuhi seluruh kotak grid tanpa menyisakan ruang kosong."
            : "Seluruh foto tampil utuh dengan tambahan warna latar di pinggirnya."}
        </p>

        <div className="mt-3.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="zoom-range" className="font-medium text-zinc-700">
              Perbesar / Perkecil Foto
            </label>
            <span className="font-mono text-[11px] font-semibold text-zinc-900">
              {Math.round(transform.zoom * 100)}%
            </span>
          </div>
          <input
            id="zoom-range"
            type="range"
            min={minZoom}
            max={MAX_ZOOM}
            step={0.01}
            disabled={disabled}
            value={transform.zoom}
            onChange={(event) => handleZoomChange(Number(event.target.value))}
            className="mt-1.5 w-full accent-indigo-600"
          />
        </div>

        {transform.fitMode === "fit" ? (
          <div className="mt-3.5 space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
            <p className="text-[11px] font-medium text-zinc-700">Warna Latar Belakang</p>
            <div className="grid grid-cols-2 gap-1.5">
              {BACKGROUND_OPTIONS.map((bg) => {
                const active = transform.backgroundType === bg.value;
                return (
                  <button
                    key={bg.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChangeTransform({ ...transform, backgroundType: bg.value })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {bg.label}
                  </button>
                );
              })}
            </div>

            {transform.backgroundType === "custom" ? (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  aria-label="Pilih warna latar"
                  disabled={disabled}
                  value={
                    isValidHexColor(transform.backgroundHex) ? transform.backgroundHex : "#FFFFFF"
                  }
                  onChange={(event) =>
                    onChangeTransform({
                      ...transform,
                      backgroundHex: event.target.value.toUpperCase(),
                    })
                  }
                  className="h-8 w-10 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
                />
                <input
                  type="text"
                  aria-label="Kode warna latar"
                  disabled={disabled}
                  value={transform.backgroundHex}
                  onChange={(event) =>
                    onChangeTransform({
                      ...transform,
                      backgroundHex: event.target.value.toUpperCase(),
                    })
                  }
                  onBlur={() => onChangeTransform(normalizeCompositionTransform(transform))}
                  maxLength={7}
                  placeholder="#FFFFFF"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
