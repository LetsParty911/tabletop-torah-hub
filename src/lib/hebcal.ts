// Shared Hebcal access. One place that owns: the Diaspora reading schedule,
// a 24-hour cache, name normalization, and a static fallback so the hero can
// never render blank when Hebcal is unreachable.

import { PARSHIYOS_54, hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";

export type HebcalItem = {
  title: string;
  category: string;
  subcat?: string;
  date: string;
};

/**
 * Diaspora schedule. Hebcal defaults to Diaspora, so we deliberately never
 * send `i=on` — Israel runs a week ahead for several weeks in some years.
 */
export const HEBCAL_SHABBAT_URL =
  "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on";

const CACHE_MS = 24 * 60 * 60 * 1000;

let cache: { at: number; items: HebcalItem[] } | null = null;
let inFlight: Promise<HebcalItem[]> | null = null;

/** Fetch this week's Shabbos items, cached for 24 hours. Throws on failure. */
export async function fetchHebcalShabbat(): Promise<HebcalItem[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch(HEBCAL_SHABBAT_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Hebcal responded ${res.status}`);
    const data = await res.json();
    const items: HebcalItem[] = data?.items ?? [];
    cache = { at: Date.now(), items };
    return items;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** First Shabbos of 5786 (Bereishis) — the anchor for the offline fallback. */
const ANCHOR_DATE = Date.UTC(2025, 9, 18);

/**
 * Static fallback: step through the ordered 54 parshiyos from a known anchor
 * Shabbos. Approximate during combined-reading weeks, but never blank.
 */
export function staticFallbackParsha(now: Date = new Date()): string {
  const weeks = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ANCHOR_DATE) /
      (7 * 24 * 60 * 60 * 1000),
  );
  const i = ((weeks % PARSHIYOS_54.length) + PARSHIYOS_54.length) % PARSHIYOS_54.length;
  return PARSHIYOS_54[i]!;
}

/**
 * Resolve the current reading from Hebcal, preferring a major Yom Tov that
 * falls on the same Shabbos. Falls back to the static list on any failure.
 */
export async function resolveHebcalParsha(): Promise<{
  parshaKey: string;
  label: string;
  isStaticFallback: boolean;
}> {
  try {
    const items = await fetchHebcalShabbat();
    const parsha = items.find((i) => i.category === "parashat");
    const yomTovOnShabbos = parsha
      ? items.find(
          (i) =>
            i.category === "holiday" &&
            i.subcat === "major" &&
            i.date.slice(0, 10) === parsha.date.slice(0, 10),
        )
      : undefined;

    if (yomTovOnShabbos) {
      const key = hebcalYomTovToKey(yomTovOnShabbos.title) ?? yomTovOnShabbos.title;
      return { parshaKey: key, label: key, isStaticFallback: false };
    }
    if (parsha) {
      // Unmapped names pass through unchanged rather than erroring.
      const key = hebcalToParshaKey(parsha.title);
      return { parshaKey: key, label: `Parshas ${key}`, isStaticFallback: false };
    }
  } catch (e) {
    console.error("Hebcal load error", e);
  }

  const key = staticFallbackParsha();
  return { parshaKey: key, label: `Parshas ${key}`, isStaticFallback: true };
}

/** The parsha that follows `key` in the ordered list (handles combined names). */
export function nextParshaAfter(key: string | null): string | null {
  if (!key) return null;
  const last = key.split("-").pop()!.trim();
  const i = PARSHIYOS_54.findIndex((p) => p.toLowerCase() === last.toLowerCase());
  if (i === -1) return null;
  return PARSHIYOS_54[(i + 1) % PARSHIYOS_54.length]!;
}
