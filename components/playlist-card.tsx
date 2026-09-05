"use client";

import Image from "next/image";
import Link from "next/link";
import { PlayIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import type { Playlist, Track } from "@/lib/types";

export function PlaylistCard({ playlist, tracks }: { playlist: Playlist; tracks: Track[] }) {
  const player = usePlayer();
  const cover = tracks.slice(0, 4);

  return (
    <div className="group relative flex flex-col gap-2">
      <Link
        href={`/playlist/${playlist.id}`}
        className="relative block aspect-square overflow-hidden rounded-xl bg-zinc-900"
      >
        {cover.length > 0 ? (
          <span className="grid h-full w-full grid-cols-2 grid-rows-2">
            {cover.map((track, index) => (
              <Image
                key={`${track.id}-${index}`}
                src={track.thumbnail}
                alt=""
                width={160}
                height={160}
                unoptimized
                className="h-full w-full object-cover"
              />
            ))}
            {/* One track fills the tile; two or three leave gaps we tint over. */}
            {Array.from({ length: 4 - cover.length }).map((_, index) => (
              <span key={`gap-${index}`} className="bg-zinc-900" />
            ))}
          </span>
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600 to-fuchsia-700 text-3xl">
            ♫
          </span>
        )}
      </Link>

      {tracks.length > 0 ? (
        <button
          type="button"
          onClick={() => player.play(tracks, 0)}
          aria-label={`Putar ${playlist.name}`}
          className="absolute right-2 top-2 flex h-10 w-10 translate-y-1 items-center justify-center rounded-full bg-violet-600 text-white opacity-0 shadow-lg transition-all hover:bg-violet-500 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
        >
          <PlayIcon size={16} />
        </button>
      ) : null}

      <div className="min-w-0">
        <Link
          href={`/playlist/${playlist.id}`}
          className="block truncate text-sm font-medium text-white hover:underline"
        >
          {playlist.name}
        </Link>
        <p className="text-xs text-zinc-500">{playlist.trackIds.length} lagu</p>
      </div>
    </div>
  );
}
