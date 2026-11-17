import { toParshaComparableKey } from "@/lib/parsha-normalize";

export const SONG_MEDIA_BUCKET = "parsha-song-media";
export const MAX_SONG_MP3_BYTES = 20 * 1024 * 1024;
export const MAX_SONG_COVER_BYTES = 5 * 1024 * 1024;

export type ParshaSong = {
  id: string;
  parshaKey: string;
  jewishYear: number;
  title: string;
  description: string | null;
  lyrics: string | null;
  audioUrl: string;
  coverUrl: string;
  createdAt: string;
};

export type AdminSong = {
  id: string;
  parsha_key: string;
  jewish_year: number;
  title: string;
  description: string | null;
  lyrics: string | null;
  audio_path: string | null;
  cover_path: string | null;
  published: boolean;
};

/** One publication per parsha/year. Legacy Vayeitzei spelling resolves to Vayetzei. */
export function canonicalSongParsha(value: string): string {
  const key = toParshaComparableKey(value);
  if (!/^[a-z]{2,60}$/.test(key)) throw new Error("Select a valid parsha");
  return key;
}

export function matchesCurrentSong(song: Pick<ParshaSong, "parshaKey" | "jewishYear">, parshaKey: string, jewishYear: number): boolean {
  return song.jewishYear === jewishYear && song.parshaKey === canonicalSongParsha(parshaKey);
}

/** Never trust object paths sent from the browser or stored in outdated rows. */
export function safeSongMediaPath(path: string | null | undefined, year: number, parsha: string, kind: "audio" | "cover"): boolean {
  if (!path || !Number.isInteger(year)) return false;
  const folder = String(year) + "/" + canonicalSongParsha(parsha) + "/";
  const suffix = kind === "audio" ? /\.mp3$/ : /\.(jpg|png)$/;
  return path.startsWith(folder) && /^[a-f0-9-]{36}\.(mp3|jpg|png)$/.test(path.slice(folder.length)) && suffix.test(path);
}

export function songDownloadFilename(title: string, parsha: string, year: number): string {
  const cleanTitle = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim();
  const prettyParsha = canonicalSongParsha(parsha) === "vayetzei"
    ? "Vayetzei"
    : parsha.trim().replace(/^parshas\s+/i, "");
  return cleanTitle + " - Parshas " + prettyParsha + " " + year + " - Parsha in Song.mp3";
}
