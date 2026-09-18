// Guided homepage chooser: "What would you like for your Shabbos table?"
//
// Pure selection + copy helpers so the homepage stays presentational and the
// logic stays testable. No hardcoded publication ids — everything is derived
// from the existing resource metadata.

import { normalizeAudience } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";

export type ChooserResource = {
  id: string;
  title: string;
  publisher: string | null;
  subtitle: string | null;
  summary_quick: string | null;
  content_type: string | null;
  primary_category: string | null;
  publication: string | null;
  tags: string[];
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  featured_slot: string | null;
};

export type ChooserKey = "quick" | "kids" | "family" | "story" | "deeper";

export const CHOOSERS: ReadonlyArray<{
  key: ChooserKey;
  label: string;
  blurb: string;
  /** featured_slot value preferred for this chooser, when curated. */
  featuredSlot: string | null;
}> = [
  { key: "quick", label: "Quick Vort", blurb: "Something I can read and share in a few minutes.", featuredSlot: "quickest" },
  { key: "kids", label: "For the Kids", blurb: "Questions, stories and Torah children can participate in.", featuredSlot: "children" },
  { key: "family", label: "Family Table", blurb: "Something everyone around the table can enjoy.", featuredSlot: "family" },
  { key: "story", label: "A Good Story", blurb: "A memorable story to share at the meal.", featuredSlot: null },
  { key: "deeper", label: "Deeper Learning", blurb: "Something more substantial for adults.", featuredSlot: "deeper" },
];

function haystack(r: ChooserResource): string {
  return [
    r.title,
    r.subtitle,
    r.description,
    r.summary_quick,
    r.content_type,
    r.format_type,
    r.primary_category,
    r.publication,
    ...(r.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function score(r: ChooserResource, key: ChooserKey): number {
  const text = haystack(r);
  const audience = normalizeAudience(r.audience, r.title);
  const pages = typeof r.page_count === "number" ? r.page_count : null;
  const slot = (r.featured_slot ?? "").trim().toLowerCase();
  const chooser = CHOOSERS.find((c) => c.key === key);
  let s = 0;

  if (chooser?.featuredSlot && slot === chooser.featuredSlot) s += 60;

  switch (key) {
    case "quick":
      if (pages !== null) s += pages <= 2 ? 40 : pages <= 4 ? 28 : pages <= 8 ? 10 : 0;
      if (/vort|short|brief insight|quick/.test(text)) s += 25;
      if (/long study|in depth|in-depth/.test(text)) s -= 20;
      break;
    case "kids":
      if (audience === "Children") s += 45;
      if (/child|kid|question|quiz|game|story/.test(text)) s += 20;
      if (audience === "Adults") s -= 25;
      break;
    case "family":
      if (audience === "Families") s += 45;
      if (/family|table|all ages|everyone/.test(text)) s += 18;
      break;
    case "story":
      if (/stor(y|ies)|mashal|maaseh|tale/.test(text)) s += 45;
      if (audience === "Families" || audience === "Children") s += 10;
      break;
    case "deeper":
      if (audience === "Adults") s += 35;
      if (/depth|iyun|analysis|essay|shiur|halach|machshav|study/.test(text)) s += 22;
      if (pages !== null && pages >= 8) s += 18;
      if (pages !== null && pages <= 2) s -= 15;
      break;
  }
  return s;
}

/** Up to `limit` current-week resources matching the chosen intent. */
export function pickRecommendations<T extends ChooserResource>(
  resources: readonly T[],
  key: ChooserKey,
  limit = 3,
): T[] {
  return resources
    .map((r, index) => ({ r, index, s: score(r, key) }))
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .filter((entry, i) => entry.s > 0 || i < limit)
    .slice(0, limit)
    .map((entry) => entry.r);
}

/**
 * One concise, user-facing sentence explaining why this piece might suit the
 * table. Prefers real editorial copy before any generic fallback.
 */
export function chooseReason(r: ChooserResource): string {
  const quick = r.summary_quick?.trim();
  if (quick) return quick;
  const description = r.description?.trim();
  if (description) return description;

  const text = haystack(r);
  const audience = normalizeAudience(r.audience, r.title);
  const pages = typeof r.page_count === "number" ? r.page_count : null;

  if (audience === "Children" || /question|child|kid/.test(text))
    return "Questions that make it easy to get children participating at the table.";
  if (/stor(y|ies)|maaseh|mashal/.test(text))
    return "A memorable story to share around the family table.";
  if ((pages !== null && pages <= 2) || /vort|short|brief insight/.test(text))
    return "A short piece you can read and share in just a few minutes.";
  if (audience === "Adults" || (pages !== null && pages >= 8))
    return "A more substantial piece for deeper Shabbos learning.";
  return "A handpicked Dvar Torah for this week's Shabbos table.";
}

/** Compact "Children · Brief Insights · 3 pages" style meta line. */
export function chooserMetaLine(r: ChooserResource): string | null {
  const parts = [
    normalizeAudience(r.audience, r.title) ?? r.audience,
    formatTypeLabel(r.format_type) ?? formatTypeLabel(r.content_type),
    typeof r.page_count === "number" ? `${r.page_count} ${r.page_count === 1 ? "page" : "pages"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
