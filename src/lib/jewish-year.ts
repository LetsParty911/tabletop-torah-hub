/**
 * Determine the Hebrew year for the site's current upload cycle.
 *
 * Weekly material is usually uploaded before the Shabbos or Yom Tov it belongs to.
 * Around Rosh Hashanah, the upload date can still be in the old Hebrew year even
 * though the upcoming collection belongs to the new year. To avoid misfiling those
 * uploads, resolve the Hebrew year for the upcoming Shabbos (or today when already
 * Shabbos) instead of blindly using the current civil date.
 *
 * Uses the Hebcal converter API (the same source as the rest of the site) so we
 * don't introduce a second, conflicting Jewish-calendar source. Falls back to a
 * Gregorian-based estimate so uploads never break if the API is unavailable.
 */
export async function getCurrentJewishYear(date: Date = new Date()): Promise<number> {
  const target = new Date(date);
  const daysUntilShabbos = (6 - target.getUTCDay() + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilShabbos);

  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(target.getUTCDate()).padStart(2, "0");

  try {
    const res = await fetch(
      `https://www.hebcal.com/converter?cfg=json&gy=${yyyy}&gm=${mm}&gd=${dd}&g2h=1`,
    );
    const data = await res.json();
    const hy = Number(data?.hy);
    if (Number.isFinite(hy) && hy > 5000) return hy;
  } catch {
    // ignore — fall through to estimate
  }

  // Rough fallback: Hebrew year ≈ Gregorian + 3760, with the year rollover
  // approximated in mid-September. Use the same target date we would have sent
  // to Hebcal, not the original upload date.
  const month = target.getUTCMonth() + 1;
  const day = target.getUTCDate();
  return yyyy + 3760 + (month > 9 || (month === 9 && day >= 15) ? 1 : 0);
}
