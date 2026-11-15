"use client";

import { useRef, useState } from "react";
import { shouldWarnLargeImage } from "@/lib/image-loader";
import type { SourceImageMeta } from "@/types/editor";

interface DropzoneUploadProps {
  sourceImage: SourceImageMeta | null;
  isLoading: boolean;
  errorMessage: string | null;
  onSelectFile: (file: File) => void;
  variant?: "empty" | "compact";
}

/**
 * Area unggah foto lokal via klik file picker, drag-and-drop, atau tempel clipboard (Ctrl+V).
 */
export function DropzoneUpload({
  sourceImage,
  isLoading,
  errorMessage,
  onSelectFile,
  variant = "empty",
}: DropzoneUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFileList = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  const openPicker = () => {
    inputRef.current?.click();
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
      className="sr-only"
      aria-label="Pilih file foto dari perangkat"
      onChange={(event) => {
        handleFileList(event.target.files);
        event.target.value = "";
      }}
    />
  );

  if (variant === "compact" && sourceImage) {
    const showLargeInfo = shouldWarnLargeImage(sourceImage.naturalWidth, sourceImage.naturalHeight);

    return (
      <div className="space-y-2">
        {hiddenInput}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingOver(false);
            handleFileList(event.dataTransfer.files);
          }}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-2.5 shadow-2xs transition ${
            isDraggingOver ? "border-indigo-500 bg-indigo-50/40" : "border-zinc-200"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-zinc-900">{sourceImage.name}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Foto siap diatur • Kualitas jernih terjaga
            </p>
          </div>
          <button
            type="button"
            onClick={openPicker}
            disabled={isLoading}
            className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60"
          >
            {isLoading ? "Memuat..." : "Ganti Foto"}
          </button>
        </div>

        {showLargeInfo ? (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800"
          >
            Foto resolusi ekstra besar terdeteksi — kualitas jernih tetap terjaga otomatis saat
            dipotong.
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            {errorMessage}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl">
      {hiddenInput}
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingOver(false);
          handleFileList(event.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-center shadow-sm transition ${
          isDraggingOver
            ? "border-indigo-500 bg-indigo-50/60"
            : "border-zinc-300 hover:border-indigo-400 hover:bg-zinc-50/70"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-600/15">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        <h2 className="mt-4 text-base font-semibold text-zinc-950">
          {isLoading ? "Menyiapkan foto kamu..." : "Pilih atau tarik foto kamu ke sini"}
        </h2>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-500">
          Bisa pakai foto JPG, PNG, atau WebP. Di laptop, kamu juga bisa langsung tempel foto (
          <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
            Ctrl+V
          </kbd>
          ).
        </p>

        <span className="mt-5 inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs">
          Pilih Foto dari HP / Laptop
        </span>

        <p className="mt-4 text-[11px] font-medium text-emerald-700">
          100% langsung di perangkatmu • Tanpa daftar akun • Kualitas foto tetap jernih
        </p>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700"
        >
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
