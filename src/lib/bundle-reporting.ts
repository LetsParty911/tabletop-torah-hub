export const BUNDLE_NAMES = {
  children: "Children's Bundle",
  family: "Family Bundle",
  deeper: "Deeper Learning Bundle",
} as const;

type BundleEvent = {
  event_id?: string | null;
  event_name: string | null;
  occurred_at: string;
  session_id: string | null;
  visitor_id: string | null;
  source_group: string | null;
  parsha?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Receives only the existing report's human-qualified rows; never counts PDF events. */
export function summarizeBundleDownloads(rows: readonly BundleEvent[]) {
  const seen = new Set<string>();
  const actions = rows.flatMap((row) => {
    if (row.event_name !== "bundle_download") return [];
    const key = row.metadata?.['bundle_key'];
    if (key !== 'children' && key !== 'family' && key !== 'deeper') return [];
    const id = row.event_id;
    if (id && seen.has(id)) return [];
    if (id) seen.add(id);
    const rawYear = row.metadata?.['jewish_year'];
    return [{
      key, name: BUNDLE_NAMES[key], at: row.occurred_at,
      parsha: row.parsha ?? null,
      year: typeof rawYear === 'number' && Number.isInteger(rawYear) && rawYear > 0 ? rawYear : null,
      sessionId: row.session_id, visitorId: row.visitor_id,
      source: row.source_group ?? 'Direct',
    }];
  });
  return {
    bundles: Object.entries(BUNDLE_NAMES).map(([key, name]) => {
      const matching = actions.filter((action) => action.key === key);
      const editions = new Map<string, { parsha: string | null; year: number | null; count: number }>();
      matching.forEach((action) => {
        const editionKey = `${action.parsha ?? ''}:${action.year ?? ''}`;
        const edition = editions.get(editionKey) ?? { parsha: action.parsha, year: action.year, count: 0 };
        edition.count += 1;
        editions.set(editionKey, edition);
      });
      return { key, name, count: matching.length, editions: [...editions.values()] };
    }),
    actions: actions.sort((a, b) => b.at.localeCompare(a.at)),
  };
}