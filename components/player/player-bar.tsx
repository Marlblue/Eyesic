"use client";

import { useEffect, useState } from "react";
import {
  HeartIcon,
  ListIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
} from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { QueuePanel } from "@/components/player/queue-panel";
import { Vinyl } from "@/components/vinyl";
import { toggleLike, useLibrary } from "@/lib/library";
import { useCanHover } from "@/lib/use-media-query";
import { cn, formatTime } from "@/lib/utils";

/** Shared slider skin: a thin track with a bordered white thumb. */
const SLIDER =
  "h-1 cursor-pointer appearance-none rounded-full bg-zinc-300 accent-violet-600 " +
  "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none " +
  "[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full " +
  "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-400 " +
  "[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md " +
  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-pointer " +
  "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 " +
  "[&::-moz-range-thumb]:border-zinc-400 [&::-moz-range-thumb]:bg-white";

export function PlayerBar() {
  const player = usePlayer();
  const library = useLibrary();
  const canHover = useCanHover();
  const [open, setOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const { current, isPlaying, isBuffering, duration, error } = player;
  const liked = current ? library.liked.includes(current.id) : false;
  const position = scrubbing ?? player.position;

  // Space toggles playback, arrows seek — unless the user is typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === " ") {
        event.preventDefault();
        player.toggle();
      } else if (event.key === "ArrowRight" && event.shiftKey) {
        player.next();
      } else if (event.key === "ArrowLeft" && event.shiftKey) {
        player.previous();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player]);

  if (!current) return null;

  return (
    <>
      <QueuePanel open={player.isQueueOpen} onClose={player.closeQueue} />

      {/* Clears the mobile bottom nav (70px bar + its own padding); on sm+ the
          nav is gone and the player sits on the bottom edge again. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(70px+max(0.75rem,env(safe-area-inset-bottom)))] z-40 flex justify-center p-3 sm:bottom-0 sm:p-4">
        <div
          data-open={open}
          className="group/he pointer-events-auto flex select-none flex-col items-center"
          onMouseEnter={canHover ? () => setOpen(true) : undefined}
          onMouseLeave={canHover ? () => setOpen(false) : undefined}
          onClick={
            canHover
              ? undefined
              : (event) => {
                  // Touch has no hover, so a tap expands the card. Taps that
                  // land on a real control must still do only their own job.
                  if ((event.target as HTMLElement).closest("button, input, a")) return;
                  setOpen((value) => !value);
                }
          }
        >
          {/*
            The record rides above the card and sinks into it as the card grows.
            Only its top clears the card, and the clip line sits lower than the
            card's top edge, so the cut is always hidden behind the card rather
            than slicing visibly through the artwork.
          */}
          <div className="relative z-0 -mb-2 h-12 overflow-hidden transition-all duration-300 group-data-[open=true]/he:h-0">
            <Vinyl
              src={current.thumbnail}
              spinning={isPlaying}
              className="w-24"
              holeClassName="border-4"
            />
          </div>

          <div className="z-30 flex h-32 w-[min(92vw,23rem)] flex-col rounded-2xl bg-white shadow-lg shadow-zinc-900/30 transition-all duration-300 group-data-[open=true]/he:h-52 group-data-[open=true]/he:w-[min(92vw,34rem)]">
            {/*
              Header: artwork appears only once the card is open. The record is
              sized to sit inside this row rather than being nudged outside it
              with negative offsets — the row clips its overflow to animate open,
              so anything poking out would be sliced off at the card edge.
            */}
            <div className="flex h-0 w-full flex-row items-center gap-3 overflow-hidden px-4 transition-all duration-300 group-data-[open=true]/he:h-24">
              <Vinyl
                src={current.thumbnail}
                spinning={isPlaying}
                className="w-16 shrink-0"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-lg font-bold text-zinc-900">{current.title}</p>
                <p className="truncate text-sm text-zinc-600">{current.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleLike(current)}
                aria-pressed={liked}
                aria-label={liked ? "Hapus dari lagu disukai" : "Suka lagu ini"}
                className="shrink-0 rounded-full p-2 text-zinc-400 transition-colors hover:text-rose-500 data-[liked=true]:text-rose-500"
                data-liked={liked}
              >
                <HeartIcon size={20} filled={liked} />
              </button>
            </div>

            {/* Collapsed title line: swaps out for the header above when open. */}
            <div className="flex min-w-0 flex-col px-4 pt-3 transition-all duration-200 group-data-[open=true]/he:hidden">
              <p className="truncate text-sm font-semibold text-zinc-900">{current.title}</p>
              <p className="truncate text-xs text-zinc-500">{current.artist}</p>
            </div>

            <div className="mx-4 mt-2 flex min-h-4 flex-row items-center rounded-md bg-indigo-100 group-data-[open=true]/he:mt-1">
              <span className="hidden pl-3 text-sm tabular-nums text-zinc-600 group-data-[open=true]/he:inline-block">
                {formatTime(position)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                step={1}
                value={Math.min(position, Math.max(duration, 1))}
                aria-label="Posisi lagu"
                onChange={(event) => setScrubbing(Number(event.target.value))}
                onPointerUp={() => {
                  if (scrubbing !== null) player.seek(scrubbing);
                  setScrubbing(null);
                }}
                onKeyUp={() => {
                  if (scrubbing !== null) player.seek(scrubbing);
                  setScrubbing(null);
                }}
                className={cn(SLIDER, "mx-2 my-auto w-24 grow group-data-[open=true]/he:w-full")}
              />
              <span className="hidden pr-3 text-sm tabular-nums text-zinc-600 group-data-[open=true]/he:inline-block">
                {formatTime(duration)}
              </span>
            </div>

            <div className="flex grow flex-row items-center justify-center gap-2 px-4 pb-3 sm:gap-4">
              <ControlButton
                label={
                  player.repeat === "one"
                    ? "Ulangi satu lagu"
                    : player.repeat === "all"
                      ? "Ulangi semua"
                      : "Acak"
                }
                onClick={player.shuffle ? player.toggleShuffle : player.cycleRepeat}
                onContextMenu={(event) => {
                  event.preventDefault();
                  player.toggleShuffle();
                }}
                active={player.shuffle || player.repeat !== "off"}
                secondary
              >
                {player.shuffle ? (
                  <ShuffleIcon size={20} />
                ) : player.repeat === "one" ? (
                  <RepeatOneIcon size={20} />
                ) : (
                  <RepeatIcon size={20} />
                )}
              </ControlButton>

              <ControlButton label="Lagu sebelumnya" onClick={player.previous}>
                <SkipBackIcon size={24} />
              </ControlButton>

              <ControlButton
                label={isPlaying ? "Jeda" : "Putar"}
                onClick={player.toggle}
                className="text-zinc-900"
              >
                {isBuffering ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
                  </span>
                ) : isPlaying ? (
                  <PauseIcon size={24} />
                ) : (
                  <PlayIcon size={24} />
                )}
              </ControlButton>

              <ControlButton label="Lagu berikutnya" onClick={player.next}>
                <SkipForwardIcon size={24} />
              </ControlButton>

              <ControlButton
                label="Antrian"
                onClick={player.openQueue}
                secondary
                className="hidden group-data-[open=true]/he:flex"
              >
                <ListIcon size={20} />
              </ControlButton>

              <div className="ml-1 hidden items-center gap-1 group-data-[open=true]/he:flex">
                <button
                  type="button"
                  onClick={player.toggleMute}
                  aria-label={player.muted ? "Bunyikan" : "Bisukan"}
                  className="text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  <VolumeIcon size={18} muted={player.muted || player.volume === 0} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={player.muted ? 0 : player.volume}
                  aria-label="Volume"
                  onChange={(event) => player.setVolume(Number(event.target.value))}
                  className={cn(SLIDER, "w-16")}
                />
              </div>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              onClick={player.dismissError}
              className="mt-2 cursor-pointer rounded-full bg-rose-500 px-3 py-1 text-xs font-medium text-white shadow-md"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ControlButton({
  label,
  active,
  secondary,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  label: string;
  active?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-full items-center justify-center transition-colors",
        secondary
          ? active
            ? "text-violet-600"
            : "text-zinc-400 hover:text-zinc-700"
          : "text-zinc-700 hover:text-zinc-950",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
