/**
 * Audio stream proxy — fetches a direct audio URL from Piped (an open-source
 * YouTube frontend) so the client can play it through a native `<audio>` element
 * that survives background/lockscreen on mobile.
 */

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
];

type PipedStream = {
  url: string;
  mimeType: string;
  bitrate: number;
  codec: string;
  quality: string;
};

type PipedResponse = {
  audioStreams?: PipedStream[];
  title?: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !/^[\w-]{11}$/.test(id)) {
    return Response.json({ error: "Video ID tidak valid" }, { status: 400 });
  }

  const errors: string[] = [];

  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await fetch(`${instance}/streams/${id}`, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });

      if (!response.ok) {
        errors.push(`${instance}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as PipedResponse;
      const streams = data.audioStreams ?? [];

      if (streams.length === 0) {
        errors.push(`${instance}: no audio streams`);
        continue;
      }

      // Prefer audio/mp4 (wider device support), then highest bitrate.
      const sorted = streams
        .filter((s) => s.url && s.mimeType)
        .sort((a, b) => {
          const aMp4 = a.mimeType.startsWith("audio/mp4") ? 1 : 0;
          const bMp4 = b.mimeType.startsWith("audio/mp4") ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return (b.bitrate || 0) - (a.bitrate || 0);
        });

      const best = sorted[0];
      if (!best) {
        errors.push(`${instance}: no valid stream URL`);
        continue;
      }

      return Response.json({
        url: best.url,
        mimeType: best.mimeType,
        bitrate: best.bitrate,
      });
    } catch (err) {
      errors.push(`${instance}: ${err instanceof Error ? err.message : "unknown"}`);
      continue;
    }
  }

  console.error("All Piped instances failed:", errors);
  return Response.json(
    { error: "Gagal mengambil audio stream. Coba lagi nanti." },
    { status: 502 },
  );
}
