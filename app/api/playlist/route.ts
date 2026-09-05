import { YouTubeApiError, fetchPlaylist } from "@/lib/youtube-api";
import { extractPlaylistId } from "@/lib/yt-url";

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  const playlistId = extractPlaylistId(input);

  if (!playlistId) {
    return Response.json(
      { error: "Tempel link playlist YouTube atau playlist id-nya." },
      { status: 400 },
    );
  }

  // "LM" (Liked Music) and "WL" (Watch Later) are private to the signed-in
  // account and are not reachable with an API key alone.
  if (playlistId === "LM" || playlistId === "WL") {
    return Response.json(
      { error: "Playlist bawaan YouTube (Liked Music / Watch Later) bersifat privat dan tidak bisa diimpor. Bikin playlist biasa yang di-set Public atau Unlisted." },
      { status: 400 },
    );
  }

  try {
    const tracks = await fetchPlaylist(playlistId);
    if (tracks.length === 0) {
      return Response.json(
        { error: "Playlist kosong atau privat. Pastikan visibility-nya Public/Unlisted." },
        { status: 404 },
      );
    }
    return Response.json({ tracks });
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      // A malformed id gets a 400 ("Invalid Value"), a well-formed but unknown
      // one a 404. Both mean the same thing to the person pasting a link.
      if (error.status === 400 || error.status === 404) {
        return Response.json(
          { error: "Playlist tidak ditemukan. Cek lagi link-nya, dan pastikan bukan playlist privat." },
          { status: 404 },
        );
      }
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("playlist import failed", error);
    return Response.json({ error: "Impor playlist gagal." }, { status: 500 });
  }
}
