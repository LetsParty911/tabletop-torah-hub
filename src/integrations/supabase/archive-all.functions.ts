import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { standardizeCopy } from "@/lib/standardize-copy";

export type ArchivePdfAll = {
  id: string;
  title: string;
  publisher: string | null;
  publication: string | null;
  subtitle: string | null;
  summary_quick: string | null;
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  badge: string | null;
};

export type ArchiveParshaAll = { parshaKey: string; pdfs: ArchivePdfAll[] };
export type ArchiveYearAll = { year: number; parshiyos: ArchiveParshaAll[] };

export const listArchiveAll = createServerFn({ method: "GET" }).handler(async () => {
  const admin = getSupabaseAdmin();

  const { data: rows, error } = await admin
    .from("pdfs")
    .select(
      "id, title, subtitle, summary_quick, parsha_key, jewish_year, created_at, description, audience, format_type, page_count, badge, publication, publication_id",
    )
    .eq("published", true)
    .order("jewish_year", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listArchiveAll pdfs error", error);
    return { years: [] as ArchiveYearAll[] };
  }

  const { data: pubs } = await admin
    .from("publications")
    .select("id, name, publisher, sort_order");

  const pubMap = new Map<string, { name: string; publisher: string | null; sort_order: number }>(
    (pubs ?? []).map((p: any) => [
      p.id as string,
      {
        name: p.name as string,
        publisher: (p.publisher as string | null) ?? null,
        sort_order: typeof p.sort_order === "number" ? p.sort_order : 999999,
      },
    ]),
  );

  const yearMap = new Map<
    number,
    Map<string, Array<ArchivePdfAll & { created_at: string; sort_order: number }>>
  >();

  for (const row of rows ?? []) {
    const year = typeof row.jewish_year === "number" ? row.jewish_year : 0;
    const parshaKey = (row.parsha_key as string | null)?.trim();
    if (!year || !parshaKey) continue;

    const canonical = row.publication_id
      ? pubMap.get(row.publication_id as string)
      : undefined;

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const parshaMap = yearMap.get(year)!;
    if (!parshaMap.has(parshaKey)) parshaMap.set(parshaKey, []);

    parshaMap.get(parshaKey)!.push({
      id: row.id as string,
      title: canonical?.name ?? (row.title as string),
      publisher: canonical?.publisher ?? null,
      publication:
        canonical?.name ?? ((row.publication as string | null) ?? null),
      subtitle: standardizeCopy((row.subtitle as string | null) ?? null),
      summary_quick: (row.summary_quick as string | null) ?? null,
      description: standardizeCopy((row.description as string | null) ?? null),
      audience: (row.audience as string | null) ?? null,
      format_type: (row.format_type as string | null) ?? null,
      page_count: typeof row.page_count === "number" ? row.page_count : null,
      badge: (row.badge as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? "",
      sort_order: canonical?.sort_order ?? 999999,
    });
  }

  const years: ArchiveYearAll[] = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, parshaMap]) => ({
      year,
      parshiyos: Array.from(parshaMap.entries())
        .map(([parshaKey, pdfs]) => {
          const latest = pdfs.reduce(
            (max, pdf) => (pdf.created_at > max ? pdf.created_at : max),
            pdfs[0]?.created_at ?? "",
          );
          const sorted = [...pdfs].sort((a, b) => {
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return a.title.localeCompare(b.title);
          });
          return {
            parshaKey,
            latest,
            pdfs: sorted.map(({ created_at: _created, sort_order: _sort, ...pdf }) => pdf),
          };
        })
        .sort((a, b) => (a.latest < b.latest ? 1 : -1))
        .map(({ parshaKey, pdfs }) => ({ parshaKey, pdfs })),
    }));

  return { years };
});
