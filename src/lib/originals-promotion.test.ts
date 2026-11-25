import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORIGINAL_PROMOTION_SERIES, NEW_ORIGINAL_SERIES, canShowOriginalsLaunch, promotionSeriesById, originalsPromotionDescription, latestPromotionEdition, resolveListingCover } from "./originals-promotion";
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
    expect(originalsPromotionDescription()).toContain("original weekly series");
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

it("has a distinct, valid permanent 4:5 WebP asset for every original", () => {
  expect(new Set(ORIGINAL_PROMOTION_SERIES.map((series) => series.coverSrc)).size).toBe(7);
  for (const series of ORIGINAL_PROMOTION_SERIES) {
    expect(series.coverSrc).toMatch(/^\/original-series-covers\/[a-z-]+\.[0-9a-f]{10}\.webp$/);
    const bytes = readFileSync(resolve(process.cwd(), "public", series.coverSrc.slice(1)));
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("VP8 ");
    expect(bytes.readUInt16LE(26) & 0x3fff).toBe(320);
    expect(bytes.readUInt16LE(28) & 0x3fff).toBe(400);
    expect(bytes.length).toBeLessThan(40000);
  }
});

describe("permanent public listing artwork policy", () => {
  it("always resolves all seven covers by canonical series ID, regardless of weekly previews", () => {
    for (const series of ORIGINAL_PROMOTION_SERIES) {
      expect(series.publicationId).toBeTruthy();
      for (const preview of [null, "/first-week.png", "/new-week.png"]) {
        expect(resolveListingCover(series.publicationId, preview, "/weekly.small.webp")).toEqual({
          series, src: series.coverSrc, smallSrc: null,
        });
      }
    }
  });
  it("keeps actual issue previews in the historical archive and preserves independent publishers", () => {
    for (const series of ORIGINAL_PROMOTION_SERIES) {
      expect(resolveListingCover(series.publicationId, "/issue.png", "/issue.small.webp", "archive")).toEqual({
        series: undefined, src: "/issue.png", smallSrc: "/issue.small.webp",
      });
    }
    for (const id of [null, "unrelated-id", "Parsha Questions & Answers", PARSHA_DETECTIVE_PUBLICATION_ID]) {
      expect(resolveListingCover(id, "/other.png", "/other.small.webp")).toEqual({
        series: undefined, src: "/other.png", smallSrc: "/other.small.webp",
      });
    }
    expect(resolveListingCover(null, null)).toEqual({ series: undefined, src: null, smallSrc: null });
  });
  it("keeps the listing policy wired to all current discovery surfaces and explicit archive exceptions", () => {
    const source = (path: string) => readFileSync(path, "utf8");
    expect(source("src/routes/index.tsx")).toContain("resolveListingCover(r.publication_id, r.thumb_url, r.small_thumb_url)");
    expect(source("src/routes/index.tsx")).toContain("originalCover(r, true) ??");
    expect(source("src/routes/publications.tsx")).toContain("resolveListingCover(publication.id, publication.thumb_url)");
    expect(source("src/components/PdfCoverThumbnail.tsx")).toContain("resolveListingCover(seriesPublicationId, thumbnailUrl, smallThumbnailUrl, coverContext)");
    expect(source("src/components/ReadingCollectionView.tsx")).toContain("seriesPublicationId={resource.publication_id}");
    expect(source("src/routes/publication.$slug.tsx")).toContain('coverContext={prominent ? "listing" : "archive"}');
    expect(source("src/routes/originals.tsx")).toContain('historical ? "archive" : "listing"');
    expect(source("src/routes/archive.tsx")).toContain('coverContext="archive"');
  });
});
