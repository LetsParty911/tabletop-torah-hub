import { describe, expect, it } from "vitest";
import { pdfDisplayTitle } from "./pdf-display-title";

describe("individual weekly article titles", () => {
  it("shows each week's uploaded title, not the recurring slot name", () => {
    expect(pdfDisplayTitle(
      "R' Yehuda Zev Klein — Candies For Trying",
      "R' Yehuda Zev Klein — Dvar Torah 1",
      "4d5f000c-6e90-4d58-aa9f-fd73fc005115",
    )).toBe("R' Yehuda Zev Klein — Candies For Trying");
    expect(pdfDisplayTitle(
      "R' Yehuda Zev Klein — Inspirational Mute Button",
      "R' Yehuda Zev Klein — Dvar Torah 2",
      "c3fa24ef-b7a8-42d1-a237-480bc24cba57",
    )).toBe("R' Yehuda Zev Klein — Inspirational Mute Button");
  });
  it("shows filename-derived titles for both Nissi Merenstein poetry slots", () => {
    for (const id of ["6a7d9744-96ef-4728-b329-eb7a4b2dba32", "3213db01-2e86-49bc-9ef1-16f977c02336"]) {
      expect(pdfDisplayTitle("A New View — Toldos", "Nissi Merenstein — Parsha in Poetry", id))
        .toBe("A New View — Toldos");
      expect(pdfDisplayTitle(" ", "Nissi Merenstein — Parsha in Poetry", id))
        .toBe("Nissi Merenstein — Parsha in Poetry");
    }
  });
  it("preserves canonical publication titles for standard recurring sheets", () => {
    expect(pdfDisplayTitle("Toras Avigdor - Chayei Sarah 5787", "Toras Avigdor", "99999999-9999-4999-8999-999999999999"))
      .toBe("Toras Avigdor");
  });
  it("keeps original title when canonical metadata is missing", () => {
    expect(pdfDisplayTitle("Special Edition", null, null)).toBe("Special Edition");
    expect(pdfDisplayTitle("  Uploaded article  ", "Recurring slot", "c3fa24ef-b7a8-42d1-a237-480bc24cba57"))
      .toBe("Uploaded article");
  });
});
