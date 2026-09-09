// Shared Hebcal access. One place that owns: the Diaspora reading schedule,
// a 24-hour cache, name normalization, and a static fallback so the hero can
// never render blank when Hebcal is unreachable.

import {
  PARSHIYOS_54,
  hebcalToParshaKey,
  hebcalYomTovToKey,
  normalizeYomTovTitle,
} from "@/lib/parshiyos";

export type HebcalItem = {
  title: string;
  category: string;
  subcat?: string;
  date: string;
  hdate?: string;
  /** True for the actual Yom Tov day itself (Hebcal also tags Erev days and
   * post-Yom-Tov fasts like Tzom Gedaliah as subcat "major" without this). */
  yomtov?: boolean;
};

/**
 * Diaspora schedule. Hebcal defaults to Diaspora, so we deliberately never
 * send `i=on` — Israel runs a week ahead for several weeks in some years.
 */
export const HEBCAL_SHABBAT_URL = "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on";

const CACHE_MS = 24 * 60 * 60 * 1000;

export type HebcalShabbat = {
  items: HebcalItem[];
  /** Hebcal's reported window for this Shabbos, e.g. { start, end }. */
  range: { start?: string; end?: string } | null;
};

let cache: { at: number; data: HebcalShabbat } | null = null;
let inFlight: Promise<HebcalShabbat> | null = null;

// Cloudflare Workers' fetch() accepts this extra `cf` option to cache a
// subrequest at the edge, independent of any in-memory state. Ignored
// harmlessly outside the Cloudflare runtime (e.g. local dev).
type CfFetchInit = RequestInit & {
  cf?: { cacheTtl?: number; cacheEverything?: boolean };
};

/** Fetch this week's Shabbos payload (items + range), cached 24h. Throws on failure. */
export async function fetchHebcalShabbatData(): Promise<HebcalShabbat> {
  // First layer: this Worker instance's own memory - zero network cost, but
  // only helps while the same isolate keeps handling requests.
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const data = await fetchHebcalShabbatPayload(HEBCAL_SHABBAT_URL);
    cache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function fetchHebcalShabbatPayload(url: string): Promise<HebcalShabbat> {
  // Cloudflare's edge cache for this exact request URL.
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: CACHE_MS / 1000, cacheEverything: true },
  } as CfFetchInit);
  if (!res.ok) throw new Error(`Hebcal responded ${res.status}`);
  const json = await res.json();
  return {
    items: json?.items ?? [],
    range: json?.range ?? null,
  };
}

/**
 * Resolve the reading for the Shabbos containing `dateISO` (YYYY-MM-DD).
 * Used to find the week AFTER a Yom Tov week, which the static parsha list
 * cannot express. Returns null on any failure (callers degrade gracefully).
 */
export async function resolveReadingForDate(dateISO: string): Promise<ResolvedReading | null> {
  try {
    const [y, m, d] = dateISO.split("-");
    const url = `${HEBCAL_SHABBAT_URL}&gy=${y}&gm=${Number(m)}&gd=${Number(d)}`;
    const data = await fetchHebcalShabbatPayload(url);
    const resolved = resolveReadingFromHebcal(data, new Date(`${dateISO}T12:00:00Z`));
    return resolved.parshaKey ? resolved : null;
  } catch (e) {
    console.error("Hebcal next-week load error", e);
    return null;
  }
}

/** Backwards-compatible items-only accessor. */
export async function fetchHebcalShabbat(): Promise<HebcalItem[]> {
  return (await fetchHebcalShabbatData()).items;
}

