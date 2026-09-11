"use client";

import { useEffect } from "react";
import { removeLegacyOfflineShell } from "../lib/service-worker-cleanup";

export default function LegacyOfflineCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) return;

    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => removeLegacyOfflineShell(registrations, window.caches))
      .catch(() => {
        // Cleanup is best effort; cloud sync must remain available even if the browser blocks it.
      });
  }, []);

  return null;
}
