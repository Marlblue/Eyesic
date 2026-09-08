"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker. Only the UI is cached: audio comes
 * from the network through the audio proxy, which is not stored offline.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failures are non-fatal; the app works online regardless.
    });
  }, []);

  return null;
}
