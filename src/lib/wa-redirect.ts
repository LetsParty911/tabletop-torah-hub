/**
 * Branded WhatsApp short link (/wa).
 *
 * Single fixed target so the shared visible URL stays short while the
 * tagged URL appears only after navigation. Inbound query strings on /wa
 * are intentionally ignored — this alias always uses exactly these UTMs.
 */
export const WA_REDIRECT_TARGET =
  "https://torahforthetable.com/?utm_source=whatsapp&utm_medium=social&utm_campaign=bereishis";
