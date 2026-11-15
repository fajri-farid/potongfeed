"use client";

import { useState } from "react";
import { isValidHexColor } from "@/lib/grid-geometry";
import {
  DEFAULT_PREVIEW_IG_USERNAME,
  MAX_PREVIEW_USERNAME_LENGTH,
  getPreviewAvatarInitials,
  normalizePreviewUsername,
  sanitizePreviewUsernameInput,
} from "@/lib/local-storage";
import type {
  CompositionTransform,
  GridSplitPlan,
  SafeAreaOptions,
  SourceImageMeta,
} from "@/types/editor";

interface InstagramProfilePreviewProps {
  sourceImage: SourceImageMeta;
  transform: CompositionTransform;
  safeAreaOptions: SafeAreaOptions;
  previewUsername: string;
  splitPlan: GridSplitPlan;
  onChangeSafeAreaOptions: (next: SafeAreaOptions) => void;
  onChangePreviewUsername: (next: string) => void;
}

/**
 * Simulasi interaktif tampilan profil Instagram (Light Mode) beserta urutan posting #1 -> #N.
 */
export function InstagramProfilePreview({
  sourceImage,
  transform,
  safeAreaOptions,
  previewUsername,
  splitPlan,
  onChangeSafeAreaOptions,
  onChangePreviewUsername,
}: InstagramProfilePreviewProps) {
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [draftUsername, setDraftUsername] = useState(previewUsername);

  const normalizedUsername = normalizePreviewUsername(previewUsername);
  const avatarInitials = getPreviewAvatarInitials(normalizedUsername);
  const isCustomUsername = normalizedUsername !== DEFAULT_PREVIEW_IG_USERNAME;

  const startEditingUsername = () => {
    setDraftUsername(normalizedUsername);
    setIsEditingUsername(true);
  };

  const commitUsername = () => {
    const nextUsername = normalizePreviewUsername(draftUsername);
    setIsEditingUsername(false);
    setDraftUsername(nextUsername);
    if (nextUsername !== normalizedUsername) {
      onChangePreviewUsername(nextUsername);
    }
  };
  const { geometry, placement, safeArea, tiles } = splitPlan;
  const isProfileCropMode = safeAreaOptions.previewMode === "profile-3-4";

  const customHex = isValidHexColor(transform.backgroundHex) ? transform.backgroundHex : "#FFFFFF";
  const backdropColor =
    transform.fitMode === "fit"
      ? transform.backgroundType === "black"
        ? "#000000"
        : transform.backgroundType === "custom"
          ? customHex
          : transform.backgroundType === "blur"
            ? "#18181B"
            : "#FFFFFF"
      : "#FFFFFF";

  const olderPostsCount = isProfileCropMode ? ((3 - (tiles.length % 3)) % 3) + 3 : 0;
  const olderPostsSlots = Array.from({ length: olderPostsCount }, (_, index) => index + 1);

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-900 uppercase">
          Contoh Tampilan di Profil IG
        </h2>
        <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={() =>
              onChangeSafeAreaOptions({ ...safeAreaOptions, previewMode: "profile-3-4" })
            }
            className={`rounded-md px-2 py-1 transition ${
              isProfileCropMode
                ? "bg-white font-semibold text-zinc-950 shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Di Profil IG
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeSafeAreaOptions({ ...safeAreaOptions, previewMode: "full-seamless" })
            }
            className={`rounded-md px-2 py-1 transition ${
              !isProfileCropMode
                ? "bg-white font-semibold text-zinc-950 shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Utuh Menyambung
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-zinc-700">
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={safeAreaOptions.showProfileHeaderMockup}
            onChange={(event) =>
              onChangeSafeAreaOptions({
                ...safeAreaOptions,
                showProfileHeaderMockup: event.target.checked,
              })
            }
            className="h-3.5 w-3.5 rounded accent-indigo-600"
          />
          <span>Tampilkan info profil</span>
        </label>

        {isProfileCropMode ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={safeAreaOptions.showGutterPreview}
              onChange={(event) =>
                onChangeSafeAreaOptions({
                  ...safeAreaOptions,
                  showGutterPreview: event.target.checked,
                })
              }
              className="h-3.5 w-3.5 rounded accent-indigo-600"
            />
            <span>Garis sela tipis</span>
          </label>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 text-xs font-semibold text-zinc-900">
          {isEditingUsername ? (
            <input
              type="text"
              autoFocus
              value={draftUsername}
              maxLength={MAX_PREVIEW_USERNAME_LENGTH}
              placeholder={DEFAULT_PREVIEW_IG_USERNAME}
              aria-label="Nama akun Instagram untuk preview"
              onChange={(event) =>
                setDraftUsername(sanitizePreviewUsernameInput(event.target.value))
              }
              onFocus={(event) => event.currentTarget.select()}
              onBlur={commitUsername}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitUsername();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setIsEditingUsername(false);
                  setDraftUsername(normalizedUsername);
                }
              }}
              className="w-40 rounded-md border border-indigo-300 bg-indigo-50/40 px-1.5 py-0.5 text-xs font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          ) : (
            <button
              type="button"
              onClick={startEditingUsername}
              title="Klik untuk ganti nama akun Instagram"
              aria-label={`Ubah nama akun Instagram (${normalizedUsername})`}
              className="group -mx-1 inline-flex max-w-[185px] items-center gap-1 rounded px-1 py-0.5 text-left transition hover:bg-zinc-100"
            >
              <span className="truncate">{normalizedUsername}</span>
              <svg
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-zinc-300 transition group-hover:text-zinc-500"
              >
                <path
                  d="M11.6 2.4a1.4 1.4 0 0 1 2 2L5.5 12.5 2.5 13.5l1-3 8.1-8.1Z"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <span className="font-mono text-[10px] text-zinc-400">
            {isProfileCropMode ? "Tampilan Profil" : `Ukuran ${geometry.aspectPreset}`}
          </span>
        </div>

        {safeAreaOptions.showProfileHeaderMockup ? (
          <div className="space-y-2.5 border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200">
                {avatarInitials}
              </div>
              <div className="grid flex-1 grid-cols-3 text-center text-[11px]">
                <div>
                  <div className="font-bold text-zinc-950">{tiles.length + 12}</div>
                  <div className="text-[10px] text-zinc-500">Postingan</div>
                </div>
                <div>
                  <div className="font-bold text-zinc-950">12,4rb</div>
                  <div className="text-[10px] text-zinc-500">Pengikut</div>
                </div>
                <div>
                  <div className="font-bold text-zinc-950">248</div>
                  <div className="text-[10px] text-zinc-500">Mengikuti</div>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-zinc-900">
                {isCustomUsername ? `@${normalizedUsername}` : "Akun Instagram Kamu"}
              </p>
              <p className="text-[10px] leading-snug text-zinc-500">
                Begini tampilan foto kamu saat dilihat di halaman profil Instagram.
              </p>
            </div>
          </div>
        ) : null}

        <div
          style={{
            gridTemplateColumns: `repeat(${isProfileCropMode ? 3 : geometry.columns}, minmax(0, 1fr))`,
          }}
          className={`grid bg-zinc-50 ${
            isProfileCropMode && safeAreaOptions.showGutterPreview ? "gap-[2px]" : "gap-0"
          }`}
        >
          {tiles.map((tile) => {
            const trimLeft = isProfileCropMode
              ? tile.normalizedTileRect.width * safeArea.ratioCropTrimFraction.left
              : 0;
            const trimRight = isProfileCropMode
              ? tile.normalizedTileRect.width * safeArea.ratioCropTrimFraction.right
              : 0;
            const visX = tile.normalizedTileRect.x + trimLeft;
            const visW = Math.max(0.0001, tile.normalizedTileRect.width - trimLeft - trimRight);
            const visY = tile.normalizedTileRect.y;
            const visH = Math.max(0.0001, tile.normalizedTileRect.height);

            return (
              <div
                key={`ig-${tile.row}-${tile.col}`}
                style={{
                  aspectRatio: isProfileCropMode ? "3 / 4" : String(geometry.tileAspectRatio),
                  backgroundColor: backdropColor,
                }}
                className="relative w-full overflow-hidden"
              >
                <div
                  style={{
                    width: `${(1 / visW) * 100}%`,
                    height: `${(1 / visH) * 100}%`,
                    left: `${-(visX / visW) * 100}%`,
                    top: `${-(visY / visH) * 100}%`,
                    backgroundColor: backdropColor,
                  }}
                  className="pointer-events-none absolute"
                >
                  {transform.fitMode === "fit" && transform.backgroundType === "blur" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- Simulasi blur proxy client-side */}
                      <img
                        src={sourceImage.proxyUrl}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
                      />
                      <div className="absolute inset-0 bg-black/15" />
                    </>
                  ) : null}

                  {/* eslint-disable-next-line @next/next/no-img-element -- Potongan CSS ternormalisasi 1:1 terhadap hasil ekspor */}
                  <img
                    src={sourceImage.proxyUrl}
                    alt=""
                    draggable={false}
                    style={{
                      left: `${placement.normalizedImageRect.x * 100}%`,
                      top: `${placement.normalizedImageRect.y * 100}%`,
                      width: `${placement.normalizedImageRect.width * 100}%`,
                      height: `${placement.normalizedImageRect.height * 100}%`,
                    }}
                    className="absolute max-w-none"
                  />
                </div>

                <span
                  className={`absolute right-1 bottom-1 rounded px-1 py-0.5 font-mono text-[9px] font-bold shadow-2xs ${
                    tile.uploadOrder === 1
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-900/70 text-white"
                  }`}
                >
                  #{tile.uploadOrder}
                </span>
              </div>
            );
          })}

          {isProfileCropMode
            ? olderPostsSlots.map((slot) => (
                <div
                  key={`older-post-${slot}`}
                  style={{ aspectRatio: "3 / 4" }}
                  className="flex items-center justify-center bg-zinc-100 text-[9px] font-medium text-zinc-400"
                >
                  Post lama
                </div>
              ))
            : null}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-[11px] leading-relaxed text-emerald-950">
        {tiles.length === 1 ? (
          <>
            Ukuran <strong>1×1</strong> menghasilkan <strong>1 foto utuh</strong> yang siap langsung
            kamu posting ke Instagram.
          </>
        ) : (
          <>
            <strong>Tips urutan upload:</strong> Supaya susunan gambar tidak terbalik di profil IG,
            posting berurutan mulai dari nomor <strong className="text-emerald-700">#1</strong>{" "}
            (kanan bawah) sampai <strong>#{tiles.length}</strong> (kiri atas).
          </>
        )}
      </div>
    </section>
  );
}
