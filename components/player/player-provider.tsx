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
import { pushRecent } from "@/lib/library";
import { createPersistedStore } from "@/lib/persisted-store";
import type { RepeatMode, Track } from "@/lib/types";
import {
  FATAL_ERROR_CODES,
  PlayerState,
  describeYouTubeError,
  loadYouTubeApi,
  type YTPlayer,
} from "@/lib/yt-iframe";

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
  keepAwake: boolean;
  toggleKeepAwake: () => void;
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
  keepAwake: boolean;
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
  { volume: 80, muted: false, shuffle: false, repeat: "off", keepAwake: false },
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
      // Off by default: it only fights auto-lock-on-idle, not a deliberate
      // lock, and forcing the screen to stay lit for that alone is a bad
      // trade most people would not want without asking first.
      keepAwake: Boolean(value.keepAwake),
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
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const silenceRef = useRef<HTMLAudioElement | null>(null);

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

  const [playerReady, setPlayerReady] = useState(false);
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

  // --- Create the player once the IFrame API is available. -------------------
  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current || playerRef.current) return;

        playerRef.current = new YT.Player(hostRef.current, {
          width: 200,
          height: 200,
          playerVars: {
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: () => setPlayerReady(true),
            onStateChange: (event) => {
              switch (event.data) {
                case PlayerState.PLAYING:
                  setIsPlaying(true);
                  setIsBuffering(false);
                  setDuration(event.target.getDuration() || 0);
                  // Audio is out: whatever failed before is history. Without
                  // this a skipped track leaves its warning on screen forever.
                  setError(null);
                  break;
                case PlayerState.PAUSED:
                  setIsPlaying(false);
                  setIsBuffering(false);
                  break;
                case PlayerState.BUFFERING:
                  setIsBuffering(true);
                  break;
                case PlayerState.ENDED:
                  setIsBuffering(false);
                  if (prefsStore.peek().repeat === "one") {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                  } else {
                    advance(1, true);
                  }
                  break;
                case PlayerState.CUED:
                  setIsBuffering(false);
                  setDuration(event.target.getDuration() || 0);
                  break;
              }
            },
            onError: (event) => {
              const reason = describeYouTubeError(event.data);
              const fatal = FATAL_ERROR_CODES.has(event.data);

              // Name the track that failed: the player has already moved on by
              // the time anyone reads this, so "this video" would be ambiguous.
              const { queue: q, order: o, cursor: c } = sessionStore.peek();
              const title = c >= 0 && c < o.length ? q[o[c]]?.title : undefined;

              setError(
                fatal && title ? `Dilewati "${title}" — ${reason}` : reason,
              );
              if (fatal) advance(1, true);
            },
          },
        });
      })
      .catch(() => setError("Gagal memuat player YouTube. Cek koneksi internet."));

    return () => {
      cancelled = true;
    };
  }, [advance]);

  // --- Load the current track into the player. -------------------------------
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !currentId) return;

    if (autoplayRef.current) {
      player.loadVideoById(currentId);
      return;
    }

    // Cold start: park the track where the last session left off, ready for
    // the first click. No state is touched, so nothing cascades.
    player.cueVideoById(currentId);
    const resume = sessionStore.peek().position;
    if (resume > 0) player.seekTo(resume, true);
  }, [currentId, playerReady]);

  // Applying volume needs the player to exist, so it is its own effect.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady) return;
    player.setVolume(prefs.volume);
    if (prefs.muted) player.mute();
    else player.unMute();
  }, [prefs.volume, prefs.muted, playerReady]);

  // --- Progress ticker, only while actually playing. -------------------------
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setTick(player.getCurrentTime() || 0);
      const total = player.getDuration() || 0;
      if (total) setDuration(total);
    }, 500);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  // Snapshot the playhead on the way out so the next visit resumes mid-track.
  useEffect(() => {
    const save = () => {
      const player = playerRef.current;
      if (!player) return;
      const at = player.getCurrentTime() || 0;
      if (sessionStore.peek().queue.length > 0) {
        sessionStore.update((state) => ({ ...state, position: at }));
      }
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);

  /**
   * Keeps the screen from auto-locking on idle timeout while a track plays.
   * Opt-in and off by default: it only fights the *automatic* idle lock, not
   * a deliberate power-button press (that still hides the page and lets
   * playback stop as usual), so forcing the screen to stay lit for that alone
   * is a trade-off worth leaving to the listener rather than assuming.
   */
  useEffect(() => {
    if (
      !isPlaying ||
      !prefs.keepAwake ||
      typeof navigator === "undefined" ||
      !("wakeLock" in navigator)
    )
      return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (cancelled) lock.release().catch(() => {});
          else sentinel = lock;
        })
        .catch(() => {
          // Denied or unsupported right now — not fatal, just no-op.
        });
    };
    acquire();

    // The lock is released by the browser whenever the page goes hidden, so
    // it has to be re-requested by hand on the way back if still playing.
    const onVisible = () => {
      if (!document.hidden && !sentinel) acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [isPlaying, prefs.keepAwake]);

  /**
   * Silent audio keep-alive: a same-origin <audio> element that loops a tiny
   * silent MP3 while playback is active. This is the key to background audio:
   * the browser treats a page with a playing <audio> as "actively producing
   * media" and will not suspend or throttle it when the tab goes hidden, the
   * screen locks, or the user switches apps. The YouTube IFrame embed then
   * rides along in the same unsuspended page and keeps streaming.
   *
   * The volume is near-zero (not actually zero — some browsers treat muted or
   * volume-0 audio as "not really playing" and suspend anyway).
   */
  useEffect(() => {
    const audio = new Audio("/silence.wav");
    audio.loop = true;
    audio.volume = 0.01;
    // Needed on some mobile browsers to allow programmatic .play().
    audio.setAttribute("playsinline", "true");
    // In the document rather than floating: an element that is not attached is
    // treated as disposable and gets silenced the moment the app is
    // backgrounded, which is the one moment this element exists for. It renders
    // nothing — the UA stylesheet hides an <audio> without controls.
    document.body.appendChild(audio);
    silenceRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load(); // Release resources.
      audio.remove();
      silenceRef.current = null;
    };
  }, []);

  // Sync silent audio state with playback: play when music plays, pause when
  // it pauses. The .play() call can reject if the browser hasn't had a user
  // gesture yet (cold start with a cued track) — that's fine, the keep-alive
  // only matters once the user has interacted and started real playback.
  useEffect(() => {
    const silence = silenceRef.current;
    if (!silence) return;
    if (isPlaying) {
      silence.play().catch(() => {});
    } else {
      silence.pause();
    }
  }, [isPlaying]);

  /**
   * YouTube's own embed pauses itself when the tab goes hidden (screen lock,
   * switching apps) — that is enforced on their end and out of our control.
   * What we *can* do is pick the track back up the moment the app is visible
   * again, so returning to it does not require hunting for the play button.
   */
  const wantsPlayingRef = useRef(false);
  useEffect(() => {
    wantsPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !wantsPlayingRef.current) return;
      const player = playerRef.current;
      if (player && player.getPlayerState() !== PlayerState.PLAYING) player.playVideo();
      // Re-kick the silence loop too, in case the browser paused it.
      silenceRef.current?.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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
    const player = playerRef.current;
    if (!player || !currentId) return;
    autoplayRef.current = true;
    if (player.getPlayerState() === PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }, [currentId]);

  const next = useCallback(() => advance(1, false), [advance]);

  const previous = useCallback(() => {
    const player = playerRef.current;
    if (player && player.getCurrentTime() > 3) {
      player.seekTo(0, true);
      setTick(0);
      return;
    }
    advance(-1, false);
  }, [advance]);

  const seek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
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

  const toggleKeepAwake = useCallback(() => {
    prefsStore.update((state) => ({ ...state, keepAwake: !state.keepAwake }));
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
    navigator.mediaSession.setActionHandler("play", () => playerRef.current?.playVideo());
    navigator.mediaSession.setActionHandler("pause", () => playerRef.current?.pauseVideo());
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
      keepAwake: prefs.keepAwake,
      toggleKeepAwake,
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
      toggleKeepAwake,
      playAt,
      removeFromQueue,
      enqueue,
      dismissError,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/*
        The real YouTube player. It is full-size and genuinely rendered, only
        painted behind the opaque app shell, because zero-sized or
        `display:none` players get their playback throttled by browsers.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 right-0 -z-10 h-[200px] w-[200px] overflow-hidden"
      >
        <div ref={hostRef} />
      </div>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return context;
}
