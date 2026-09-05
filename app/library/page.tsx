"use client";

import { useRef, useState } from "react";
import { DownloadIcon, PlayIcon, PlusIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { PlaylistCard } from "@/components/playlist-card";
import { TrackList } from "@/components/track-list";
import { APP_SLUG } from "@/lib/config";
import {
  createPlaylist,
  exportLibrary,
  importLibrary,
  resolveTracks,
  useLibrary,
} from "@/lib/library";

export default function LibraryPage() {
  const library = useLibrary();
  const player = usePlayer();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const liked = resolveTracks(library, library.liked);

  function download() {
    const blob = new Blob([exportLibrary()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${APP_SLUG}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restore(file: File) {
    try {
      importLibrary(await file.text());
      setNotice("Koleksi berhasil dipulihkan.");
    } catch {
      setNotice("File backup tidak valid.");
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight text-white">Koleksi</h1>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Nama playlist baru?");
            if (name !== null) createPlaylist(name);
          }}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
        >
          <PlusIcon size={14} />
          Playlist baru
        </button>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold text-white">
            Lagu disukai
            <span className="ml-2 text-sm font-normal text-zinc-500">{liked.length}</span>
          </h2>
          {liked.length > 0 ? (
            <button
              type="button"
              onClick={() => player.play(liked, 0)}
              className="flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              <PlayIcon size={14} />
              Putar
            </button>
          ) : null}
        </div>
        <TrackList
          tracks={liked}
          emptyLabel="Belum ada lagu disukai. Tekan ikon hati di lagu mana pun."
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">
          Playlist
          <span className="ml-2 text-sm font-normal text-zinc-500">
            {library.playlists.length}
          </span>
        </h2>
        {library.playlists.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {library.playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                tracks={resolveTracks(library, playlist.trackIds)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
            Belum ada playlist. Buat baru, atau impor dari YouTube di halaman Cari.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-white/10 p-5">
        <h2 className="text-sm font-semibold text-white">Cadangkan koleksi</h2>
        <p className="text-xs text-zinc-400">
          Semua data disimpan di browser ini saja. Kalau kamu hapus data situs atau ganti HP,
          koleksi ikut hilang, jadi simpan backup sesekali.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            <DownloadIcon size={14} />
            Unduh backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            Pulihkan dari file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restore(file);
              event.target.value = "";
            }}
          />
        </div>
        {notice ? <p className="text-xs text-violet-300">{notice}</p> : null}
      </section>
    </div>
  );
}
