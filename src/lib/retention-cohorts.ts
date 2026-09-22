// True cohort retention from the canonical event stream.
//
// Rules that keep the numbers honest:
// - A visitor only enters a cohort when their FIRST canonical session is
//   actually observed in the data we hold. Visitors whose history starts before
//   the observation window are excluded, because we cannot know their day 0.
// - A visitor only counts in a denominator once the full window has elapsed for
//   them. Someone who first visited yesterday cannot yet fail a D7 test.
// - Percentages follow the existing house rule: suppressed under 10.

export const DAY_MS = 24 * 60 * 60 * 1000;

export type VisitorTimeline = {
  visitorId: string;
  /** Epoch ms of the visitor's first observed canonical event. */
  firstSeen: number;
  /** Epoch ms of every observed canonical event day (any activity). */
  activeAt: number[];
};

export type CohortResult = {
  window: "D1" | "D7" | "D30";
  /** Visitors whose first session is observed AND who have had time to qualify. */
  eligible: number;
  /** Of those, how many came back after the window opened. */
  returned: number;
  /** Null when the denominator is under 10 or nothing is eligible. */
  rate: number | null;
  /** Visitors observed but excluded because the window has not elapsed yet. */
  immature: number;
};

const WINDOWS: Array<{ window: CohortResult["window"]; days: number }> = [
  { window: "D1", days: 1 },
  { window: "D7", days: 7 },
  { window: "D30", days: 30 },
];

/**
 * @param timelines  visitors whose first observed event is inside the observation window
 * @param observationStart  epoch ms; visitors first seen before this are not cohortable
 * @param now  epoch ms
 */
export function computeCohorts(
  timelines: VisitorTimeline[],
  observationStart: number,
  now = Date.now(),
): CohortResult[] {
  const cohortable = timelines.filter((t) => t.firstSeen >= observationStart);

  return WINDOWS.map(({ window, days }) => {
    const span = days * DAY_MS;
    let eligible = 0;
    let returned = 0;
    let immature = 0;

    for (const visitor of cohortable) {
      if (now - visitor.firstSeen < span) {
        immature += 1;
        continue;
      }
      eligible += 1;
      const opens = visitor.firstSeen + span;
      // "Returned on/after the window" — a same-day second page view is not a
      // return visit, so the day-0 activity never counts.
      const came = visitor.activeAt.some(
        (at) => at >= opens - DAY_MS && at <= opens + DAY_MS && at - visitor.firstSeen >= DAY_MS,
      );
      if (came) returned += 1;
    }

    return {
      window,
      eligible,
      returned,
      rate: eligible >= 10 ? returned / eligible : null,
      immature,
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
    const weeks = new Set(visitor.activeAt.map(weekKey));
    if (weeks.size >= 2) twoPlus += 1;
    if (weeks.size >= 4) fourPlus += 1;
  }
  return { twoPlusWeeks: twoPlus, fourPlusWeeks: fourPlus, visitorsConsidered: timelines.length };
}
