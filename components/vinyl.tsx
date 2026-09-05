import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The record on the turntable: the track artwork clipped into a spinning disc,
 * with the label hole punched through the middle. When nothing is loaded it
 * falls back to a starfield-and-mountains sleeve.
 */
export function Vinyl({
  src,
  spinning = false,
  className,
  holeClassName,
}: {
  src?: string | null;
  spinning?: boolean;
  className?: string;
  holeClassName?: string;
}) {
  return (
    <div className={cn("relative aspect-square", className)}>
      <div
        className="h-full w-full overflow-hidden rounded-full border-4 border-zinc-400 shadow-md animate-[spin_3s_linear_infinite] motion-reduce:animate-none"
        style={{ animationPlayState: spinning ? "running" : "paused" }}
      >
        {src ? (
          <Image
            src={src}
            alt=""
            width={256}
            height={256}
            unoptimized
            className="h-full w-full scale-125 object-cover"
          />
        ) : (
          <SleeveArt />
        )}
      </div>
      <div
        className={cn(
          "absolute left-1/2 top-1/2 h-1/4 w-1/4 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-zinc-400 bg-white shadow-sm",
          holeClassName,
        )}
      />
    </div>
  );
}

function SleeveArt() {
  return (
    <svg viewBox="0 0 128 128" className="h-full w-full">
      <rect width="128" height="128" fill="black" />
      <circle cx="20" cy="20" r="2" fill="white" />
      <circle cx="40" cy="30" r="2" fill="white" />
      <circle cx="60" cy="10" r="2" fill="white" />
      <circle cx="80" cy="40" r="2" fill="white" />
      <circle cx="100" cy="20" r="2" fill="white" />
      <circle cx="120" cy="50" r="2" fill="white" />
      <circle cx="90" cy="30" r="10" fill="white" fillOpacity="0.5" />
      <circle cx="90" cy="30" r="8" fill="white" />
      <path d="M0 128 Q32 64 64 128 T128 128" fill="purple" stroke="black" strokeWidth="1" />
      <path d="M0 128 Q32 48 64 128 T128 128" fill="mediumpurple" stroke="black" strokeWidth="1" />
      <path d="M0 128 Q32 32 64 128 T128 128" fill="rebeccapurple" stroke="black" strokeWidth="1" />
      <path d="M0 128 Q16 64 32 128 T64 128" fill="purple" stroke="black" strokeWidth="1" />
      <path d="M64 128 Q80 64 96 128 T128 128" fill="mediumpurple" stroke="black" strokeWidth="1" />
    </svg>
  );
}
