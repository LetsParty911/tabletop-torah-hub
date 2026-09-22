// True cohort retention from the canonical event stream.
//
// Rules that keep the numbers honest:
// - Returns are counted from DISTINCT SESSION STARTS, never arbitrary event
//   timestamps. A heartbeat or a second pageview inside the same session can
//   never look like a return visit.
// - Cohorts are CUMULATIVE: D7 means "came back at any point from 24h after
//   the first session through 7 days after it", not "came back exactly on
//   day 7". D1 is the 24h-48h window.
// - A visitor only enters a cohort when their FIRST session is actually
//   observed. Anyone with canonical history before the observation period is
//   left-censored out, because we cannot know their real day 0.
// - A visitor only counts in a denominator once the full window has elapsed
//   for them; everyone else is reported separately as immature.
// - Percentages follow the house rule: suppressed under 10 eligible.

export const DAY_MS = 24 * 60 * 60 * 1000;

export type VisitorTimeline = {
  visitorId: string;
  /** Epoch ms of the visitor's first observed session start. */
  firstSession: number;
  /** Epoch ms of every observed DISTINCT session start (including the first). */
  sessionStarts: number[];
  /** True when the visitor has canonical history before the observation period. */
  hasPriorHistory?: boolean;
};

export type CohortWindow = "D1" | "D7" | "D30";

export type CohortResult = {
  window: CohortWindow;
  /** Human-readable definition of what this cohort counts. */
  definition: string;
  /** Visitors whose first session is observed AND who have had time to qualify. */
  eligible: number;
  /** Of those, how many came back inside the window. */
  returned: number;
  /** Null when the denominator is under 10 or nothing is eligible. */
  rate: number | null;
  /** Visitors observed but excluded because the window has not elapsed yet. */
  immature: number;
  /** Visitors excluded because they had history before the observation period. */
  leftCensored: number;
};

const WINDOWS: Array<{
  window: CohortWindow;
  /** Earliest delta from the first session that counts as a return. */
  fromMs: number;
  /** Latest delta that counts, and the time that must have elapsed to judge. */
  toMs: number;
  definition: string;
}> = [
  { window: "D1", fromMs: DAY_MS, toMs: 2 * DAY_MS, definition: "Came back in a later session 24-48 hours after their first session." },
  { window: "D7", fromMs: DAY_MS, toMs: 7 * DAY_MS, definition: "Came back in any later session from 24 hours through 7 days after their first session (cumulative)." },
  { window: "D30", fromMs: DAY_MS, toMs: 30 * DAY_MS, definition: "Came back in any later session from 24 hours through 30 days after their first session (cumulative)." },
];

/**
 * @param timelines  visitor session timelines
 * @param observationStart  epoch ms; visitors first seen before this are not cohortable
 * @param now  epoch ms
 */
export function computeCohorts(
  timelines: VisitorTimeline[],
  observationStart: number,
  now = Date.now(),
): CohortResult[] {
  const censored = timelines.filter((t) => t.hasPriorHistory === true || t.firstSession < observationStart);
  const cohortable = timelines.filter((t) => t.hasPriorHistory !== true && t.firstSession >= observationStart);

  return WINDOWS.map(({ window, fromMs, toMs, definition }) => {
    let eligible = 0;
    let returned = 0;
    let immature = 0;

    for (const visitor of cohortable) {
      if (now - visitor.firstSession < toMs) {
        immature += 1;
        continue;
      }
      eligible += 1;
      const came = visitor.sessionStarts.some((at) => {
        const delta = at - visitor.firstSession;
        return delta >= fromMs && delta <= toMs;
      });
      if (came) returned += 1;
    }

    return {
      window,
      definition,
      eligible,
      returned,
      rate: eligible >= 10 ? returned / eligible : null,
      immature,
      leftCensored: censored.length,
    };
  });
}

/** ISO week key (UTC) used for "active in N distinct weeks". */
export function weekKey(epochMs: number): string {
  const date = new Date(epochMs);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - day * DAY_MS;
  return new Date(monday).toISOString().slice(0, 10);
}

export type WeeklyLoyalty = {
  twoPlusWeeks: number;
  fourPlusWeeks: number;
  visitorsConsidered: number;
};

export function computeWeeklyLoyalty(timelines: VisitorTimeline[]): WeeklyLoyalty {
  let twoPlus = 0;
  let fourPlus = 0;
  for (const visitor of timelines) {
    const weeks = new Set(visitor.sessionStarts.map(weekKey));
    if (weeks.size >= 2) twoPlus += 1;
    if (weeks.size >= 4) fourPlus += 1;
  }
  return { twoPlusWeeks: twoPlus, fourPlusWeeks: fourPlus, visitorsConsidered: timelines.length };
}
