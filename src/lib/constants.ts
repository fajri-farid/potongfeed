export const APP_NAME = "PotongFeed";
export const APP_TAGLINE =
  "Bagi satu foto jadi beberapa postingan yang menyatu di profil Instagram. Cek batas aman, lalu unduh potongan sesuai urutan posting.";
export const APP_VERSION = "0.1.0";

/** Alur produk yang sama pada landing page dan pengantar editor. */
export const PRODUCT_FLOW_STEPS = [
  {
    label: "Pilih foto",
    description: "Pilih satu foto atau desain dari HP maupun laptop.",
    badge: "Foto siap diatur",
  },
  {
    label: "Atur & cek",
    description: "Pilih ukuran grid, atur posisi foto, lalu cek batas aman dan tampilan profil.",
    badge: "Cek batas aman",
  },
  {
    label: "Unduh & posting",
    description: "Unduh potongan dalam ZIP. Posting sendiri ke Instagram mulai dari #1.",
    badge: "Posting mulai dari #1",
  },
] as const;
