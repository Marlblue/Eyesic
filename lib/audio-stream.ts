/** The resolver redirects the native player to a mobile-compatible AAC stream. */
export function audioUrl(videoId: string) {
  return `/api/audio/${encodeURIComponent(videoId)}`;
}
