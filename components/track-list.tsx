"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HeartIcon, PlayIcon, PlusIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { Wave } from "@/components/ui/wave";
import { addToPlaylist, createPlaylist, toggleLike, useLibrary } from "@/lib/library";
import type { Track } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

export function TrackList({
  tracks,
  emptyLabel = "Belum ada lagu di sini.",
  onRemove,
}: {
  tracks: Track[];
  emptyLabel?: string;
  /** When provided, each row gets a remove action (used by playlist pages). */
  onRemove?: (track: Track) => void;
}) {
  const player = usePlayer();
  const library = useLibrary();

  if (tracks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {tracks.map((track, index) => {
        const isCurrent = player.current?.id === track.id;
        const liked = library.liked.includes(track.id);

        return (
          <li
            key={track.id}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5",
              isCurrent && "bg-white/5",
            )}
          >
            <button
              type="button"
              onClick={() => player.play(tracks, index)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                <Image
                  src={track.thumbnail}
                  alt=""
                  width={96}
                  height={96}
                  unoptimized
                  className="h-full w-full object-cover"
                />
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity",
                    isCurrent ? "opacity-100 text-violet-300" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  {isCurrent && player.isPlaying ? (
                    <Wave className="h-4 w-4" />
                  ) : (
                    <PlayIcon size={18} />
                  )}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    isCurrent ? "text-violet-300" : "text-white",
                  )}
                >
                  {track.title}
                </span>
                <span className="block truncate text-xs text-zinc-400">{track.artist}</span>
              </span>

              <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                {formatTime(track.duration)}
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => toggleLike(track)}
                aria-pressed={liked}
                aria-label={liked ? "Hapus dari suka" : "Suka"}
                className={cn(
                  "rounded-full p-2 transition",
                  liked
                    ? "text-rose-500"
                    : "text-zinc-600 opacity-0 hover:text-rose-400 group-hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                <HeartIcon size={16} filled={liked} />
              </button>

              <AddToPlaylistMenu track={track} />

              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(track)}
                  aria-label="Hapus dari playlist"
                  className="rounded-full p-2 text-zinc-600 opacity-0 transition hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <span aria-hidden className="block h-4 w-4 text-center text-lg leading-4">
                    &times;
                  </span>
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AddToPlaylistMenu({ track }: { track: Track }) {
  const library = useLibrary();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Tambah ke playlist"
        aria-expanded={open}
        className={cn(
          "rounded-full p-2 text-zinc-600 transition hover:text-white",
          open ? "text-white opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <PlusIcon size={16} />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 py-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("Nama playlist baru?");
              if (name !== null) createPlaylist(name, [track]);
              setOpen(false);
            }}
            className="w-full px-3 py-2 text-left text-sm font-medium text-violet-300 transition-colors hover:bg-white/5"
          >
            + Playlist baru
          </button>

          {library.playlists.length > 0 ? (
            <div className="my-1 h-px bg-white/10" />
          ) : null}

          <div className="max-h-56 overflow-y-auto">
            {library.playlists.map((playlist) => {
              const already = playlist.trackIds.includes(track.id);
              return (
                <button
                  key={playlist.id}
                  type="button"
                  disabled={already}
                  onClick={() => {
                    addToPlaylist(playlist.id, [track]);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/5 disabled:text-zinc-600 disabled:hover:bg-transparent"
                >
                  <span className="truncate">{playlist.name}</span>
                  {already ? <span className="shrink-0 text-xs">sudah ada</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
