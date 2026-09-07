"use client";

import type { Track } from "./types";

/**
 * Client-side cache for API results.
 *
 * A `search.list` call costs 100 of the 10,000 daily quota units, so a query
 * asked twice must never cost twice. The cache lives in `localStorage` rather
 * than `sessionStorage` so it survives closing the tab — repeat lookups of the
 * same song stay free forever, which is the dominant pattern for one person.
 */
const CACHE_PREFIX = "mscapp:cache:";

/** Track metadata is effectively static, so entries can live a long time. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Hard ceiling on stored queries. See `prune` for why this matters. */
const MAX_ENTRIES = 120;

type Entry = { at: number; tracks: Track[] };

const memory = new Map<string, Track[]>();

function storageKeys() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  return keys;
}

/**
 * Keep the cache small and disposable.
 *
 * The library shares this origin's `localStorage` quota, and it holds the only
 * copy of the user's playlists. A cache is always re-fetchable, so it yields
 * first: entries are dropped oldest-first, and a write that still fails throws
 * the whole cache away rather than risk starving a library write.
 */
function prune(target = MAX_ENTRIES) {
  const entries = storageKeys().map((key) => {
    let at = 0;
    try {
      at = (JSON.parse(localStorage.getItem(key) ?? "{}") as Entry).at ?? 0;
    } catch {
      // Unparseable entry: treat as ancient so it is evicted first.
    }
    return { key, at };
  });

  entries
    .sort((a, b) => a.at - b.at)
    .slice(0, Math.max(entries.length - target, 0))
    .forEach(({ key }) => localStorage.removeItem(key));
}

function clearCache() {
  storageKeys().forEach((key) => localStorage.removeItem(key));
}

function cacheGet(key: string): Track[] | null {
  const hit = memory.get(key);
  if (hit) return hit;

  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as Entry;
    if (!entry.tracks || Date.now() - entry.at > TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    memory.set(key, entry.tracks);
    return entry.tracks;
  } catch {
    return null;
  }
}

function cacheSet(key: string, tracks: Track[]) {
  memory.set(key, tracks);
  const payload = JSON.stringify({ at: Date.now(), tracks } satisfies Entry);

  try {
    localStorage.setItem(CACHE_PREFIX + key, payload);
  } catch {
    // Out of room. Make space, then give up entirely rather than compete with
    // the library for the last few bytes.
    try {
      prune(MAX_ENTRIES / 2);
      localStorage.setItem(CACHE_PREFIX + key, payload);
    } catch {
      clearCache();
    }
    return;
  }

  if (storageKeys().length > MAX_ENTRIES) prune();
}

/** `cacheKey` of null bypasses the cache in both directions. */
async function request(path: string, cacheKey: string | null): Promise<Track[]> {
  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  const response = await fetch(path);
  const body = (await response.json().catch(() => null)) as
    | { tracks?: Track[]; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(body?.error ?? `Gagal memuat (${response.status})`);
  }

  const tracks = body?.tracks ?? [];
  if (cacheKey) cacheSet(cacheKey, tracks);
  return tracks;
}

export function searchTracks(query: string) {
  return request(`/api/search?q=${encodeURIComponent(query)}`, `q:${query.toLowerCase()}`);
}

/**
 * Playlists are deliberately not cached on the client: an import costs about
 * two quota units, and the point of re-importing is to pick up tracks that were
 * added on YouTube since last time.
 */
export function importPlaylist(input: string) {
  return request(`/api/playlist?id=${encodeURIComponent(input)}`, null);
}

const suggestionMemory = new Map<string, string[]>();

/**
 * Search-as-you-type suggestions. Backed by an unmetered endpoint (see
 * `/api/suggest`), so this skips the localStorage cache used for real
 * searches — there is no quota to protect, just a plain in-memory cache to
 * avoid re-asking for the same half-typed word.
 */
export async function fetchSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const key = query.trim().toLowerCase();
  if (!key) return [];

  const cached = suggestionMemory.get(key);
  if (cached) return cached;

  const response = await fetch(`/api/suggest?q=${encodeURIComponent(key)}`, { signal });
  const body = (await response.json().catch(() => null)) as { suggestions?: string[] } | null;
  const suggestions = body?.suggestions ?? [];
  suggestionMemory.set(key, suggestions);
  return suggestions;
}
