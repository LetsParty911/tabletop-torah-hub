export type WeeklyCardBadge = { label: string; tone: "subtle" | "status" };

/**
 * Badges for a homepage weekly card. "TFTT Original" is quiet provenance;
 * any stored status badge (e.g. NEW) stays a prominent status and is no
 * longer hidden when the card is also an original.
 */
export function weeklyCardBadges(isOriginal: boolean, badge: string | null | undefined): WeeklyCardBadge[] {
  const out: WeeklyCardBadge[] = [];
  if (isOriginal) out.push({ label: "TFTT Original", tone: "subtle" });
  const status = badge?.trim();
  if (status && !(isOriginal && /^tftt original$/i.test(status))) out.push({ label: status, tone: "status" });
  return out;
}
