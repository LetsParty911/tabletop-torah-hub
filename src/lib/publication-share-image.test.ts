import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ORIGINAL_PROMOTION_SERIES } from "./originals-promotion";
import { publicationShareImages, publicationShareImageMeta } from "./publication-share-image";
import { SITE_URL } from "./site-url";

function webpDimensions(path: string) {
  const bytes = readFileSync(`public${path}`);
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  expect(bytes.length).toBeLessThan(600_000);
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  if (chunk === "VP8 ") return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const value = bytes.readUInt32LE(21);
    return [(value & 0x3fff) + 1, ((value >>> 14) & 0x3fff) + 1];
  }
  throw new Error("Unsupported WebP header");
}

describe("publication-specific sharing images", () => {
  it("uses every original's real permanent cover with accurate dimensions and a PNG alternative", () => {
    for (const series of ORIGINAL_PROMOTION_SERIES) {
      expect(series.publicationId).toBeTruthy();
      const images = publicationShareImages({ publicationId: series.publicationId, title: series.title });
      expect(images[0].url).toBe(SITE_URL + series.coverSrc);
      expect(webpDimensions(series.coverSrc)).toEqual([images[0].width, images[0].height]);
      expect(images[1].mime).toBe("image/png");
      expect(new URL(images[1].url).searchParams.get("title")).toBe(series.title);
    }
  });

  it("uses the independent Mi Ka'amcha logo only for its registered publication", () => {
    const logo = "/publication-covers/mi-kaamcha-yisroel-logo-v1.webp";
    const input = { title: "Mi Ka'amcha Yisroel", publicationId: "bd544c49-a810-478d-bf5c-38b94a81bc31" };
    const [image] = publicationShareImages(input);
    expect(image.url).toBe(SITE_URL + logo);
    expect(webpDimensions(logo)).toEqual([image.width, image.height]);
    expect(publicationShareImages({ title: input.title })[0].url).not.toBe(image.url);
  });

  it("uses safely encoded title-specific PNGs for other publications and preserves holiday labels", () => {
    const images = publicationShareImages({ title: "Torah & reflections", readingLabel: "Pesach", jewishYear: 5787 });
    const url = new URL(images[0].url);
    expect(url.pathname).toBe("/og/image.png");
    expect(url.searchParams.get("title")).toBe("Torah & reflections");
    expect(url.searchParams.get("reading")).toBe("Pesach 5787");
    expect(images[0]).toMatchObject({ width: 1200, height: 630, mime: "image/png" });
    expect(images[1].url).toBe(SITE_URL + "/og-image.png");
  });

  it("retains the brand fallback if the title is missing, and keeps image metadata grouped", () => {
    expect(publicationShareImages({})[0].url).toBe(SITE_URL + "/og-image.png");
    const images = publicationShareImages({ title: ORIGINAL_PROMOTION_SERIES[0].title, publicationId: ORIGINAL_PROMOTION_SERIES[0].publicationId });
    const tags = publicationShareImageMeta(images, "Example title");
    expect(tags[0]).toEqual({ property: "og:image", content: images[0].url });
    expect(tags[2]).toEqual({ property: "og:image:width", content: "320" });
    expect(tags[3]).toEqual({ property: "og:image:height", content: "400" });
    expect(tags[5]).toEqual({ property: "og:image", content: images[1].url });
    expect(tags[7]).toEqual({ property: "og:image:width", content: "1200" });
  });
});
