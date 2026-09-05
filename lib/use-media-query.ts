"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * Reading `matchMedia` during render would break hydration and setting it from
 * an effect would cascade renders, so the match is exposed as an external store
 * instead. The server snapshot is the caller's `fallback`.
 */
export function useMediaQuery(query: string, fallback = false) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/**
 * True on devices with a real pointer. Touch screens report no hover, so any
 * interaction that only opens on hover needs a tap equivalent there.
 */
export function useCanHover() {
  return useMediaQuery("(hover: hover)", true);
}
