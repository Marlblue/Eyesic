/** Parsing pasted YouTube links. Runs on both server and client. */

const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^[\w-]{12,}$/;

export function extractPlaylistId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (PLAYLIST_ID.test(value) && !VIDEO_ID.test(value)) return value;
  try {
    const url = new URL(value);
    const list = url.searchParams.get("list");
    if (list) return list;
  } catch {
    // Not a URL — fall through.
  }
  return null;
}

/**
 * A link to YouTube's own player (app or full site) for the given videos, in
 * order. Real background/lockscreen playback only works there — our own
 * embedded player is a cross-origin guest and can't get it (see
 * PlayerProvider's Media Session comment) — so this is the escape hatch: hand
 * playback off to YouTube itself instead of faking something that can't work.
 * A single id links straight to the video; more than one goes through
 * `watch_videos`, YouTube's own multi-id endpoint, which redirects to an
 * ad-hoc playlist so next/previous keep working after the handoff.
 */
export function youtubeWatchUrl(ids: string[]): string {
  const trimmed = ids.filter(Boolean).slice(0, 50);
  return trimmed.length > 1
    ? `https://www.youtube.com/watch_videos?video_ids=${trimmed.join(",")}`
    : `https://www.youtube.com/watch?v=${trimmed[0]}`;
}

export function extractVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (VIDEO_ID.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      return VIDEO_ID.test(id) ? id : null;
    }
    const v = url.searchParams.get("v");
    if (v && VIDEO_ID.test(v)) return v;
    // /shorts/<id>, /embed/<id>, /live/<id>
    const match = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname);
    if (match) return match[1];
  } catch {
    // Not a URL.
  }
  return null;
}
