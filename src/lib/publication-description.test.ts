import { describe, expect, it } from "vitest";
import { leadWithPublicationTitle } from "./publication-description";

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
