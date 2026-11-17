import { describe, expect, it } from "vitest";
import { canonicalSongParsha, matchesCurrentSong, safeSongMediaPath, songDownloadFilename } from "@/lib/parsha-song";

describe("Parsha in Song", () => {
  it("normalizes both spellings of Vayetzei", () => {
    expect(canonicalSongParsha("Parshas Vayeitzei")).toBe("vayetzei");
    expect(canonicalSongParsha("Vayetzei")).toBe("vayetzei");
  });
  it("never displays a prior Jewish year as the current-week song", () => {
    expect(matchesCurrentSong({ parshaKey: "vayetzei", jewishYear: 5786 }, "Vayetzei", 5787)).toBe(false);
    expect(matchesCurrentSong({ parshaKey: "vayetzei", jewishYear: 5787 }, "Vayeitzei", 5787)).toBe(true);
  });
  it("accepts only versioned paths under the correct parsha and year", () => {
    const audio = "5787/vayetzei/11111111-1111-4111-8111-111111111111.mp3";
    expect(safeSongMediaPath(audio, 5787, "Vayetzei", "audio")).toBe(true);
    expect(safeSongMediaPath(audio, 5786, "Vayetzei", "audio")).toBe(false);
    expect(safeSongMediaPath("5787/vayetzei/../secret.mp3", 5787, "Vayetzei", "audio")).toBe(false);
  });
  it("returns a clean downloadable filename with the approved spelling", () => {
    expect(songDownloadFilename("Wherever You Go", "Vayeitzei", 5787))
      .toBe("Wherever You Go - Parshas Vayetzei 5787 - Parsha in Song.mp3");
  });
});
