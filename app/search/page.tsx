"use client";

import { useState, useTransition } from "react";
import { PlayIcon, SearchIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { TrackList } from "@/components/track-list";
import { Wave } from "@/components/ui/wave";
import { cacheTracks, createPlaylist } from "@/lib/library";
import { importPlaylist, searchTracks } from "@/lib/search-client";
import type { Track } from "@/lib/types";

type Mode = "search" | "import";

export default function SearchPage() {
  const player = usePlayer();
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [heading, setHeading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value || pending) return;

    setError(null);
    startTransition(async () => {
      try {
        const tracks = mode === "search" ? await searchTracks(value) : await importPlaylist(value);
        setResults(tracks);
        setHeading(
          mode === "search" ? `Hasil untuk "${value}"` : `${tracks.length} lagu dari playlist`,
        );
        cacheTracks(tracks);
      } catch (cause) {
        setResults([]);
        setHeading(null);
        setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Cari</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Cari lagu di YouTube, atau tempel link video / playlist.
        </p>
      </div>

      <div className="flex gap-1 rounded-full bg-white/5 p-1 text-sm">
        <ModeTab active={mode === "search"} onClick={() => setMode("search")}>
          Cari lagu
        </ModeTab>
        <ModeTab active={mode === "import"} onClick={() => setMode("import")}>
          Impor playlist
        </ModeTab>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            placeholder={
              mode === "search"
                ? "Judul lagu atau nama artis..."
                : "https://youtube.com/playlist?list=..."
            }
            aria-label={mode === "search" ? "Kata kunci pencarian" : "Link playlist"}
            className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-500 focus:bg-white/10"
          />
        </div>
        <button
          type="submit"
          disabled={pending || query.trim().length === 0}
          className="shrink-0 rounded-full bg-violet-600 px-6 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? <Wave className="h-4 w-8 text-white" /> : mode === "search" ? "Cari" : "Impor"}
        </button>
      </form>

      {mode === "search" ? (
        <p className="-mt-3 text-xs text-zinc-500">
          Pencarian dikirim hanya saat kamu tekan Enter, biar kuota API harian tetap aman.
        </p>
      ) : (
        <p className="-mt-3 text-xs text-zinc-500">
          Playlist harus Public atau Unlisted. Impor hampir tidak memakan kuota.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      {heading ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-medium text-zinc-300">{heading}</h2>
            {results.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => player.play(results, 0)}
                  className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <PlayIcon size={14} />
                  Putar semua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt("Simpan sebagai playlist bernama?", query.trim());
                    if (name !== null) createPlaylist(name, results);
                  }}
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
                >
                  Simpan jadi playlist
                </button>
              </>
            ) : null}
          </div>
          <TrackList tracks={results} emptyLabel="Tidak ada hasil." />
        </section>
      ) : null}
    </div>
  );
}

function ModeTab({
  active,
  children,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={
        active
          ? "flex-1 rounded-full bg-white/10 px-4 py-2 font-medium text-white"
          : "flex-1 rounded-full px-4 py-2 text-zinc-400 transition-colors hover:text-white"
      }
      {...props}
    >
      {children}
    </button>
  );
}
