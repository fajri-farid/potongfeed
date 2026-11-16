import Link from "next/link";
import { LandingSafeAreaDemo } from "@/components/LandingSafeAreaDemo";
import { AppHeader } from "@/components/AppHeader";

export default function HomePage() {
  return (
    <div className="landing-page studio-dot-grid">
      <AppHeader>
        <span className="app-header-note">Gratis. Tanpa daftar.</span>
        <Link href="/editor" className="app-nav-link">
          Buka editor <span aria-hidden="true">↗</span>
        </Link>
      </AppHeader>
      <main className="landing-main">
        <section className="landing-intro" aria-labelledby="landing-title">
          <p className="landing-eyebrow">
            <span aria-hidden="true" />
            PEMOTONG FOTO UNTUK INSTAGRAM
          </p>
          <h1 id="landing-title">
            Satu foto.
            <br />
            Feed Instagram
            <br />
            yang <span>nyambung.</span>
          </h1>
          <p className="landing-description">
            Potong satu foto jadi beberapa postingan yang menyatu di grid profilmu. Cek batas aman,
            lalu unduh sesuai urutan posting.
          </p>
          <div className="landing-cta-group">
            <Link href="/editor" className="landing-primary-link">
              Potong foto sekarang
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </Link>
            <p>Gratis, tanpa watermark.</p>
          </div>
        </section>
        <section className="landing-demo-column" aria-label="Contoh foto menjadi feed Instagram">
          <LandingSafeAreaDemo />
        </section>
      </main>
      <footer className="landing-footer">
        <p>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
            <path d="m10 2 6 2.5V10c0 3.5-6 7-6 7s-6-3.5-6-7V4.5L10 2Z" />
            <path d="m7.5 9.5 1.75 1.75 3.5-3.5" />
          </svg>
          Fotomu tetap di perangkatmu.
        </p>
        <span>Satu foto, banyak kemungkinan.</span>
      </footer>
    </div>
  );
}
