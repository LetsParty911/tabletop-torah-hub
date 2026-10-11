import { isOpenPdfClick } from "./open-pdf-clicks";

/**
 * Read-only interpretation of existing IP/edge geolocation.
 *
 * Not GPS. Never combines an unrelated city, region and postal code from
 * separate telemetry rows into a fictitious location. No additional provider
 * requests, client permissions, IP persistence or device fingerprinting.
 */
export type GeoEvent = {
  session_id?: string | null;
  occurred_at?: string;
  event_name?: string | null;
  metadata?: Record<string, unknown> | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;
  geo_source?: string | null;
  geo_provider?: string | null;
  geo_reliability?: string | null;
  network_type?: string | null;
};

const value = (v: string | null | undefined) => (v ?? "").trim();
const norm = (v: string | null | undefined) => value(v).replace(/\s+/g, " ").toLocaleLowerCase("en");
const RISK_TYPES = new Set(["mobile", "vpn", "proxy", "tor", "hosting", "relay"]);

function placeScore(row: GeoEvent): number {
  // Prefer an internally complete, city-bearing estimate to a country-only
  // one. For similar coverage, prefer an estimate without a flagged exit.
  const place =
    (value(row.city) ? 50 : 0) +
    (value(row.region) ? 12 : 0) +
    (value(row.country) ? 4 : 0) +
    (value(row.postal_code) ? 2 : 0);
  const risk = value(row.geo_reliability) === "low" || RISK_TYPES.has(value(row.network_type));
  return place + (!risk && place && row.geo_reliability === "medium" ? 5 : 0);
}

/**
 * Select ONE coherent row for a session. Equal-quality ties use the earliest
 * observed row so an IP/network change cannot silently rewrite the landing
 * location. A "medium" IP classification is not a measured GPS accuracy.
 */
export function pickCoherentSessionGeo<T extends GeoEvent>(rows: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  let bestTime = Infinity;
  for (const row of rows) {
    const score = placeScore(row);
    const ms = Date.parse(row.occurred_at ?? "");
    const time = Number.isFinite(ms) ? ms : Infinity;
    if (best === null || score > bestScore || (score === bestScore && time < bestTime)) {
      best = row;
      bestScore = score;
      bestTime = time;
    }
  }
  return best;
}

export type GeoQuality = "medium" | "low" | "unknown";
export function geoQuality(row: GeoEvent | null): GeoQuality {
  if (!row) return "unknown";
  if (row.geo_reliability === "low" || RISK_TYPES.has(value(row.network_type))) return "low";
  if (!value(row.city) && !value(row.region)) return "unknown";
  return row.geo_reliability === "medium" ? "medium" : "unknown";
}

export function summarizeGeoInsights(rows: readonly GeoEvent[]) {
  // Caller MUST pass human-qualified rows only. Never use all raw sessions for
  // the headline; excluded automation and internal/test are audited elsewhere.
  const bySession = new Map<string, GeoEvent[]>();
  for (const row of rows) {
    const sid = value(row.session_id);
    if (!sid) continue;
    const group = bySession.get(sid) ?? [];
    group.push(row);
    bySession.set(sid, group);
  }

  const quality = { medium: 0, low: 0, unknown: 0 };
  const providers = new Map<string, number>();
  const networks = new Map<string, number>();
  const cities = new Map<string, {
    name: string; sessions: number; pdfOpenSessions: number;
    medium: number; low: number; unknown: number;
    conflictingEstimateSessions: number;
  }>();
  let citySessions = 0;
  let postalSessions = 0;
  let countryOnlySessions = 0;
  let multiCityEstimateSessions = 0;
  let pdfOpenSessions = 0;

  for (const events of bySession.values()) {
    const chosen = pickCoherentSessionGeo(events);
    const confidence = geoQuality(chosen);
    quality[confidence] += 1;

    const provider = value(chosen?.geo_provider) || "unreported";
    providers.set(provider, (providers.get(provider) ?? 0) + 1);
    const network = value(chosen?.network_type) || "unknown";
    networks.set(network, (networks.get(network) ?? 0) + 1);

    const distinctCityEstimates = new Set(
      events.filter((r) => value(r.city))
        .map((r) => [norm(r.city), norm(r.country)].join("|")),
    );
    if (distinctCityEstimates.size >= 2) multiCityEstimateSessions += 1;

    const deliberateOpen = events.some((r) => isOpenPdfClick({
      event_name: r.event_name ?? null,
      metadata: r.metadata,
    }));
    if (deliberateOpen) pdfOpenSessions += 1;

    if (value(chosen?.postal_code)) postalSessions += 1;
    if (!value(chosen?.city) && !value(chosen?.region) && value(chosen?.country)) {
      countryOnlySessions += 1;
    }
    if (!value(chosen?.city)) continue;
    citySessions += 1;

    // City/region/country all come from the SAME observed estimate. Unknown
    // fields stay unknown rather than being borrowed from other events.
    const name = [chosen!.city, chosen!.region, chosen!.country].map(value).filter(Boolean).join(", ");
    const stat = cities.get(name) ?? {
      name, sessions: 0, pdfOpenSessions: 0,
      medium: 0, low: 0, unknown: 0,
      conflictingEstimateSessions: 0,
    };
    stat.sessions += 1;
    if (deliberateOpen) stat.pdfOpenSessions += 1;
    stat[confidence] += 1;
    if (distinctCityEstimates.size >= 2) stat.conflictingEstimateSessions += 1;
    cities.set(name, stat);
  }

  const breakdown = (m: Map<string, number>) =>
    [...m.entries()].map(([label, sessions]) => ({ label, sessions }))
      .sort((a,b) => b.sessions - a.sessions || a.label.localeCompare(b.label));

  // Keep the short overview while also making every observed city available
  // for the administrator's explicit location-quality review.
  const cityRows = [...cities.values()]
    .sort((a,b) => b.sessions - a.sessions || b.pdfOpenSessions - a.pdfOpenSessions || a.name.localeCompare(b.name));

  return {
    sessions: bySession.size,
    citySessions,
    postalSessions,
    countryOnlySessions,
    quality,
    pdfOpenSessions,
    multiCityEstimateSessions,
    networkTypes: breakdown(networks),
    providers: breakdown(providers),
    topCities: cityRows.slice(0, 20),
    reviewCities: cityRows,
  };
}
