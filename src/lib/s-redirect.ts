/**
 * Branded one-letter short link (/s) for the shul poster.
 *
 * Single fixed target so the shared visible URL stays short while the
 * tagged URL appears only after navigation. Inbound query strings on /s
 * are intentionally ignored — this alias always uses exactly these UTMs.
 * The short URL itself carries no reference to the venue.
 */
export const S_REDIRECT_TARGET =
  "https://torahforthetable.com/?utm_source=shul&utm_medium=poster&utm_campaign=evergreen_poster_oct2026";
