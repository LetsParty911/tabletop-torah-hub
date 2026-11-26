import { promotionSeriesById } from "./originals-promotion";
import { absoluteUrl } from "./site-url";

type ShareImage = {
  url: string;
  width: number;
  height: number;
  mime: "image/png" | "image/webp";
};

type PublicationShareInput = {
  publicationId?: string | null;
  title?: string | null;
  readingLabel?: string | null;
  jewishYear?: number | null;
};

const BRAND_IMAGE: ShareImage = {
  url: absoluteUrl("/og-image.png"),
  width: 1200,
  height: 630,
  mime: "image/png",
};

// These are existing, verified permanent assets, not inferred from titles.
const MI_KAAMCHA_ID = "bd544c49-a810-478d-bf5c-38b94a81bc31";

/** Prefer permanent covers, with a PNG alternative for clients that cannot
 * display WebP. Other publications use a title-specific PNG, with no extra
 * database queries or PDF storage requests. */
export function publicationShareImages(input: PublicationShareInput): ShareImage[] {
  const title = input.title?.trim();
  if (!title) return [BRAND_IMAGE];

  const query = new URLSearchParams({ title, v: "publication-1" });
  const reading = [input.readingLabel?.trim(), input.jewishYear].filter(Boolean).join(" ");
  if (reading) query.set("reading", reading);
  const titleImage: ShareImage = {
    url: absoluteUrl(`/og/image.png?${query.toString()}`),
    width: 1200,
    height: 630,
    mime: "image/png",
  };

  const series = promotionSeriesById(input.publicationId);
  if (series) {
    return [
      { url: absoluteUrl(series.coverSrc), width: 320, height: 400, mime: "image/webp" },
      titleImage,
    ];
  }
  if (input.publicationId === MI_KAAMCHA_ID) {
    return [
      { url: absoluteUrl("/publication-covers/mi-kaamcha-yisroel-logo-v1.webp"), width: 512, height: 512, mime: "image/webp" },
      titleImage,
    ];
  }
  // The existing Wellsprings listing thumbnail is only 80 x 104, so do not
  // advertise it as a social card. The title-specific PNG is the fallback.
  return [titleImage, BRAND_IMAGE];
}

/** Keep each image's structured properties adjacent to that image. */
export function publicationShareImageMeta(images: ShareImage[], alt: string) {
  return images.flatMap((image) => [
    { property: "og:image", content: image.url },
    { property: "og:image:type", content: image.mime },
    { property: "og:image:width", content: String(image.width) },
    { property: "og:image:height", content: String(image.height) },
    { property: "og:image:alt", content: alt },
  ]);
}
