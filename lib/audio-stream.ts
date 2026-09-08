/** The server proxies a mobile-compatible AAC stream with byte-range support. */
export function audioUrl(videoId: string) {
  return `/api/audio/${encodeURIComponent(videoId)}`;
}
