/**
 * Client-side helper to fetch audio stream URLs from our API proxy.
 *
 * URLs are cached in memory for a few hours (they expire on Piped's side), and
 * automatically invalidated when a playback error suggests expiration.
 */

type AudioInfo = { url: string; mimeType: string };
type CacheEntry = AudioInfo & { fetchedAt: number };

/** URLs live for a few hours on Piped's proxy; refresh well before that. */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const cache = new Map<string, CacheEntry>();

export async function fetchAudioUrl(videoId: string): Promise<AudioInfo> {
  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { url: cached.url, mimeType: cached.mimeType };
  }

  const response = await fetch(`/api/audio/${encodeURIComponent(videoId)}`);
  const data = (await response.json()) as { url?: string; mimeType?: string; error?: string };

  if (!response.ok || !data.url) {
    throw new Error(data.error || "Gagal mengambil audio stream");
  }

  const entry: CacheEntry = {
    url: data.url,
    mimeType: data.mimeType || "audio/mp4",
    fetchedAt: Date.now(),
  };
  cache.set(videoId, entry);
  return { url: entry.url, mimeType: entry.mimeType };
}

/** Drop the cached URL so the next fetch hits the API again. */
export function invalidateAudioUrl(videoId: string) {
  cache.delete(videoId);
}
