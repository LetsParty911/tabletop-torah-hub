/**
 * Post-Shabbos framing window: from 10:00 PM Eastern on Saturday night until
 * the new week's collection actually goes live (callers gate on real content).
 * Fixed ET cutover — no zmanim / visitor-location logic on purpose.
 */
export function isPostShabbosWindow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  if (weekday === "Sat") return hour >= 22;
  // Sunday through Thursday: still "last Shabbos" until new content is live.
  return ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(weekday);
}
