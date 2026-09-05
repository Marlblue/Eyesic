"use client";

import Image from "next/image";
import { useEffect } from "react";
import { XIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { Wave } from "@/components/ui/wave";
import { cn, formatTime } from "@/lib/utils";

export function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const player = usePlayer();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Tutup antrian"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Antrian</h2>
            <p className="text-xs text-zinc-400">{player.queue.length} lagu</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <XIcon size={20} />
          </button>
        </header>

        <ol className="flex-1 overflow-y-auto py-2">
          {player.queue.map((track, index) => {
            const isCurrent = index === player.currentIndex;
            return (
              <li key={`${track.id}-${index}`}>
                <div
                  className={cn(
                    "group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-white/5",
                    isCurrent && "bg-white/5",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => player.playAt(index)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
                      <Image
                        src={track.thumbnail}
                        alt=""
                        width={80}
                        height={80}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                      {isCurrent ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-violet-300">
                          {player.isPlaying ? (
                            <Wave className="h-4 w-4" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm",
                          isCurrent ? "font-semibold text-violet-300" : "text-white",
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
                  {!isCurrent ? (
                    <button
                      type="button"
                      onClick={() => player.removeFromQueue(index)}
                      aria-label={`Hapus ${track.title} dari antrian`}
                      className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <XIcon size={16} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
