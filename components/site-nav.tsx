"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartIcon, HomeIcon, SearchIcon } from "@/components/icons";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Beranda", Icon: HomeIcon },
  { href: "/search", label: "Cari", Icon: SearchIcon },
  { href: "/library", label: "Koleksi", Icon: HeartIcon },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3 sm:gap-2">
        <Link href="/" className="mr-auto flex items-center gap-2">
          <Image
            src="/icon-192.png"
            alt=""
            width={28}
            height={28}
            priority
            className="h-7 w-7 rounded-full"
          />
          <span className="text-base font-semibold tracking-tight text-white">{APP_NAME}</span>
        </Link>

        {LINKS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // Hidden on mobile: <BottomNav> owns navigation there.
                "hidden items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors sm:flex",
                active
                  ? "bg-white/10 font-medium text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
