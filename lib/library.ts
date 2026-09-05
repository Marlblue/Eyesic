"use client";

import { useSyncExternalStore } from "react";
import type { Playlist, Track } from "./types";

/**
 * The entire user library lives in localStorage — no account, no server, no
 * bill. Tracks are stored once in a `tracks` dictionary; likes, playlists and
 * history only hold ids, so a track renamed in one place is renamed everywhere.
 */
export type LibraryState = {
  tracks: Record<string, Track>;
  liked: string[];
  recent: string[];
  playlists: Playlist[];
};

const STORAGE_KEY = "mscapp:library:v1";
const MAX_RECENT = 60;

const EMPTY: LibraryState = { tracks: {}, liked: [], recent: [], playlists: [] };

let state: LibraryState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): LibraryState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LibraryState>;
    return {
      tracks: parsed.tracks ?? {},
      liked: parsed.liked ?? [],
      recent: parsed.recent ?? [],
      playlists: parsed.playlists ?? [],
    };
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function write(next: LibraryState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded or storage blocked — keep the in-memory state usable.
  }
  emit();
}

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    state = read();
    // Another tab edited the library.
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      state = read();
      emit();
    });
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

export function useLibrary() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Merge freshly fetched track metadata into the cache without losing ids. */
export function cacheTracks(tracks: Track[]) {
  if (tracks.length === 0) return;
  const merged = { ...state.tracks };
  for (const track of tracks) merged[track.id] = track;
  write({ ...state, tracks: merged });
}

export function toggleLike(track: Track) {
  const liked = state.liked.includes(track.id)
    ? state.liked.filter((id) => id !== track.id)
    : [track.id, ...state.liked];
  write({ ...state, liked, tracks: { ...state.tracks, [track.id]: track } });
}

export function pushRecent(track: Track) {
  const recent = [track.id, ...state.recent.filter((id) => id !== track.id)].slice(0, MAX_RECENT);
  write({ ...state, recent, tracks: { ...state.tracks, [track.id]: track } });
}

export function createPlaylist(name: string, tracks: Track[] = []) {
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: name.trim() || "Playlist baru",
    trackIds: tracks.map((t) => t.id),
    createdAt: Date.now(),
  };
  const cache = { ...state.tracks };
  for (const track of tracks) cache[track.id] = track;
  write({ ...state, tracks: cache, playlists: [playlist, ...state.playlists] });
  return playlist;
}

export function addToPlaylist(playlistId: string, tracks: Track[]) {
  const cache = { ...state.tracks };
  for (const track of tracks) cache[track.id] = track;
  write({
    ...state,
    tracks: cache,
    playlists: state.playlists.map((playlist) =>
      playlist.id === playlistId
        ? {
            ...playlist,
            trackIds: [
              ...playlist.trackIds,
              ...tracks.map((t) => t.id).filter((id) => !playlist.trackIds.includes(id)),
            ],
          }
        : playlist,
    ),
  });
}

export function removeFromPlaylist(playlistId: string, trackId: string) {
  write({
    ...state,
    playlists: state.playlists.map((playlist) =>
      playlist.id === playlistId
        ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId) }
        : playlist,
    ),
  });
}

export function deletePlaylist(playlistId: string) {
  write({ ...state, playlists: state.playlists.filter((p) => p.id !== playlistId) });
}

export function renamePlaylist(playlistId: string, name: string) {
  write({
    ...state,
    playlists: state.playlists.map((p) =>
      p.id === playlistId ? { ...p, name: name.trim() || p.name } : p,
    ),
  });
}

/** Resolve ids to tracks, dropping any whose metadata was evicted. */
export function resolveTracks(library: LibraryState, ids: string[]): Track[] {
  return ids.map((id) => library.tracks[id]).filter((track): track is Track => Boolean(track));
}

export function exportLibrary() {
  return JSON.stringify(state, null, 2);
}

export function importLibrary(json: string) {
  const parsed = JSON.parse(json) as Partial<LibraryState>;
  write({
    tracks: parsed.tracks ?? {},
    liked: parsed.liked ?? [],
    recent: parsed.recent ?? [],
    playlists: parsed.playlists ?? [],
  });
}
