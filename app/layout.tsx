import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { PlayerBar } from "@/components/player/player-bar";
import { PlayerProvider } from "@/components/player/player-provider";
import { ServiceWorker } from "@/components/service-worker";
import { SiteNav } from "@/components/site-nav";
import { APP_DESCRIPTION, APP_NAME, APP_THEME_COLOR } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
  // The player bar sits at the bottom edge, so respect the iOS home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <PlayerProvider>
          {/*
            `relative z-0` is load-bearing: it stacks the whole app above the
            hidden YouTube iframe that PlayerProvider parks at `-z-10`.
          */}
          <div className="relative z-0 flex min-h-dvh flex-col bg-zinc-950">
            <SiteNav />
            {/* Extra bottom padding on mobile: the player card and the bottom
                nav are both fixed there and must never cover the last row. */}
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-64 pt-6 sm:pb-44">
              {children}
            </main>
          </div>
          <PlayerBar />
          <BottomNav />
          <ServiceWorker />
        </PlayerProvider>
      </body>
    </html>
  );
}
