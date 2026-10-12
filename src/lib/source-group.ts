/**
 * Shared source-group rules for canonical first-party analytics.
 * Preserve the raw UTM fields; source_group is only a reporting label.
 */
export type SourceGroupInput = {
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

/** Match only shul-poster tags, not unrelated print or email campaigns. */
export function isShulPosterSource(input: Pick<SourceGroupInput, "utm_source" | "utm_medium">): boolean {
  return input.utm_source?.trim().toLowerCase() === "shul" && input.utm_medium?.trim().toLowerCase() === "poster";
}

export function normalizeSourceGroup(input: SourceGroupInput): string {
  const host = (input.referrer_host ?? "").toLowerCase();
  const src = (input.utm_source ?? "").toLowerCase();
  const med = (input.utm_medium ?? "").toLowerCase();
  const hasCampaign = Boolean(input.utm_source || input.utm_medium || input.utm_campaign);
  const any = [host, src, med].join(" ");

  if (isShulPosterSource(input)) return "Shul Poster";
  if (/whatsapp|wa\.me|chat\.whatsapp/.test(any)) return "WhatsApp";
  if (/(^|\W)(email|newsletter|mail)(\W|$)/.test(" " + med + " ") || /email|newsletter|sender|resend|mailchimp/.test(src))
    return "Email";
  if (/^mail\.|webmail|outlook|mail\.google/.test(host)) return "Email";
  if (/(^|\.)google\./.test(host) || src === "google") return "Google";
  if (!host && !hasCampaign) return "Direct";
  if (hasCampaign) return "Other Campaign";
  return "Other Referral";
}
