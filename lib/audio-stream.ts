/** A same-origin URL supports mobile byte-range and background playback. */
export function audioUrl(videoId: string) {
  return `/api/audio/${encodeURIComponent(videoId)}`;
}
