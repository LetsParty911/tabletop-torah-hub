import { describe, expect, test } from "bun:test";
import { countSukkahSignDownloads, SUKKAH_SIGN_TITLES } from "./sukkah-sign-downloads";

describe("countSukkahSignDownloads", () => {
  test("counts each size separately and together, ignoring other rows", () => {
    const r = countSukkahSignDownloads([
      { id: null, title: SUKKAH_SIGN_TITLES.letter, downloadActions: 3 },
      { id: null, title: SUKKAH_SIGN_TITLES.tabloid, downloadActions: 5 },
      { id: "abc", title: SUKKAH_SIGN_TITLES.letter, downloadActions: 9 },
      { id: null, title: "Other", downloadActions: 7 },
    ]);
    expect(r).toEqual({ letter: 3, tabloid: 5, total: 8 });
  });
  test("zero when absent", () => {
    expect(countSukkahSignDownloads([])).toEqual({ letter: 0, tabloid: 0, total: 0 });
  });
});
