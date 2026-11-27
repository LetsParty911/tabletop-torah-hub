import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hebrewYearOf, readerBackLink } from "./reader-back-link";

describe("reader page back link", () => {
  it("returns this week's PDF to the homepage weekly collection", () => {
    expect(readerBackLink({ isCurrentWeek: true, parshaKey: "Vayetzei", jewishYear: 5787, currentJewishYear: 5787 }))
      .toEqual({ kind: "current", label: "Back to This Week’s Selections" });
  });

  it("returns an earlier parsha PDF to its own parsha year collection", () => {
    expect(readerBackLink({ isCurrentWeek: false, parshaKey: "Toldos", jewishYear: 5787, currentJewishYear: 5787 }))
      .toEqual({ kind: "parsha", slug: "toldos", year: "5787", label: "Back to Parshas Toldos 5787 Divrei Torah" });
  });

  it("treats the same parsha from an earlier year as archived, not this week's", () => {
    const link = readerBackLink({ isCurrentWeek: true, parshaKey: "Vayetzei", jewishYear: 5786, currentJewishYear: 5787 });
    expect(link.kind).toBe("parsha");
    expect(link).toMatchObject({ slug: "vayetzei", year: "5786" });
  });

  it("returns a Yom Tov PDF to its Yom Tov year collection", () => {
    expect(readerBackLink({ isCurrentWeek: false, parshaKey: "Sukkos", jewishYear: 5787 }))
      .toMatchObject({ kind: "yom-tov", slug: "sukkos", year: "5787" });
  });

  it("falls back to the Archive without a reading or a valid year", () => {
    expect(readerBackLink({ isCurrentWeek: false, parshaKey: null, jewishYear: 5787 }))
      .toEqual({ kind: "archive", label: "Back to the Archive" });
    expect(readerBackLink({ isCurrentWeek: false, parshaKey: "Noach", jewishYear: null }).kind).toBe("archive");
    expect(readerBackLink({ isCurrentWeek: false, parshaKey: "Noach", jewishYear: 26 }).kind).toBe("archive");
  });

  it("reads the Hebrew year of a Shabbos date", () => {
    expect(hebrewYearOf("2026-11-21")).toBe(5787);
    expect(hebrewYearOf("2026-09-05")).toBe(5786);
    expect(hebrewYearOf("not a date")).toBeNull();
  });
});


describe("native PDF reader sizing", () => {
  it("requests fit-to-width without replacing the existing PDF delivery route", () => {
    const source = readFileSync("src/routes/view.$id.tsx", "utf8");
    expect(source).toContain("/view/${pdf.id}/pdf#toolbar=1&navpanes=0&view=FitH");
    expect(source).toContain("const canEmbed = mounted && !isMobile");
    expect(source).toContain("key={pdf.id}");
  });
});
