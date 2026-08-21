"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(async () => {
          const registration = await navigator.serviceWorker.ready;
          const urls = [
            location.href,
            ...Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[rel='stylesheet'][href]"))
              .map((element) => (element instanceof HTMLScriptElement ? element.src : element.href))
              .filter(Boolean),
          ];
          registration.active?.postMessage({ type: "CACHE_URLS", urls });
        })
        .catch(() => {
          /* IndexedDB remains available even when offline shell registration fails. */
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
