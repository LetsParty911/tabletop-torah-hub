/** Only count actual audio progression; scrubbing does not count. */
export const SONG_QUALIFIED_PLAY_SECONDS = 10;

/** Browser media events may jump when seeking or resuming a background tab. */
export function listenedSecondsAfterUpdate(
  accumulated: number,
  previousTime: number | null,
  currentTime: number,
): number {
  if (previousTime === null || !Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return accumulated;
  const delta = currentTime - previousTime;
  // Timeupdate fires frequently during normal playback. Ignore jumps/rewinds.
  return delta > 0 && delta <= 5 ? accumulated + delta : accumulated;
}

export function isSongEventId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type SongEngagementCounts = {
  songId: string;
  playsTotal: number;
  downloadsTotal: number;
  plays7d: number;
  downloads7d: number;
};
