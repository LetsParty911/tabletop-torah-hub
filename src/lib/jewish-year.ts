/**
 * Determine the current Hebrew year for a given Gregorian date.
 *
 * Uses the Hebcal converter API (the same source as the rest of the site)
 * so we don't introduce a second, conflicting Jewish-calendar source.
 *
 * Returns a number like 5786. Falls back to a Gregorian-based estimate
 * if the API call fails so uploads never break.
 */
export async function getCurrentJewishYear(date: Date = new Date()): Promise<number> {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
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
  // Rough fallback: Hebrew year ≈ Gregorian + 3760 (after Rosh Hashanah, +3761).
  // Sept/Oct is when Rosh Hashanah falls; bump after Sept 15 as a safe heuristic.
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return yyyy + 3760 + (month > 9 || (month === 9 && day >= 15) ? 1 : 0);
}
