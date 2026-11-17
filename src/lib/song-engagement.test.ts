import { describe, expect, it } from "vitest";
import { listenedSecondsAfterUpdate, SONG_QUALIFIED_PLAY_SECONDS, isSongEventId } from "@/lib/song-engagement";

describe("Per-song listening metrics", () => {
  it("counts elapsed media playback, not the number of play button presses", () => {
    expect(SONG_QUALIFIED_PLAY_SECONDS).toBe(10);
    expect(listenedSecondsAfterUpdate(5, 10, 12)).toBe(7);
    expect(listenedSecondsAfterUpdate(7, 12, 12.5)).toBe(7.5);
  });
  it("does not count skips or rewinds as listening", () => {
    expect(listenedSecondsAfterUpdate(6, 12, 78)).toBe(6);
    expect(listenedSecondsAfterUpdate(6, 78, 12)).toBe(6);
    expect(listenedSecondsAfterUpdate(6, null, 19)).toBe(6);
  });
  it("accepts only UUIDs for event/song identifiers", () => {
    expect(isSongEventId("64693e97-e66a-4168-a0a5-e99b6e32baca")).toBe(true);
    expect(isSongEventId("not-a-uuid")).toBe(false);
  });
});
