import { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
];

type AudioSource = { url: string; mimeType: string; expiresAt: number };
type PipedStream = { url: string; mimeType?: string; bitrate?: number };
type PipedResponse = { audioStreams?: PipedStream[] };

const sourceCache = new Map<string, AudioSource>();
let youtubeClient: Promise<Innertube> | null = null;

function getYoutubeClient() {
  youtubeClient ??= Innertube.create({
    lang: "id",
    location: "ID",
    generate_session_locally: true,
  });
  return youtubeClient;
}

async function resolveFromPiped(id: string): Promise<AudioSource | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await fetch(`${instance}/streams/${id}`, {
        signal: AbortSignal.timeout(6_000),
        cache: "no-store",
      });
      if (!response.ok) continue;

      const streams = ((await response.json()) as PipedResponse).audioStreams ?? [];
      const best = streams
        .filter((stream) => stream.url)
        .sort((a, b) => {
          const aMp4 = a.mimeType?.startsWith("audio/mp4") ? 1 : 0;
          const bMp4 = b.mimeType?.startsWith("audio/mp4") ? 1 : 0;
          return bMp4 - aMp4 || (b.bitrate ?? 0) - (a.bitrate ?? 0);
        })[0];

      if (best) {
        return {
          url: best.url,
          mimeType: best.mimeType || "audio/mp4",
          expiresAt: Date.now() + 60 * 60 * 1000,
        };
      }
    } catch {
      // Public instances are best-effort; fall through to the next source.
    }
  }
  return null;
}

async function resolveFromYoutube(id: string): Promise<AudioSource> {
  const client = await getYoutubeClient();
  // The iOS client returns direct, unciphered AAC URLs. The generic web client
  // often returns signature-ciphered formats, which can temporarily break when
  // YouTube changes its player JavaScript.
  const info = await client.getBasicInfo(id, { client: "IOS" });
  const format = (info.streaming_data?.adaptive_formats ?? [])
    .filter((candidate) => candidate.has_audio && !candidate.has_video && candidate.url)
    .sort((a, b) => {
      const aMp4 = a.mime_type.startsWith("audio/mp4") ? 1 : 0;
      const bMp4 = b.mime_type.startsWith("audio/mp4") ? 1 : 0;
      return bMp4 - aMp4 || b.bitrate - a.bitrate;
    })[0];

  if (!format?.url) throw new Error("YouTube did not return a playable audio format");
  return {
    url: format.url,
    mimeType: format.mime_type?.split(";")[0] || "audio/mp4",
    expiresAt: Date.now() + 4 * 60 * 60 * 1000,
  };
}

async function resolveSource(id: string, refresh = false) {
  const cached = sourceCache.get(id);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached;
  let source: AudioSource;
  try {
    source = await resolveFromYoutube(id);
  } catch {
    const piped = await resolveFromPiped(id);
    if (!piped) throw new Error("No audio source is currently available");
    source = piped;
  }
  sourceCache.set(id, source);
  return source;
}

export async function GET(request: Request, { params }: RouteContext<"/api/audio/[id]">) {
  const { id } = await params;
  if (!/^[\w-]{11}$/.test(id)) {
    return Response.json({ error: "Video ID tidak valid" }, { status: 400 });
  }

  try {
    const retrying = new URL(request.url).searchParams.has("retry");
    const source = await resolveSource(id, retrying);
    // Let the media CDN carry the long-lived audio transfer. Keeping the body
    // inside a serverless route risks truncation when the function times out.
    return new Response(null, {
      status: 307,
      headers: {
        Location: source.url,
        "Content-Type": source.mimeType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(`Audio stream failed for ${id}:`, error);
    return Response.json(
      { error: "Gagal mengambil audio stream. Coba lagi nanti." },
      { status: 502 },
    );
  }
}
