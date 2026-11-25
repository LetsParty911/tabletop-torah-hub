import { describe, expect, it } from "vitest";
import { ORIGINAL_PROMOTION_SERIES, NEW_ORIGINAL_SERIES, canShowOriginalsLaunch, promotionSeriesById, originalsPromotionDescription, latestPromotionEdition, selectPromotionCovers } from "./originals-promotion";
import { TFTT_ORIGINAL_SERIES, PARSHA_DETECTIVE_PUBLICATION_ID } from "./tftt-originals";

describe("Originals promotional catalog", () => {
  it("lists seven unique editorial titles in the approved order", () => {
    expect(ORIGINAL_PROMOTION_SERIES.map((s) => s.title)).toEqual([
      "Parsha Questions & Answers",
      "Stories for the Shabbos Table",
      "In the Margins",
      "Parsha Pearls from the Ramban",
      "Chizkuni Insights",
      "Treasures from the Medrash",
      "Questions Beneath the Surface",
    ]);
    expect(new Set(ORIGINAL_PROMOTION_SERIES.map((s) => s.key)).size).toBe(7);
  });
  it("uses only verified IDs and preserves archive searches", () => {
    expect(ORIGINAL_PROMOTION_SERIES.slice(0, 4).map((s) => s.publicationId)).toEqual(TFTT_ORIGINAL_SERIES.map((s) => s.id));
    expect(NEW_ORIGINAL_SERIES.map((s) => s.publicationId)).toEqual(['a247e4ef-b79f-4967-b2a8-8000c8278ecb', '40e5fe38-3ca5-4f29-8d97-6542b3bd7899', '805a1953-841e-4e12-a9fd-cc17a7ad3200']);
    expect(NEW_ORIGINAL_SERIES.every((s) => s.archiveQuery === s.title)).toBe(true);
    expect(promotionSeriesById(TFTT_ORIGINAL_SERIES[3].id)?.title).toBe("Parsha Pearls from the Ramban");
    expect(promotionSeriesById(PARSHA_DETECTIVE_PUBLICATION_ID)).toBeUndefined();
    expect(promotionSeriesById(null)).toBeUndefined();
  });
  it("does not advertise an active launch before publication and owner activation", () => {
    expect(canShowOriginalsLaunch([])).toBe(false);
    expect(canShowOriginalsLaunch(TFTT_ORIGINAL_SERIES.map((s) => s.id))).toBe(false);
    expect(originalsPromotionDescription()).toContain("seven");
    expect(originalsPromotionDescription()).not.toContain("Detective");
  });
});

describe("latest published cover selection", () => {
  it("selects the newest matching edition without borrowing another publication", () => {
    const qa = ORIGINAL_PROMOTION_SERIES[0];
    const stories = ORIGINAL_PROMOTION_SERIES[1];
    const group = (label: string, editions: {id: string; seriesId: string; seriesTitle: string; thumbUrl: string | null}[]) => ({ key: label, parshaKey: label, jewishYear: 5787, label, editions });
    const newer = group("Vayishlach", [{ id: "new-story", seriesId: stories.publicationId!, seriesTitle: stories.title, thumbUrl: "/new-story.png" }]);
    const older = group("Vayetzei", [{ id: "older-qa", seriesId: qa.publicationId!, seriesTitle: qa.title, thumbUrl: "/older-qa.png" }]);
    expect(latestPromotionEdition(qa, [newer, older])?.edition.id).toBe("older-qa");
    expect(latestPromotionEdition(stories, [newer, older])?.edition.thumbUrl).toBe("/new-story.png");
    expect(latestPromotionEdition(ORIGINAL_PROMOTION_SERIES[4], [newer, older])).toBeUndefined();
    expect(latestPromotionEdition(qa, [])).toBeUndefined();
    const registered = { ...ORIGINAL_PROMOTION_SERIES[4], publicationId: "test-only-chizkuni" };
    const firstIssue = group("Vayishlach", [{ id: "first-issue", seriesId: registered.publicationId, seriesTitle: registered.title, thumbUrl: "/first-issue.png" }]);
    expect(latestPromotionEdition(registered, [firstIssue])?.edition.id).toBe("first-issue");
  });
});

it("retains the previous real cover until the newest issue has its own thumbnail", () => {
  const series = ORIGINAL_PROMOTION_SERIES[3];
  const group = (label: string, id: string, thumbUrl: string | null) => ({
    key: label, parshaKey: label, jewishYear: 5787, label,
    editions: [{ id, seriesId: series.publicationId!, seriesTitle: series.title, thumbUrl }],
  });
  const older = group("Vayetzei", "older", "/older.png");
  const newest = group("Vayishlach", "newest", null);
  expect(latestPromotionEdition(series, [newest, older])?.edition.id).toBe("newest");
  expect(selectPromotionCovers([newest, older])[0]).toMatchObject({ editionId: "older", label: "Vayetzei" });
  expect(selectPromotionCovers([group("Vayishlach", "newest", "/newest.png"), older])[0]).toMatchObject({ editionId: "newest", thumbUrl: "/newest.png" });
});
