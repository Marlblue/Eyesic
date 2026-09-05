"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartIcon, HomeIcon, ListIcon, SearchIcon } from "@/components/icons";
import { usePlayer } from "@/components/player/player-provider";
import { cn } from "@/lib/utils";

const ICON_SIZE = 25;

/** Circular, transparent, lifts on hover — the shared button treatment. */
const BUTTON =
  "flex h-10 w-10 items-center justify-center rounded-full border-0 outline-0 " +
  "transition-all duration-100 ease-in-out hover:-translate-y-[3px] active:-translate-y-[3px] " +
  "focus-visible:-translate-y-[3px] focus-visible:ring-2 focus-visible:ring-white/40";

const LINKS = [
  { href: "/", label: "Beranda", Icon: HomeIcon },
  { href: "/search", label: "Cari", Icon: SearchIcon },
  { href: "/library", label: "Koleksi", Icon: HeartIcon },
] as const;

/**
 * Mobile-only navigation. On touch there is no hover, so the queue — which on
 * desktop lives inside the player card once it expands — gets a slot here.
 */
export function BottomNav() {
  const pathname = usePathname();
  const player = usePlayer();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden"
    >
      <div className="flex h-[70px] w-[300px] max-w-[calc(100vw-1.5rem)] items-center justify-around rounded-full bg-black px-3 shadow-lg shadow-black/50 ring-1 ring-white/10">
        {LINKS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                BUTTON,
                active ? "bg-white/10 text-white" : "bg-transparent text-zinc-500",
              )}
            >
              <Icon size={ICON_SIZE} />
            </Link>
          );
        })}

        <button
          type="button"
          onClick={player.openQueue}
          aria-label="Antrian"
          aria-expanded={player.isQueueOpen}
          className={cn(
            BUTTON,
            player.isQueueOpen ? "bg-white/10 text-white" : "bg-transparent text-zinc-500",
          )}
        >
          <ListIcon size={ICON_SIZE} />
        </button>
      </div>
    </nav>
  );
}
