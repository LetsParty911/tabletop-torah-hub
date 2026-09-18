/**
 * Deterministic helpers for the admin Reports destination.
 *
 * Everything here is pure, template-based, and testable. No AI, no runtime
 * narrative generation beyond fixed rules over canonical filtered counts.
 */

import { shouldShowRate } from "@/lib/admin-analytics-display";

const NY = "America/New_York";

function newYorkParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Local New York calendar date of an instant, as `YYYY-MM-DD`. */
export function newYorkDayKey(date: Date = new Date()): string {
  const parts = newYorkParts(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!match) throw new Error(`Invalid day key: ${dayKey}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Midnight (00:00:00 local) of a New York calendar date, as an ISO instant.
 * DST-correct: the candidate instant is corrected until it formats back to
 * exactly 00:00:00 in New York, which handles both spring-forward and
 * fall-back boundaries.
 */
export function startOfNewYorkDay(dayKey: string): string {
  const { year, month, day } = parseDayKey(dayKey);
  const targetWallClock = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = targetWallClock;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const shown = newYorkParts(new Date(candidate));
    const shownWallClock = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const correction = targetWallClock - shownWallClock;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate).toISOString();
}

/** Shift a `YYYY-MM-DD` key by whole calendar days. */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const { year, month, day } = parseDayKey(dayKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export type DayWindow = { dayKey: string; start: string; end: string };

/** The full local-day window `[midnight, next midnight)` in New York. */
export function newYorkDayWindow(dayKey: string): DayWindow {
  return {
    dayKey,
    start: startOfNewYorkDay(dayKey),
    end: startOfNewYorkDay(addDaysToDayKey(dayKey, 1)),
  };
}

/** The most recent fully completed local calendar day. */
export function previousCompletedDayKey(now: Date = new Date()): string {
  return addDaysToDayKey(newYorkDayKey(now), -1);
}

/** Completed local days, newest first, for the day picker. */
export function recentCompletedDayKeys(now: Date = new Date(), count = 14): string[] {
  const first = previousCompletedDayKey(now);
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDaysToDayKey(first, -index));
}

/** Same weekday, one week earlier — the only comparable daily baseline. */
export function priorWeekDayKey(dayKey: string): string {
  return addDaysToDayKey(dayKey, -7);
}

export function formatDayLabel(dayKey: string): string {
  const { year, month, day } = parseDayKey(dayKey);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatWindowLabel(startIso: string, endIso: string): string {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: NY,
    }).format(new Date(value));
  return `${format(startIso)} – ${format(endIso)} ET`;
}

export type CollectionWindowLike = { parsha: string; start: string; end: string };

/**
 * Collections whose window has fully closed. `buildCollectionWindows` returns
 * newest-first and gives the newest window an open end in the near future, so
 * a window only counts as completed once its end is in the past.
 */
export function completedCollectionWindows<T extends CollectionWindowLike>(
  windows: T[],
  now: Date = new Date(),
): T[] {
  return windows.filter((window) => Date.parse(window.end) <= now.getTime());
}

/** The completed collection to report on, plus the prior completed one. */
export function selectCollectionReportWindows<T extends CollectionWindowLike>(
  windows: T[],
  options: { parsha?: string | null; now?: Date } = {},
): { current: T | null; previous: T | null; available: T[] } {
  const available = completedCollectionWindows(windows, options.now ?? new Date());
  if (!available.length) return { current: null, previous: null, available };
  const requestedIndex = options.parsha
    ? available.findIndex((window) => window.parsha === options.parsha)
    : -1;
  const index = requestedIndex >= 0 ? requestedIndex : 0;
  return { current: available[index]!, previous: available[index + 1] ?? null, available };
}

/* ------------------------------------------------------------------ */
/* Deterministic observations                                          */
/* ------------------------------------------------------------------ */

export type ObservationInput = {
  people: number;
  usedTorah: number;
  pdfOpens: number;
  downloads: number;
  signups: number;
  returningReaders: number;
  searchesTotal: number;
  searchesWithoutOutcome: number;
  topSource: { label: string; sessions: number } | null;
  topCampaign: { label: string; sessions: number } | null;
  topPublication: { title: string; pdfOpens: number; downloadActions: number } | null;
  topSourceDownloads: { label: string; downloads: number } | null;
  filteredAutomationSessions: number;
  rawSessions: number;
};

/** 2–3 factual statements derived only from counts. Never speculative. */
export function buildObservations(input: ObservationInput): string[] {
  const notes: string[] = [];

  if (input.people === 0) {
    return ["No canonical reader activity was recorded in this period."];
  }

  if (input.topSourceDownloads && input.downloads > 0 && input.topSourceDownloads.downloads > 0) {
    notes.push(
      `${input.topSourceDownloads.label} produced ${input.topSourceDownloads.downloads} of ${input.downloads} download actions.`,
    );
  } else if (input.downloads === 0 && input.pdfOpens > 0) {
    notes.push(`${input.pdfOpens} PDF opens occurred with no download actions.`);
  }

  if (input.searchesTotal > 0) {
    notes.push(
      input.searchesWithoutOutcome === 0
        ? "No searches failed to lead to content."
        : `${input.searchesWithoutOutcome} of ${input.searchesTotal} searches led to no publication, PDF, or download action.`,
    );
  }

  if (notes.length < 3 && input.topPublication) {
    notes.push(
      `${input.topPublication.title} led with ${input.topPublication.pdfOpens} PDF opens and ${input.topPublication.downloadActions} download actions.`,
    );
  }

  if (notes.length < 3 && input.signups > 0) {
    notes.push(`${input.signups} ${input.signups === 1 ? "signup" : "signups"} were recorded.`);
  }

  if (notes.length < 2 && input.filteredAutomationSessions > 0) {
    notes.push(
      `${input.filteredAutomationSessions} of ${input.rawSessions} raw sessions were set aside as suspected automation.`,
    );
  }

  if (notes.length < 2) {
    notes.push(
      `${input.people} ${input.people === 1 ? "person" : "people"} visited and ${input.usedTorah} used Torah.`,
    );
  }

  return notes.slice(0, 3);
}

export type ChangeInput = {
  label: string;
  current: number;
  previous: number;
};

/** "What changed" lines: plain deltas, no percentages under small samples. */
export function buildChangeObservations(items: ChangeInput[]): string[] {
  return items
    .map((item) => {
      const delta = item.current - item.previous;
      if (item.previous === 0 && item.current === 0) return null;
      if (delta === 0) return `${item.label} was unchanged at ${item.current}.`;
      const direction = delta > 0 ? "up" : "down";
      const base = `${item.label} was ${direction} ${Math.abs(delta)} (${item.previous} → ${item.current})`;
      if (shouldShowRate(item.previous)) {
        const percent = Math.round((Math.abs(delta) / item.previous) * 100);
        return `${base}, a ${percent}% change.`;
      }
      return `${base}.`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 3);
}

/** Enough comparable data to show a prior-period comparison at all. */
export function hasComparableBaseline(previous: { people: number; sessions: number }): boolean {
  return previous.people > 0 || previous.sessions > 0;
}
