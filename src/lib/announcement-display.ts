import type { AnnouncementBanner } from "@/integrations/supabase/api.functions";

export type AnnouncementDisplay = {
  text: string;
  linkUrl: string | null;
  linkLabel: string | null;
  isExternal: boolean;
};

/** Pure: what the homepage banner shows for the admin-saved setting, or null to hide it. */
export function resolveAnnouncementDisplay(banner: AnnouncementBanner | null | undefined): AnnouncementDisplay | null {
  if (!banner || !banner.enabled || !banner.text || !banner.text.trim()) return null;
  const text = banner.text.trim();
  const hasConfiguredLink = Boolean(banner.linkUrl && banner.linkLabel);
  const emailReminder = /email|reminder|subscribe/i.test(text);
  const linkUrl = hasConfiguredLink ? banner.linkUrl! : emailReminder ? "#weekly-email-signup" : null;
  const linkLabel = hasConfiguredLink ? banner.linkLabel! : emailReminder ? "Subscribe" : null;
  const show = Boolean(linkUrl && linkLabel);
  return {
    text,
    linkUrl: show ? linkUrl : null,
    linkLabel: show ? linkLabel : null,
    isExternal: Boolean(show && linkUrl!.startsWith("http")),
  };
}
