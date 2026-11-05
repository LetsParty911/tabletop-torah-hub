/** Public object derivatives only: no paid image-transform endpoint. */
export function smallThumbnailUrl(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source === "/publication-covers/torah-wellsprings-plaque-v2.jpg") return "/publication-covers/torah-wellsprings-small.webp";
  if (source === "/publication-covers/mi-kaamcha-yisroel-permanent.jpg") return "/publication-covers/mi-kaamcha-yisroel-small.webp";
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || !/\/storage\/v1\/object\/public\/pdf-thumbs\/[a-f0-9-]+\.png$/i.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\.png$/, ".small.webp");
    return url.href;
  } catch {
    return null;
  }
}