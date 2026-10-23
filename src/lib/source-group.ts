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
  const src = (input.utm_source ?? "").trim().toLowerCase();
  const med = (input.utm_medium ?? "").trim().toLowerCase();
  const hasCampaign = Boolean(input.utm_source || input.utm_medium || input.utm_campaign);
  const any = [host, src, med].join(" ");

  if (isShulPosterSource(input)) return "Shul Poster";
  // Branded email campaigns must remain distinct from unspecified email traffic.
  // Require an email medium; the same organizations may use other channels.
  if (src === "ourkehilla" && (med === "email" || med === "newsletter")) return "OurKehilla Email";
  if (src === "sender" && (med === "email" || med === "newsletter")) return "Sender.net Email";
  if ((src === "sender" || src === "ourkehilla") && med && med !== "email" && med !== "newsletter") return "Other Campaign";
  if (/whatsapp|wa\.me|chat\.whatsapp/.test(any)) return "WhatsApp";
  if (/(^|\W)(email|newsletter|mail)(\W|$)/.test(" " + med + " ") || /email|newsletter|sender|resend|mailchimp/.test(src))
    return "Email";
  if (/^mail\.|webmail|outlook|mail\.google/.test(host)) return "Email";
  if (/(^|\.)google\./.test(host) || src === "google") return "Google";
  if (!host && !hasCampaign) return "Direct";
  if (hasCampaign) return "Other Campaign";
  return "Other Referral";
}

/**
 * Preserve existing ingest behavior for unrecognized campaigns while enforcing
 * the known UTM mappings on the server. This also fixes events from a browser
 * that still has an older client bundle or stored first-touch source label.
 */
export function sourceGroupForIngest(input: SourceGroupInput, suppliedGroup: string | null): string {
  const classified = normalizeSourceGroup(input);
  if (classified === "Shul Poster" || classified === "OurKehilla Email" || classified === "Sender.net Email") {
    return classified;
  }
  return suppliedGroup?.trim() || "Direct";
}
