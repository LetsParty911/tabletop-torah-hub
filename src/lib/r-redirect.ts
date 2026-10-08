/**
 * Branded one-letter short link (/r) for the OurKehilla poster ad.
 *
 * Single fixed target so the shared visible URL stays short while the
 * tagged URL appears only after navigation. Inbound query strings on /r
 * are intentionally ignored — this alias always uses exactly these UTMs.
 * The short URL itself carries no reference to the advertiser.
 */
export const R_REDIRECT_TARGET =
  "https://torahforthetable.com/?utm_source=ourkehilla&utm_medium=email&utm_campaign=poster_oct2026";
