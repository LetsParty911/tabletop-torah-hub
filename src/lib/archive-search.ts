import type { AudienceKey } from "@/lib/audience";
import type { LengthFilter } from "@/lib/length-filter";

/**
 * Archive URL state. Pure helpers shared by the /archive route and its tests.
 *
 * Numeric-looking values (Jewish year, page) are emitted as numbers so the
 * router's JSON search serialization writes `?year=5786` rather than
 * `?year=%225786%22`; the quoted form forced an extra SSR redirect on reload
 * and produced unfriendly shared links.
 */
export type ArchiveSearch = {
  year?: string | number;
  parsha?: string;
  audience?: "All" | AudienceKey;
  q?: string;
  length?: LengthFilter;
  type?: string;
  pub?: string;
  page?: number;
};

export type ResolvedArchiveSearch = {
  year: string;
  parsha: string;
  audience: "All" | AudienceKey;
  q: string;
  length: LengthFilter;
  type: string;
  pub: string;
  page: number;
};

const AUDIENCE_VALUES = ["All", "Children", "Families", "Adults"] as const;
const LENGTH_VALUES = ["All", "short", "medium", "long", "study"] as const;

/** Lenient parsing: any unexpected value falls back to the default. */
export function parseArchiveSearch(input: Record<string, unknown>): ResolvedArchiveSearch {
  const str = (v: unknown) =>
    typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  const audience = str(input["audience"]);
  const length = str(input["length"]);
  return {
    year: str(input["year"]).slice(0, 10) || "all",
    parsha: str(input["parsha"]).slice(0, 60) || "all",
    audience: (AUDIENCE_VALUES as readonly string[]).includes(audience)
      ? (audience as ResolvedArchiveSearch["audience"])
      : "All",
    q: str(input["q"]).slice(0, 100),
    length: (LENGTH_VALUES as readonly string[]).includes(length) ? (length as LengthFilter) : "All",
    type: str(input["type"]).slice(0, 60) || "All",
    pub: str(input["pub"]).slice(0, 120) || "All",
    page: Math.max(1, Math.min(999, Number.parseInt(str(input["page"]), 10) || 1)),
  };
}

/** URL form: defaults removed, numeric year as a number. */
export function stripArchiveDefaults(s: ResolvedArchiveSearch): ArchiveSearch {
  const out: ArchiveSearch = {};
  if (s.year !== "all") out.year = /^\d{1,6}$/.test(s.year) ? Number(s.year) : s.year;
  if (s.parsha !== "all") out.parsha = s.parsha;
  if (s.audience !== "All") out.audience = s.audience;
  if (s.q) out.q = s.q;
  if (s.length !== "All") out.length = s.length;
  if (s.type !== "All") out.type = s.type;
  if (s.pub !== "All") out.pub = s.pub;
  if (s.page > 1) out.page = s.page;
  return out;
}

/** Apply a filter change. Any change other than an explicit page resets to page 1. */
export function nextArchiveSearch(
  prev: Record<string, unknown>,
  patch: ArchiveSearch,
): ArchiveSearch {
  const withPage = Object.prototype.hasOwnProperty.call(patch, "page") ? patch : { ...patch, page: 1 };
  return stripArchiveDefaults(parseArchiveSearch({ ...prev, ...withPage }));
}

/** Count label for audience chips: archive items are Divrei Torah selections. */
export function selectionCountLabel(count: number): string {
  return `${count} ${count === 1 ? "selection" : "selections"}`;
}
