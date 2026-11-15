"use client";

import { getSafeAreaBands } from "@/lib/grid-geometry";
import type { AspectPreset, SafeAreaOptions } from "@/types/editor";

interface SafeAreaControlsProps {
  aspectPreset: AspectPreset;
  options: SafeAreaOptions;
  onChange: (next: SafeAreaOptions) => void;
}

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}

function ToggleRow({ label, hint, checked, onToggle }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 transition hover:border-zinc-300">
      <div className="min-w-0">
        <div className="text-xs font-medium text-zinc-900">{label}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{hint}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-indigo-600"
      />
    </label>
  );
}

/**
 * Panel pengatur garis bantu visual pada kanvas editor.
 */
export function SafeAreaControls({ aspectPreset, options, onChange }: SafeAreaControlsProps) {
  const bands = getSafeAreaBands(aspectPreset);

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-900 uppercase">
          Garis Bantu Kanvas
        </h2>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-600">
          Rasio {aspectPreset}
        </span>
      </div>

      <div className="space-y-2">
        <ToggleRow
          label="Garis Potong & Nomor Urut"
          hint="Tampilkan garis pembagi kotak dan nomor urutan posting (#1, #2, dst)."
          checked={options.showSplitLines}
          onToggle={(showSplitLines) => onChange({ ...options, showSplitLines })}
        />
        <ToggleRow
          label="Batas Tepi di Profil IG"
          hint={bands.trimDescription}
          checked={options.showRatioSafeCrop}
          onToggle={(showRatioSafeCrop) => onChange({ ...options, showRatioSafeCrop })}
        />
        <ToggleRow
          label="Area Aman Teks & Wajah"
          hint="Jaga tulisan penting, logo, atau wajah tetap di dalam garis hijau agar tidak terpotong."
          checked={options.showContentSafeZone}
          onToggle={(showContentSafeZone) => onChange({ ...options, showContentSafeZone })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-rose-500/30 ring-1 ring-rose-500" />
          Tepi yang terpotong di profil
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs border border-dashed border-emerald-600 bg-emerald-500/10" />
          Area aman teks &amp; wajah
        </span>
      </div>
    </section>
  );
}
