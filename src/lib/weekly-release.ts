/** Thursday 8pm Eastern, derived from the reading date (DST aware). */
export function weeklyReleaseAt(readingDate: string | null | undefined): Date | null {
  if (!readingDate) return null;
  const day = new Date(`${readingDate}T12:00:00Z`);
  if (!Number.isFinite(day.getTime())) return null;
  day.setUTCDate(day.getUTCDate() - 2);
  const [year, month, date] = day.toISOString().slice(0, 10).split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date, 20);
  let guess = wall;
  for (let i = 0; i < 2; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0);
    guess += wall - Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  }
  return new Date(guess);
}

export function weeklyReleaseState(readingDate: string | null | undefined, currentPublishedCount: number, now: number) {
  if (currentPublishedCount > 0) return "published" as const;
  const release = weeklyReleaseAt(readingDate);
  return release && now >= release.getTime() ? "delayed" as const : "pending" as const;
}