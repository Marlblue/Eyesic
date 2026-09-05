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
