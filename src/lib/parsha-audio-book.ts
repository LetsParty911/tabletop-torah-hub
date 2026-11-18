import { toParshaComparableKey } from "@/lib/parsha-normalize";

export const AUDIO_BOOK_BUCKET = "parsha-audio-books";
export const MAX_AUDIO_BOOK_BYTES = 20 * 1024 * 1024;
export const MAX_AUDIO_BOOK_COVER_BYTES = 5 * 1024 * 1024;

export type AudioBook = {
  id: string;
  parsha_key: string;
  jewish_year: number;
  title: string;
  description: string | null;
  audio_path: string | null;
  cover_path: string | null;
  published: boolean;
  created_at: string;
};

export function canonicalAudioParsha(value: string) {
  const key = toParshaComparableKey(value);
  if (!/^[a-z]{2,60}$/.test(key)) throw new Error("Choose a valid parsha");
  return key;
}

export function validAudioBookPath(path: string | null | undefined, year: number, parsha: string): boolean {
  if (!path || !Number.isInteger(year)) return false;
  const prefix = year + "/" + canonicalAudioParsha(parsha) + "/";
  return path.startsWith(prefix) && /^[0-9a-f-]{36}\.mp3$/.test(path.slice(prefix.length));
}

export function validAudioBookCoverPath(path: string | null | undefined, year: number, parsha: string): boolean {
  if (!path || !Number.isInteger(year)) return false;
  const prefix = year + "/" + canonicalAudioParsha(parsha) + "/";
  return path.startsWith(prefix) && /^cover-[0-9a-f-]{36}\.(jpg|png)$/.test(path.slice(prefix.length));
}

export function audioBookDownloadName(book: Pick<AudioBook, "title" | "jewish_year">) {
  return book.title.replace(/[\\/:*?"<>|\r\n]/g," ").trim() + " " + book.jewish_year + ".mp3";
}
