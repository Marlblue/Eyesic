/**
 * Loader for the YouTube IFrame Player API.
 *
 * The API is a global singleton: the script sets `window.YT` asynchronously and
 * calls `window.onYouTubeIframeAPIReady` exactly once. Everything funnels
 * through one memoised promise so React strict-mode double effects, multiple
 * providers, or a remount never inject the script twice.
 */

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YTPlayer = {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement | string,
    options: {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("loadYouTubeApi must run in the browser"));
      return;
    }
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    // Chain rather than clobber: another script may already own this hook.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YTNamespace);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existing) return; // Already in flight; our hook will fire.

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load the YouTube IFrame API"));
    document.head.appendChild(script);
  });

  return apiPromise;
}

/** YouTube error codes that mean "this video will never play here". */
export const FATAL_ERROR_CODES = new Set([2, 5, 100, 101, 150]);

export function describeYouTubeError(code: number) {
  switch (code) {
    case 2:
      return "YouTube menolak video ini";
    case 5:
      return "Video ini tidak bisa diputar di player HTML5";
    case 100:
      return "Video sudah dihapus atau diprivat";
    case 101:
    case 150:
      return "Pemilik video melarang pemutaran di luar YouTube";
    default:
      return "Gagal memutar video ini";
  }
}
