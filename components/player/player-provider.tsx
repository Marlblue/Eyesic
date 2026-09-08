"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { audioUrl } from "@/lib/audio-stream";
import { pushRecent } from "@/lib/library";
import { createPersistedStore } from "@/lib/persisted-store";
import type { RepeatMode, Track } from "@/lib/types";

type PlayerContextValue = {
  current: Track | null;
  queue: Track[];
  /** Index into `queue` of the track that is loaded. -1 when idle. */
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;
  /** The queue sheet is opened from both the player card and the mobile nav. */
  isQueueOpen: boolean;
  openQueue: () => void;
  closeQueue: () => void;
  play: (tracks: Track[], startIndex?: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playAt: (queueIndex: number) => void;
  removeFromQueue: (queueIndex: number) => void;
  enqueue: (tracks: Track[]) => void;
  dismissError: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

type Session = { queue: Track[]; order: number[]; cursor: number; position: number };
type Prefs = {
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
};

const REPEAT_MODES: RepeatMode[] = ["off", "all", "one"];

/**
 * Playback lives in localStorage-backed stores rather than component state, so
 * the queue survives a reload and persistence needs no synchronising effects.
 */
const sessionStore = createPersistedStore<Session>(
  "mscapp:session:v1",
  { queue: [], order: [], cursor: -1, position: 0 },
  (stored, fallback) => {
    const value = stored as Partial<Session> | null;
    if (!Array.isArray(value?.queue) || !Array.isArray(value?.order)) return fallback;
    return {
      queue: value.queue,
      order: value.order,
      cursor: typeof value.cursor === "number" ? value.cursor : -1,
      position: typeof value.position === "number" ? value.position : 0,
    };
  },
);

const prefsStore = createPersistedStore<Prefs>(
  "mscapp:prefs:v1",
  { volume: 80, muted: false, shuffle: false, repeat: "off" },
  (stored, fallback) => {
    const value = stored as Partial<Prefs> | null;
    if (!value) return fallback;
    return {
      volume: typeof value.volume === "number" ? value.volume : fallback.volume,
      muted: Boolean(value.muted),
      shuffle: Boolean(value.shuffle),
      repeat: REPEAT_MODES.includes(value.repeat as RepeatMode)
        ? (value.repeat as RepeatMode)
        : "off",
    };
  },
);

/** Fisher-Yates over queue indices, with `first` pinned to the front. */
function shuffledOrder(length: number, first: number) {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 ? [first, ...rest] : rest;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const session = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot,
  );
  const prefs = useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.getSnapshot,
    prefsStore.getServerSnapshot,
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isQueueOpen, setQueueOpen] = useState(false);
  /** Live playhead. Null until the first tick, so a restored session shows its saved position. */
  const [tick, setTick] = useState<number | null>(null);

  const { queue, order, cursor } = session;
  const currentIndex = cursor >= 0 && cursor < order.length ? order[cursor] : -1;
  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;
  const currentId = current?.id ?? null;
  const position = tick ?? session.position;

  /**
   * A track only autoplays when the change came from a user gesture. On a cold
   * start the restored track is *cued* instead, because browsers reject
   * autoplay without an interaction and the player would land in a stuck state.
   */
  const autoplayRef = useRef(false);

  /** Tracks whether a URL fetch is in-flight, so stale fetches are ignored. */
  const loadIdRef = useRef(0);
  /** How many consecutive load errors for the same track (prevents infinite retry). */
  const retryCountRef = useRef(0);

  const advance = useCallback((delta: number, auto: boolean) => {
    const { order: ord, cursor: cur } = sessionStore.peek();
    if (ord.length === 0) return;

    const nextCursor = cur + delta;

    if (nextCursor >= ord.length) {
      if (prefsStore.peek().repeat === "all") {
        autoplayRef.current = true;
        setTick(0);
        sessionStore.update((state) => ({ ...state, cursor: 0, position: 0 }));
        return;
      }
      if (auto) setIsPlaying(false);
      return;
    }

    autoplayRef.current = true;
    setTick(0);
    sessionStore.update((state) => ({
      ...state,
      cursor: Math.max(nextCursor, 0),
      position: 0,
    }));
  }, []);

  // --- Create the native audio element. --------------------------------------
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audioRef.current = audio;

    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      setError(null);
    };
    const onPause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onTimeUpdate = () => setTick(audio.currentTime || 0);
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsBuffering(false);
      if (prefsStore.peek().repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        advance(1, true);
      }
    };

    /**
     * On error, the audio URL may have expired. Try re-fetching once: invalidate
     * the cache, bump the retry counter, and re-trigger the load effect by
     * resetting tick. If it fails twice in a row, skip to the next track.
     */
    const onError = () => {
      const { queue: q, order: o, cursor: c } = sessionStore.peek();
      const trackId = c >= 0 && c < o.length ? q[o[c]]?.id : undefined;

      if (retryCountRef.current < 1 && trackId) {
        retryCountRef.current++;
        // Retry the same-origin stream once and resume from the last playhead.
        const savedTime = audio.currentTime || 0;
        audio.src = `${audioUrl(trackId)}?retry=${Date.now()}`;
        audio.load();
        const resume = () => {
          audio.removeEventListener("canplay", resume);
          if (savedTime > 0) audio.currentTime = savedTime;
          audio.play().catch(() => {});
        };
        audio.addEventListener("canplay", resume);
        return;
      }

      const title = c >= 0 && c < o.length ? q[o[c]]?.title : undefined;
      setError(title ? `Gagal memutar "${title}"` : "Gagal memutar lagu");
      retryCountRef.current = 0;
      advance(1, true);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
    // advance is stable (no deps). This effect only runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load an audio URL for the given track. Called from the currentId effect and
   * from the error-retry handler.
   */
  const loadAudioForTrack = useCallback(
    async (videoId: string, shouldPlay: boolean, resumeAt?: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      const thisLoad = ++loadIdRef.current;
      setIsBuffering(true);

      try {
        const url = audioUrl(videoId);

        // A newer load started while we were preparing this track; discard it.
        if (loadIdRef.current !== thisLoad) return;

        audio.src = url;
        audio.load();

        if (resumeAt && resumeAt > 0) {
          // Wait for enough data to seek, then restore position.
          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay);
            if (loadIdRef.current !== thisLoad) return;
            audio.currentTime = resumeAt;
          };
          audio.addEventListener("canplay", onCanPlay);
        }

        if (shouldPlay) {
          await audio.play();
        }
      } catch (err) {
        if (loadIdRef.current !== thisLoad) return;
        setIsBuffering(false);
        setError(err instanceof Error ? err.message : "Gagal memuat audio");
      }
    },
    [],
  );

  // --- Load the current track. -----------------------------------------------
  useEffect(() => {
    if (!currentId) return;

    retryCountRef.current = 0;

    if (autoplayRef.current) {
      loadAudioForTrack(currentId, true);
    } else {
      // Cold start: fetch the URL but don't autoplay. Resume position from session.
      const resume = sessionStore.peek().position;
      loadAudioForTrack(currentId, false, resume > 0 ? resume : undefined);
    }
  }, [currentId, loadAudioForTrack]);

  // --- Apply volume and mute. ------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = prefs.volume / 100;
    audio.muted = prefs.muted;
  }, [prefs.volume, prefs.muted]);

  // Snapshot the playhead on the way out so the next visit resumes mid-track.
  useEffect(() => {
    const save = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const at = audio.currentTime || 0;
      if (sessionStore.peek().queue.length > 0) {
        sessionStore.update((state) => ({ ...state, position: at }));
      }
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);

  // Remember what was played, for the home screen.
  useEffect(() => {
    if (current && isPlaying) pushRecent(current);
  }, [current, isPlaying]);

  /**
   * Media Session: tells the OS this is real, active media so mobile Chrome
   * keeps the player alive (and shows lock-screen controls) instead of
   * suspending it once the screen locks — without this, playback stops the
   * moment the app is backgrounded.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      artwork: [{ src: current.thumbnail, sizes: "480x360", type: "image/jpeg" }],
    });
  }, [current]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Feed the lock-screen progress bar: without this the OS shows an
  // indeterminate scrubber even though we know exactly where we are.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const dur = duration || current?.duration || 0;
    if (dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: 1,
        position: Math.min(Math.max(position, 0), dur),
      });
    } catch {
      // Some browsers throw if position > duration due to a race.
    }
  }, [position, duration, current]);

  // --- Actions. --------------------------------------------------------------
  const play = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return;
    const start = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    const shuffle = prefsStore.peek().shuffle;

    autoplayRef.current = true;
    setError(null);
    setTick(0);
    sessionStore.set({
      queue: tracks,
      order: shuffle ? shuffledOrder(tracks.length, start) : tracks.map((_, i) => i),
      cursor: shuffle ? 0 : start,
      position: 0,
    });
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentId) return;
    autoplayRef.current = true;
    if (!audio.paused) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [currentId]);

  const next = useCallback(() => advance(1, false), [advance]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setTick(0);
      return;
    }
    advance(-1, false);
  }, [advance]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
    }
    setTick(seconds);
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(Math.max(Math.round(next), 0), 100);
    prefsStore.update((state) => ({
      ...state,
      volume: clamped,
      muted: clamped > 0 ? false : state.muted,
    }));
  }, []);

  const toggleMute = useCallback(() => {
    prefsStore.update((state) => ({ ...state, muted: !state.muted }));
  }, []);

  const toggleShuffle = useCallback(() => {
    const enabling = !prefsStore.peek().shuffle;
    prefsStore.update((state) => ({ ...state, shuffle: enabling }));
    sessionStore.update((state) => {
      if (state.order.length === 0) return state;
      const playing = state.cursor >= 0 ? state.order[state.cursor] : -1;
      return enabling
        ? {
            ...state,
            order: shuffledOrder(state.order.length, playing),
            cursor: playing >= 0 ? 0 : -1,
          }
        : {
            ...state,
            // Back to natural order, keeping the cursor on the same track.
            order: state.order.map((_, i) => i),
            cursor: playing >= 0 ? playing : -1,
          };
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    prefsStore.update((state) => ({
      ...state,
      repeat: REPEAT_MODES[(REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length],
    }));
  }, []);

  const playAt = useCallback((queueIndex: number) => {
    const target = sessionStore.peek().order.indexOf(queueIndex);
    if (target < 0) return;
    autoplayRef.current = true;
    setError(null);
    setTick(0);
    sessionStore.update((state) => ({ ...state, cursor: target, position: 0 }));
  }, []);

  const enqueue = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    sessionStore.update((state) => {
      const fresh = tracks.filter((track) => !state.queue.some((t) => t.id === track.id));
      if (fresh.length === 0) return state;
      return {
        ...state,
        queue: [...state.queue, ...fresh],
        order: [...state.order, ...fresh.map((_, i) => state.queue.length + i)],
      };
    });
  }, []);

  const removeFromQueue = useCallback((queueIndex: number) => {
    sessionStore.update((state) => {
      const playing = state.cursor >= 0 ? state.order[state.cursor] : -1;
      if (queueIndex === playing) return state; // Never drop the playing track.

      const removedAt = state.order.indexOf(queueIndex);
      return {
        ...state,
        queue: state.queue.filter((_, i) => i !== queueIndex),
        order: state.order
          .filter((index) => index !== queueIndex)
          .map((index) => (index > queueIndex ? index - 1 : index)),
        cursor:
          removedAt >= 0 && removedAt < state.cursor ? state.cursor - 1 : state.cursor,
      };
    });
  }, []);

  const dismissError = useCallback(() => setError(null), []);
  const openQueue = useCallback(() => setQueueOpen(true), []);
  const closeQueue = useCallback(() => setQueueOpen(false), []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    navigator.mediaSession.setActionHandler("play", () => audio?.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => audio?.pause());
    navigator.mediaSession.setActionHandler("previoustrack", previous);
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) seek(details.seekTime);
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [previous, next, seek]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      queue,
      currentIndex,
      isPlaying,
      isBuffering,
      position,
      duration: duration || current?.duration || 0,
      volume: prefs.volume,
      muted: prefs.muted,
      shuffle: prefs.shuffle,
      repeat: prefs.repeat,
      error,
      isQueueOpen,
      openQueue,
      closeQueue,
      play,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      playAt,
      removeFromQueue,
      enqueue,
      dismissError,
    }),
    [
      current,
      queue,
      currentIndex,
      isPlaying,
      isBuffering,
      position,
      duration,
      prefs,
      error,
      isQueueOpen,
      openQueue,
      closeQueue,
      play,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      playAt,
      removeFromQueue,
      enqueue,
      dismissError,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return context;
}
