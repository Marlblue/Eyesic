"use client";

import Link from "next/link";
import { PlayIcon, SearchIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { PlaylistCard } from "@/components/playlist-card";
import { TrackList } from "@/components/track-list";
import { Vinyl } from "@/components/vinyl";
import { APP_NAME } from "@/lib/config";
import { resolveTracks, useLibrary } from "@/lib/library";

export default function HomePage() {
  const library = useLibrary();
  const player = usePlayer();

  const recent = resolveTracks(library, library.recent);
  const liked = resolveTracks(library, library.liked);
  const isEmpty = recent.length === 0 && liked.length === 0 && library.playlists.length === 0;

  if (isEmpty) return <EmptyState />;

  return (
    <div className="flex flex-col gap-10">
      {recent.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h1 className="mr-auto text-2xl font-semibold tracking-tight text-white">
              Lanjut dengar
            </h1>
            <button
              type="button"
              onClick={() => player.play(recent, 0)}
              className="flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              <PlayIcon size={14} />
              Putar
            </button>
          </div>
          <TrackList tracks={recent.slice(0, 8)} />
        </section>
      ) : null}

      {library.playlists.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">Playlist kamu</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {library.playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                tracks={resolveTracks(library, playlist.trackIds)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {liked.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="mr-auto text-lg font-semibold text-white">Lagu disukai</h2>
            <Link
              href="/library"
              className="text-xs font-medium text-zinc-400 transition-colors hover:text-white"
            >
              Lihat semua
            </Link>
          </div>
          <TrackList tracks={liked.slice(0, 5)} />
        </section>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <Vinyl className="w-32" spinning />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Selamat datang di {APP_NAME}
        </h1>
        <p className="max-w-sm text-sm text-zinc-400">
          Koleksi kamu masih kosong. Cari lagu favorit atau impor playlist YouTube yang sudah kamu
          punya untuk mulai.
        </p>
      </div>
      <Link
        href="/search"
        className="flex items-center gap-2 rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
      >
        <SearchIcon size={16} />
        Mulai cari lagu
      </Link>
    </div>
  );
}