/** Today's date in Eastern time as YYYY-MM-DD. */
export function easternDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The upcoming (or current) Saturday in Eastern time, as YYYY-MM-DD. */
export function upcomingShabbosDate(now: Date = new Date()): string {
  const today = easternDateKey(now);
  const d = new Date(`${today}T12:00:00Z`);
  const delta = (6 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export type ResolvedReading = {
  /** Normalized key, e.g. "Nitzavim-Vayeilech" or "Rosh Hashanah". Null when unknown. */
  parshaKey: string | null;
  /** Display label, e.g. "Parshas Noach", "Rosh Hashanah", or "Parshas Hashavua". */
  label: string;
  /** True when Hebcal could not be used at all. */
  isStaticFallback: boolean;
  /** ISO date (YYYY-MM-DD) of the Shabbos this reading belongs to, when known. */
  readingDate: string | null;
};

/**
 * Turn a Hebcal Shabbat payload into the reading for the relevant Shabbos.
 *
 * Cases handled:
 *  - Ordinary Shabbos: a `parashat` item exists -> Parshas <name>.
 *  - Shabbos Yom Tov with NO `parashat` item (e.g. Rosh Hashanah 2026-09-12):
 *    the Shabbos date comes from `range.end` (or the computed upcoming
 *    Saturday) and a major holiday on that date wins.
 *  - Neither present: null key + neutral "Parshas Hashavua" label. We never
 *    guess a weekly parsha, because a guess during a Yom Tov or combined
 *    reading week is confidently wrong (that was the Re'eh bug).
 */
export function resolveReadingFromHebcal(
  data: HebcalShabbat,
  now: Date = new Date(),
): ResolvedReading {
  const items = data.items ?? [];
  const parsha = items.find((i) => i.category === "parashat");

  // Shabbos date: prefer the parsha's own date, then Hebcal's range end,
  // then the computed upcoming Saturday.
  const rangeStart = data.range?.start ? data.range.start.slice(0, 10) : null;
  const rangeEnd = data.range?.end ? data.range.end.slice(0, 10) : null;
  const shabbosDate = parsha?.date?.slice(0, 10) ?? rangeEnd ?? upcomingShabbosDate(now);

  // Yom Tov detection must NOT depend on a parashat item existing. Hebcal's
  // reported `range` can span a connected block covering Erev + both days +
  // the day after (e.g. Rosh Hashanah 2026: range is 9/11-9/14, covering
  // Erev Rosh Hashana, both Yom Tov days, AND Tzom Gedaliah — Hebcal tags
  // Erev days and post-Yom-Tov fasts subcat "major" too, not just the real
  // holiday). A single exact-date match against a computed `shabbosDate`
  // used to miss the actual holiday entirely; searching the whole range
  // fixes that, but must prefer items where `yomtov` is true (the real
  // holiday day) over Erev/fast items in the same window, which come first
  // in Hebcal's item order and would otherwise win by being found first.
  const holidayCandidates = items.filter(
    (i) => i.category === "holiday" && i.subcat === "major",
  );
  const realYomTovDays = holidayCandidates.filter((i) => i.yomtov === true);
  const searchPool = realYomTovDays.length > 0 ? realYomTovDays : holidayCandidates;
  const yomTovOnShabbos =
    rangeStart || rangeEnd
      ? searchPool.find((i) => {
          const d = i.date.slice(0, 10);
          return (!rangeStart || d >= rangeStart) && (!rangeEnd || d <= rangeEnd);
        })
      : searchPool.find((i) => i.date.slice(0, 10) === shabbosDate);

  if (yomTovOnShabbos) {
    const key =
      hebcalYomTovToKey(yomTovOnShabbos.title) ?? normalizeYomTovTitle(yomTovOnShabbos.title);
    const matchedDate = yomTovOnShabbos.date.slice(0, 10);
    return { parshaKey: key, label: key, isStaticFallback: false, readingDate: matchedDate };
  }

  if (parsha) {
    // Unmapped names pass through unchanged rather than erroring.
    const key = hebcalToParshaKey(parsha.title);
    return {
      parshaKey: key,
      label: `Parshas ${key}`,
      isStaticFallback: false,
      readingDate: shabbosDate,
    };
  }

  return { parshaKey: null, label: "Parshas Hashavua", isStaticFallback: true, readingDate: null };
}

/**
 * Resolve the current reading from Hebcal. On any network/parse failure we
 * return a neutral state rather than a fabricated parsha.
 */
export async function resolveHebcalParsha(): Promise<ResolvedReading> {
  try {
    return resolveReadingFromHebcal(await fetchHebcalShabbatData());
  } catch (e) {
    console.error("Hebcal load error", e);
    return {
      parshaKey: null,
      label: "Parshas Hashavua",
      isStaticFallback: true,
      readingDate: null,
    };
  }
}

/** The parsha that follows `key` in the ordered list (handles combined names). */
export function nextParshaAfter(key: string | null): string | null {
  if (!key) return null;
  const last = key.split("-").pop()!.trim();
  const i = PARSHIYOS_54.findIndex((p) => p.toLowerCase() === last.toLowerCase());
  if (i === -1) return null;
  return PARSHIYOS_54[(i + 1) % PARSHIYOS_54.length]!;
}

/**
 * True when the reading Hebcal reported is already in the past (its Shabbos
 * has ended), which means the collection on screen is last Shabbos's.
 */
export function isPastReading(readingDate: string | null, now: Date = new Date()): boolean {
  if (!readingDate) return false;
  return readingDate < easternDateKey(now);
}
