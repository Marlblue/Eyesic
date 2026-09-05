export type Track = {
  /** YouTube video id — the primary key for everything in this app. */
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  /** Seconds. 0 when the source did not report a duration. */
  duration: number;
};

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
};

export type RepeatMode = "off" | "all" | "one";
