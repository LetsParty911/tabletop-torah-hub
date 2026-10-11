/**
 * Branded WhatsApp short link (/wa).
 *
 * Evergreen attribution so the same shared /wa link does not mislabel future
 * weekly collections as the Bereishis campaign. Reports group arrivals by
 * collection window; historical Bereishis UTM records remain unchanged.
 * Inbound query strings on /wa are intentionally ignored.
 */
export const WA_REDIRECT_TARGET =
  "https://torahforthetable.com/?utm_source=whatsapp&utm_medium=social&utm_campaign=weekly_parsha";
