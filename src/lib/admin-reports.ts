/**
 * Pure helpers for deterministic admin reports (daily + collection).
 * No AI, no network: every observation below is a fixed rule over canonical counts.
 */

const TZ = "America/New_York";

function newYorkParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
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

/** Calendar day (YYYY-MM-DD) in New York for an instant. */
export function newYorkDayKey(date: Date = new Date()): string {
  const parts = newYorkParts(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** ISO instant of local midnight in New York for a YYYY-MM-DD day key (DST safe). */
export function startOfNewYorkDay(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const shown = newYorkParts(new Date(candidate));
    const shownWall = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const correction = target - shownWall;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate).toISOString();
}

export function addDaysToDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Local-day window [start, end) in ISO instants; 23h/25h on DST-change days. */
export function newYorkDayWindow(dayKey: string): { start: string; end: string } {
  return { start: startOfNewYorkDay(dayKey), end: startOfNewYorkDay(addDaysToDayKey(dayKey, 1)) };
}

/** Last fully completed local calendar day. */
export function previousCompletedDayKey(now: Date = new Date()): string {
  return addDaysToDayKey(newYorkDayKey(now), -1);
}

/** Most recent completed local days, newest first. */
export function recentCompletedDayKeys(count = 14, now: Date = new Date()): string[] {
  const latest = previousCompletedDayKey(now);
  return Array.from({ length: count }, (_, index) => addDaysToDayKey(latest, -index));
}

/** Same weekday, one week earlier. */
export function priorWeekDayKey(dayKey: string): string {
  return addDaysToDayKey(dayKey, -7);
}

export function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatWindowLabel(startIso: string, endIso: string): string {
  const format = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  return `${format(startIso)} – ${format(endIso)} (New York time)`;
}

export type CollectionWindow = { parsha: string; start: string; end: string };

/** Collection windows whose end has already passed (current open window excluded). */
export function completedCollectionWindows(
  windows: CollectionWindow[],
  now: Date = new Date(),
): CollectionWindow[] {
  return windows.filter((window) => Date.parse(window.end) <= now.getTime());
}

export function selectCollectionReportWindows(
  windows: CollectionWindow[],
  requested: string | null | undefined,
  now: Date = new Date(),
): { current: CollectionWindow | null; previous: CollectionWindow | null; available: string[] } {
  const completed = completedCollectionWindows(windows, now);
  const available = completed.map((window) => window.parsha);
  const index = requested ? completed.findIndex((window) => window.parsha === requested) : 0;
  const resolved = index >= 0 ? index : 0;
  return {
    current: completed[resolved] ?? null,
    previous: completed[resolved + 1] ?? null,
    available,
  };
}

/** Percentages only when the denominator is meaningful. */
export const SMALL_N_THRESHOLD = 10;

export function formatRate(numerator: number, denominator: number): string {
  if (denominator < SMALL_N_THRESHOLD) return `${numerator} of ${denominator}`;
  return `${Math.round((numerator / denominator) * 100)}% (${numerator} of ${denominator})`;
}

export function hasComparableBaseline(metrics: { people: number; sessions: number } | null): boolean {
  if (!metrics) return false;
  return metrics.people > 0 || metrics.sessions > 0;
}

export type ObservationInput = {
  people: number;
  usedTorah: number;
  pdfOpens: number;
  downloads: number;
  signups: number;
  returningReaders: number;
  topPublication: { title: string; downloadActions: number; pdfOpens: number } | null;
  topSourceDownloads: { label: string; downloads: number } | null;
  searchesWithoutContent: number;
  searchesTotal: number;
  suspectedSessions: number;
};

/** Deterministic, factual notes (max 3). Never speculative. */
export function buildObservations(input: ObservationInput): string[] {
  if (input.people === 0 && input.pdfOpens === 0 && input.downloads === 0) {
    return ["No recorded visitor activity in this period."];
  }
  const notes: string[] = [];
  if (input.topSourceDownloads && input.downloads > 0 && input.topSourceDownloads.downloads > 0) {
    notes.push(
      `${input.topSourceDownloads.label} produced ${input.topSourceDownloads.downloads} of ${input.downloads} download actions.`,
    );
  }
  if (input.topPublication) {
    notes.push(
      `${input.topPublication.title} led with ${input.topPublication.downloadActions} download actions and ${input.topPublication.pdfOpens} PDF opens.`,
    );
  }
  if (input.searchesTotal > 0) {
    notes.push(
      input.searchesWithoutContent === 0
        ? "No searches failed to lead to content."
        : `${input.searchesWithoutContent} of ${input.searchesTotal} searches led to no publication, open or download.`,
    );
  }
  if (notes.length < 3 && input.signups > 0) {
    notes.push(`${input.signups} new signup${input.signups === 1 ? "" : "s"} recorded.`);
  }
  if (notes.length < 3 && input.suspectedSessions > 0) {
    notes.push(
      `${input.suspectedSessions} session${input.suspectedSessions === 1 ? " was" : "s were"} set aside as likely automated.`,
    );
  }
  if (!notes.length) notes.push("Activity recorded, but no notable publication or source pattern.");
  return notes.slice(0, 3);
}

export type ChangeInput = {
  label: string;
  current: number;
  previous: number;
};

/** "What changed" lines; percentage only when the baseline is >= 10. */
export function buildChangeObservations(changes: ChangeInput[]): string[] {
  const out: string[] = [];
  for (const change of changes) {
    const delta = change.current - change.previous;
    if (delta === 0) {
      out.push(`${change.label} unchanged at ${change.current}.`);
      continue;
    }
    const direction = delta > 0 ? "up" : "down";
    if (change.previous >= SMALL_N_THRESHOLD) {
      const percent = Math.round((Math.abs(delta) / change.previous) * 100);
      out.push(`${change.label} ${direction} ${Math.abs(delta)} (${percent}%), ${change.previous} → ${change.current}.`);
    } else {
      out.push(`${change.label} ${direction} ${Math.abs(delta)}, ${change.previous} → ${change.current}.`);
    }
  }
  return out.slice(0, 3);
}
