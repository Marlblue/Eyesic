import "server-only";
import type { Track } from "./types";

const API_ROOT = "https://www.googleapis.com/youtube/v3";

/**
 * How long an upstream response stays cached, per endpoint.
 *
 * A search costs 100 of the 10,000 daily units and its answer barely changes —
 * a song's title, artist and duration are fixed once published — so it is
 * cached for a month.
 *
 * Playlist membership is the opposite and is not cached at all (0). Re-importing
 * exists precisely to pick up tracks added on YouTube since last time, and a
 * short TTL would not deliver that: `revalidate` is stale-while-revalidate, so
 * the first re-import after the window would still hand back the old list and
 * only refresh in the background. At roughly 2 units per import, paying every
 * time is far cheaper than showing a stale playlist.
 */
const REVALIDATE_SECONDS: Record<string, number> = {
  search: 60 * 60 * 24 * 30,
  videos: 60 * 60 * 24 * 30,
  playlistItems: 0,
};

const DEFAULT_REVALIDATE = 60 * 60 * 24;

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YouTubeApiError(
      "YOUTUBE_API_KEY belum di-set. Isi .env.local (lihat .env.example) lalu restart dev server.",
      503,
    );
  }
  return key;
}

async function call<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_ROOT}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey());

  const revalidate = REVALIDATE_SECONDS[endpoint] ?? DEFAULT_REVALIDATE;
  const response = await fetch(
    url,
    revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string; errors?: { reason?: string }[] } }
      | null;
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") {
      throw new YouTubeApiError(
        "Kuota YouTube API hari ini habis. Reset otomatis jam 15:00 WIB.",
        429,
      );
    }
    // Google messages arrive with markup in them, e.g. "the <code>playlistId</code>
    // parameter". Strip it, or the tags render as literal text in the UI.
    const message = body?.error?.message?.replace(/<[^>]+>/g, "").trim();
    throw new YouTubeApiError(
      message || `YouTube API error (${response.status})`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/** "PT3M34S" -> 214 */
export function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso);
  if (!match) return 0;
  const [, d, h, m, s] = match;
  return (
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Math.round(Number(s ?? 0))
  );
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(text: string) {
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/**
 * Marketing filler inside a bracket: it never distinguishes one upload from
 * another. Two regexes rather than one, because a `g` flag makes `.test()`
 * stateful via `lastIndex` and would skip every other match.
 */
const NOISE_WORD = /\b(?:official|hd|hq|uhd|4k|8k|1080p|720p|audio\s*only)\b/i;
const NOISE_WORDS = new RegExp(NOISE_WORD.source, "gi");

/** What is left of a bracket once the filler is gone, if it says nothing useful. */
const EMPTY_DESCRIPTORS = new Set(["", "-", "video", "vid", "mv", "m/v"]);

/**
 * Tidy up a YouTube title without erasing what tells two uploads apart.
 *
 * A channel routinely posts the same song as "(Official Music Video)" and
 * "(Official Lyric Video)". Dropping the whole bracket collapses them into two
 * identical rows, so only the filler is removed and the descriptor survives:
 * "(Official Music Video)" becomes "(Music Video)", while a bracket that then
 * says nothing at all — "(Official Video)", "[HD]" — is dropped outright.
 * Brackets carrying no filler, like "(feat. …)" or "(Live at …)", are untouched.
 */
export function cleanTitle(raw: string) {
  return decodeEntities(raw)
    .replace(/\s*[([]([^)\]]*)[)\]]/g, (match, inner: string) => {
      if (!NOISE_WORD.test(inner)) return match; // Genuine parenthetical, e.g. "(feat. …)".
      const kept = inner.replace(NOISE_WORDS, " ").replace(/\s{2,}/g, " ").trim();
      return EMPTY_DESCRIPTORS.has(kept.toLowerCase()) ? "" : ` (${kept})`;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** YouTube Music auto-generated channels are named "Artist - Topic". */
export function cleanArtist(raw: string) {
  return decodeEntities(raw)
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();
}

type Thumbnails = Record<string, { url: string } | undefined>;

function pickThumbnail(thumbnails: Thumbnails | undefined, videoId: string) {
  return (
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  );
}

type SearchResponse = {
  items?: {
    id?: { videoId?: string };
    snippet?: { title?: string; channelTitle?: string; thumbnails?: Thumbnails };
  }[];
};

type VideosResponse = {
  items?: {
    id?: string;
    contentDetails?: { duration?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: Thumbnails;
      liveBroadcastContent?: string;
    };
  }[];
};

/** Live and scheduled broadcasts have no real duration and are not songs. */
function isPlayableVideo(item: { snippet?: { liveBroadcastContent?: string } }) {
  const live = item.snippet?.liveBroadcastContent;
  return live === undefined || live === "none";
}

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: {
    contentDetails?: { videoId?: string };
    snippet?: { title?: string; videoOwnerChannelTitle?: string; thumbnails?: Thumbnails };
  }[];
};

/** search.list costs 100 units; the follow-up videos.list for durations costs 1. */
export async function searchTracks(query: string, limit = 25): Promise<Track[]> {
  const data = await call<SearchResponse>("search", {
    part: "snippet",
    q: query,
    type: "video",
    // Both filters matter: a video that is not embeddable simply will not play
    // in our hidden IFrame player, so it must never reach the results list.
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: String(Math.min(Math.max(limit, 1), 50)),
  });

  const tracks: Track[] = [];
  for (const item of data.items ?? []) {
    const id = item.id?.videoId;
    if (!id) continue;
    tracks.push({
      id,
      title: cleanTitle(item.snippet?.title ?? "Tanpa judul"),
      artist: cleanArtist(item.snippet?.channelTitle ?? "Unknown"),
      thumbnail: pickThumbnail(item.snippet?.thumbnails, id),
      duration: 0,
    });
  }

  return withDurations(tracks);
}

/**
 * Fill in durations in bulk (videos.list takes up to 50 ids for 1 unit) and
 * drop anything that is not a playable song: live or scheduled broadcasts, and
 * ids the API declines to return at all because they are private, deleted or
 * blocked in this region. Those would only surface as rows that fail on click.
 */
export async function withDurations(tracks: Track[]): Promise<Track[]> {
  if (tracks.length === 0) return tracks;

  const durations = new Map<string, number>();
  for (let i = 0; i < tracks.length; i += 50) {
    const batch = tracks.slice(i, i + 50);
    const data = await call<VideosResponse>("videos", {
      // Adding `snippet` keeps this at 1 unit: list quota is per call, not per part.
      part: "contentDetails,snippet",
      id: batch.map((track) => track.id).join(","),
    });
    for (const item of data.items ?? []) {
      if (!item.id || !isPlayableVideo(item)) continue;
      const seconds = parseIsoDuration(item.contentDetails?.duration);
      if (seconds > 0) durations.set(item.id, seconds);
    }
  }

  return tracks.flatMap((track) => {
    const duration = durations.get(track.id);
    return duration ? [{ ...track, duration }] : [];
  });
}

/** playlistItems.list costs 1 unit per page of 50 — importing is essentially free. */
export async function fetchPlaylist(playlistId: string, maxPages = 4): Promise<Track[]> {
  const tracks: Track[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await call<PlaylistItemsResponse>("playlistItems", params);

    for (const item of data.items ?? []) {
      const id = item.contentDetails?.videoId;
      const title = item.snippet?.title ?? "";
      if (!id) continue;
      // Deleted/private entries stay in the playlist as tombstones.
      if (title === "Private video" || title === "Deleted video") continue;
      tracks.push({
        id,
        title: cleanTitle(title),
        artist: cleanArtist(item.snippet?.videoOwnerChannelTitle ?? "Unknown"),
        thumbnail: pickThumbnail(item.snippet?.thumbnails, id),
        duration: 0,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return withDurations(tracks);
}

export async function fetchVideos(ids: string[]): Promise<Track[]> {
  if (ids.length === 0) return [];
  const data = await call<VideosResponse>("videos", {
    part: "snippet,contentDetails",
    id: ids.slice(0, 50).join(","),
  });
  return (data.items ?? []).flatMap((item) => {
    const id = item.id;
    if (!id || !isPlayableVideo(item)) return [];
    return [
      {
        id,
        title: cleanTitle(item.snippet?.title ?? "Tanpa judul"),
        artist: cleanArtist(item.snippet?.channelTitle ?? "Unknown"),
        thumbnail: pickThumbnail(item.snippet?.thumbnails, id),
        duration: parseIsoDuration(item.contentDetails?.duration),
      },
    ];
  });
}
