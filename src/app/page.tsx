import Link from "next/link";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/lib/constants";

const HIGHLIGHTS = [
  {
    title: "100% Lokal di Browser",
    description: "Foto tidak pernah diunggah ke server dan siap dipakai offline (PWA).",
  },
  {
    title: "Kualitas HD / Lossless",
    description: "Mendukung PNG lossless & JPEG kualitas tinggi hingga resolusi asli.",
  },
  {
    title: "Grid 3:4 & Safe Area",
    description: "Pratinjau profil IG akurat agar teks dan wajah aman dari terpotong.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] [background-size:24px_24px] px-4 py-12 text-zinc-900 sm:px-6 sm:py-20">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm sm:p-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 32 32"
              className="h-8 w-8 rounded-lg border border-zinc-200 bg-zinc-50 p-1"
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
            <span className="text-base font-semibold tracking-tight text-zinc-950">{APP_NAME}</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 ring-1 ring-indigo-600/15">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" aria-hidden="true" />
              Segera Hadir
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-zinc-500">
              v{APP_VERSION}
            </span>
          </div>
        </header>

        <section className="mt-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl sm:leading-tight">
            Potong foto grid Instagram dengan presisi, langsung di browser Anda.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600 sm:text-base">{APP_TAGLINE}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/editor"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Buka Editor PotongFeed
              <span aria-hidden="true">→</span>
            </Link>
            <span className="text-xs text-zinc-500">
              Pratinjau landing page penuh sedang disiapkan
            </span>
          </div>
        </section>

        <section
          aria-label="Keunggulan utama"
          className="mt-8 grid divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-zinc-50/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          {HIGHLIGHTS.map((item) => (
            <div key={item.title} className="p-4">
              <h2 className="text-xs font-semibold text-zinc-900">{item.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.description}</p>
            </div>
          ))}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-5 text-xs text-zinc-500">
          <span>Gratis · Tanpa Watermark · Tanpa Login</span>
          <span>Open-Source &amp; Client-Side</span>
        </footer>
      </main>
    </div>
  );
}
