import { YouTubeApiError, fetchVideos, searchTracks } from "@/lib/youtube-api";
import { extractVideoId } from "@/lib/yt-url";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return Response.json({ error: "Query kosong" }, { status: 400 });
  }

  try {
    // A pasted link resolves for 1 quota unit instead of 101 — always prefer it.
    const videoId = extractVideoId(query);
    const tracks = videoId ? await fetchVideos([videoId]) : await searchTracks(query);
    return Response.json({ tracks });
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("search failed", error);
    return Response.json({ error: "Pencarian gagal. Coba lagi." }, { status: 500 });
  }
}
