"use client";

/**
 * A tiny localStorage-backed store shaped for `useSyncExternalStore`.
 *
 * Reading storage during render would desync hydration, and restoring it with
 * `setState` inside an effect causes cascading renders. Hydrating lazily on
 * first subscribe sidesteps both: the first render uses the server fallback,
 * then React re-reads the snapshot and swaps in the stored value.
 */
export type PersistedStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  /** Current value, safe to read from event handlers and async callbacks. */
  peek: () => T;
  set: (value: T) => void;
  update: (recipe: (current: T) => T) => void;
};

export function createPersistedStore<T>(
  key: string,
  fallback: T,
  revive: (stored: unknown, fallback: T) => T = (stored) => stored as T,
): PersistedStore<T> {
  let state = fallback;
  let hydrated = false;
  const listeners = new Set<() => void>();

  function read(): T {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return revive(JSON.parse(raw), fallback);
    } catch {
      return fallback;
    }
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  function persist() {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage full or blocked. In-memory state stays authoritative.
    }
  }

  return {
    subscribe(listener) {
      if (!hydrated) {
        hydrated = true;
        state = read();
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    getServerSnapshot: () => fallback,
    peek: () => state,
    set(value) {
      state = value;
      persist();
      emit();
    },
    update(recipe) {
      state = recipe(state);
      persist();
      emit();
    },
  };
}
