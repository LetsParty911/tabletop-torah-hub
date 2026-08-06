/**
 * Canonical public origin for anything that leaves the site
 * (share links, copied URLs, WhatsApp messages).
 * Never derive these from window.location.origin — preview hosts
 * produce gated, non-public links.
 */
export const SITE_URL = "https://torahforthetable.com";

/** Build an absolute, publicly shareable URL from a site-relative path. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
