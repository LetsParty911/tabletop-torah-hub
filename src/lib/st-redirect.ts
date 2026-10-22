/**
 * Branded short link (/st) for a personal WhatsApp Status promotion.
 *
 * Attribution stays inside the existing weekly-parsha WhatsApp campaign.
 * The "st" content variant distinguishes personal Status arrivals from
 * the general /wa short link without exposing "status" in the public path.
 * No referrer header is required. Incoming query strings are ignored.
 */
export const ST_REDIRECT_TARGET =
  "https://torahforthetable.com/?utm_source=whatsapp&utm_medium=social&utm_campaign=weekly_parsha&utm_content=st";
