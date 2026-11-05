/** Storage URLs must come from the server's verified, version-matched inventory. */
export function smallThumbnailUrl(source: string | null | undefined, verified?: string | null): string | null {
  if (!source) return null;
  if (source === "/publication-covers/torah-wellsprings-plaque-v2.jpg") return "/publication-covers/torah-wellsprings-small.webp";
  if (source === "/publication-covers/mi-kaamcha-yisroel-permanent.jpg") return "/publication-covers/mi-kaamcha-yisroel-small.webp";
  if (verified) {
    try {
      const original = new URL(source);
      const small = new URL(verified);
      const match = /\/storage\/v1\/object\/public\/pdf-thumbs\/([a-f0-9-]{36})\.png$/.exec(original.pathname);
      if (match && original.protocol === "https:" && small.origin === original.origin &&
          new RegExp(`^/storage/v1/object/public/pdf-thumbs/${match[1]}\\.[a-f0-9]{32}\\.small\\.webp$`).test(small.pathname) && !small.search && !small.hash) return verified;
    } catch { /* Original-only on malformed or mismatched input. */ }
  }
  return null;
}