"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan Service Worker statis pada build produksi agar PotongFeed
 * dapat berjalan secara offline setelah dimuat pertama kali.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Abaikan kegagalan pendaftaran SW (mis. mode privat browser tertentu)
    });
  }, []);

  return null;
}
