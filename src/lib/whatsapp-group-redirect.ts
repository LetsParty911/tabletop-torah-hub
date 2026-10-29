import { WA_REDIRECT_TARGET } from "./wa-redirect";

/**
 * Per-group WhatsApp short links. These share the evergreen /wa campaign,
 * but each has a distinct utm_content value visible in campaign variants.
 * Existing /wa and /st redirect behavior is unchanged.
 */
export const WHATSAPP_GROUP_CONTENT = {
  wap: "passaic_clifton",
  wam: "our_side_of_main",
  waz: "czs",
} as const;

export type WhatsAppGroupCode = keyof typeof WHATSAPP_GROUP_CONTENT;

export function whatsappGroupRedirectTarget(group: WhatsAppGroupCode): string {
  const url = new URL(WA_REDIRECT_TARGET);
  url.searchParams.set("utm_content", WHATSAPP_GROUP_CONTENT[group]);
  return url.toString();
}
