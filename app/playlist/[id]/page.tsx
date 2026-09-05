"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PlayIcon, ShuffleIcon, TrashIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { TrackList } from "@/components/track-list";
import { Vinyl } from "@/components/vinyl";
import {
  deletePlaylist,
  removeFromPlaylist,
  renamePlaylist,
  resolveTracks,
  useLibrary,
} from "@/lib/library";
import { formatTime } from "@/lib/utils";

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const library = useLibrary();
  const player = usePlayer();

  const playlist = library.playlists.find((item) => item.id === id);

  if (!playlist) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-zinc-400">Playlist tidak ditemukan.</p>
        <Link
          href="/library"
          className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Kembali ke koleksi
        </Link>
      </div>
    );
  }

  const tracks = resolveTracks(library, playlist.trackIds);
  const total = tracks.reduce((sum, track) => sum + track.duration, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-end">
        <Vinyl src={tracks[0]?.thumbnail} className="w-36 shrink-0" />
        <div className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Playlist</p>
          <h1 className="text-center text-3xl font-bold tracking-tight text-white sm:text-left">
            {playlist.name}
          </h1>
          <p className="text-sm text-zinc-400">
            {tracks.length} lagu
            {total > 0 ? ` · ${formatTime(total)}` : ""}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={tracks.length === 0}
          onClick={() => player.play(tracks, 0)}
          className="flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
        >
          <PlayIcon size={16} />
          Putar
        </button>
        <button
          type="button"
          disabled={tracks.length === 0}
          onClick={() => {
            if (!player.shuffle) player.toggleShuffle();
            player.play(tracks, Math.floor(Math.random() * tracks.length));
          }}
          className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
        >
          <ShuffleIcon size={16} />
          Acak
        </button>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("Ganti nama playlist", playlist.name);
              if (name !== null) renamePlaylist(playlist.id, name);
            }}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
          >
            Ganti nama
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Hapus playlist "${playlist.name}"?`)) {
                deletePlaylist(playlist.id);
                router.push("/library");
              }
            }}
            aria-label="Hapus playlist"
            className="rounded-full border border-white/15 p-2 text-zinc-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      <TrackList
        tracks={tracks}
        emptyLabel="Playlist ini masih kosong. Tambahkan lagu lewat tombol + di hasil pencarian."
        onRemove={(track) => removeFromPlaylist(playlist.id, track.id)}
      />
    </div>
  );
}
