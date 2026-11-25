import { describe, expect, it } from "vitest";
import { weeklyCardBadges } from "./weekly-card-badges";
import { seriesBrief, TFTT_ORIGINAL_EDITION_SERIES } from "./tftt-originals";

describe("homepage weekly card badges", () => {
  it("shows TFTT Original as quiet provenance", () => {
    expect(weeklyCardBadges(true, null)).toEqual([{ label: "TFTT Original", tone: "subtle" }]);
  });
  it("keeps a NEW status visible on an original instead of hiding it", () => {
    expect(weeklyCardBadges(true, "NEW")).toEqual([
      { label: "TFTT Original", tone: "subtle" },
      { label: "NEW", tone: "status" },
    ]);
  });
  it("shows an outside publication's status badge alone", () => {
    expect(weeklyCardBadges(false, "NEW")).toEqual([{ label: "NEW", tone: "status" }]);
    expect(weeklyCardBadges(false, "  ")).toEqual([]);
  });
});

describe("homepage originals intro lines", () => {
  it("explains each of the seven series in one short line", () => {
    expect(TFTT_ORIGINAL_EDITION_SERIES.map((s) => [s.title, seriesBrief(s)])).toEqual([
      ["Parsha Questions & Answers", "20 Rashi-based questions and answers"],
      ["Stories for the Shabbos Table", "Three source-based stories, each with a question"],
      ["In the Margins", "Three insights from classical mefarshim"],
      ["Parsha Pearls", "One Ramban explained in depth"],
      ["Chizkuni Insights", "Distinctive explanations of familiar pesukim"],
      ["Treasures from the Medrash", "Discover the teachings behind the Parsha"],
      ["Questions Beneath the Surface", "Difficult questions and source-based answers"],
    ]);
  });
});
