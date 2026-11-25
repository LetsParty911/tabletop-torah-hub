import { describe, expect, it } from "vitest";
import { leadWithPublicationTitle } from "./publication-description";
import { originalDescriptionFallback } from "./tftt-originals";

describe("title-first publication descriptions", () => {
  it("replaces generic subjects while preserving the verb and meaning", () => {
    expect(leadWithPublicationTitle("Parsha Potpourri", "This publication offers insights from Chazal."))
      .toBe("Parsha Potpourri offers insights from Chazal.");
    expect(leadWithPublicationTitle("Parsha Questions & Answers", "This publication provides questions from Rashi."))
      .toBe("Parsha Questions & Answers provides questions from Rashi.");
    expect(leadWithPublicationTitle("In the Margins", "This Dvar Torah explores a comment of Rashi."))
      .toBe("In the Margins explores a comment of Rashi.");
  });

  it("does not duplicate a title that already leads the description", () => {
    expect(leadWithPublicationTitle("Toras Avigdor", "Toras Avigdor explores emunah."))
      .toBe("Toras Avigdor explores emunah.");
    expect(leadWithPublicationTitle("Toras Avigdor", "toras avigdor — weekly lessons."))
      .toBe("Toras Avigdor — weekly lessons.");
  });

  it("handles article-led and fragment descriptions without inventing content", () => {
    expect(leadWithPublicationTitle("Toras Avigdor Junior", "A children's publication explaining Jewish concepts."))
      .toBe("Toras Avigdor Junior is a children's publication explaining Jewish concepts.");
    expect(leadWithPublicationTitle("Zichron Avinoam", "Weekly essays on connecting with Hashem."))
      .toBe("Zichron Avinoam features weekly essays on connecting with Hashem.");
    expect(leadWithPublicationTitle("In the Margins", "Source-based stories from Chazal."))
      .toBe("In the Margins features source-based stories from Chazal.");
    expect(leadWithPublicationTitle("X", "An engaging story for children."))
      .toBe("X is an engaging story for children.");
  });

  it("leaves empty copy empty and never invents a summary", () => {
    expect(leadWithPublicationTitle("Toras Avigdor", null)).toBeNull();
    expect(leadWithPublicationTitle("Toras Avigdor", "   ")).toBeNull();
  });
});

describe("file-name leftovers in descriptions", () => {
  it("drops a stray 'Corrected' after the title but keeps the author's wording", () => {
    const title = "From Leitzanei HaDor to Modern Cynics Trolls Bloggers R Yehuda Zev Klein";
    expect(leadWithPublicationTitle(title, `${title} Corrected explores the destructive nature of cynicism.`))
      .toBe(`${title} explores the destructive nature of cynicism.`);
    expect(leadWithPublicationTitle("Surround Yourself", "Corrected explores the impact of friends."))
      .toBe("Surround Yourself explores the impact of friends.");
  });

  it("leaves real uses of the word alone", () => {
    expect(leadWithPublicationTitle("Torah Tavlin", "Corrected Vision: a parsha essay."))
      .toBe("Torah Tavlin — Corrected Vision: a parsha essay.");
    expect(leadWithPublicationTitle("Torah Tavlin", "Torah Tavlin on how Yaakov corrected the record."))
      .toBe("Torah Tavlin on how Yaakov corrected the record.");
  });
});

describe("approved Originals description fallback", () => {
  const ramban = "81b9fadd-3f96-43a2-b21d-6619567e8b1b";
  it("uses the approved series copy only when a description is missing", () => {
    expect(originalDescriptionFallback(ramban, null)).toBe("One Ramban fully unpacked, with one meaningful question for the Shabbos table.");
    expect(originalDescriptionFallback(ramban, "  ")).toBe(originalDescriptionFallback(ramban, null));
    expect(originalDescriptionFallback(ramban, "Specific edition description.")).toBe("Specific edition description.");
    expect(originalDescriptionFallback(null, null)).toBeNull();
    expect(originalDescriptionFallback("unknown", null)).toBeNull();
  });
});
