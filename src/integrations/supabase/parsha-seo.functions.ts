import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { PARSHIYOS, formatReadingLabel } from "@/lib/parshiyos";
import { readingSlug, isYomTovReading } from "@/lib/reading-page";
import { toParshaComparableKey } from "@/lib/parsha-normalize";
import { summarizeReadingLibrary } from "@/lib/reading-library";
import { normalizeAudience } from "@/lib/audience";
import { tfttOriginalSeriesById, originalDescriptionFallback } from "@/lib/tftt-originals";
import { standardizeCopy } from "@/lib/standardize-copy";
import { renameLegacySeriesText } from "@/lib/tftt-originals";

export type ParshaSeoResource = {
  id: string;
  title: string;
  description: string | null;
  summary_quick: string | null;
  audience: string | null;
  format_type: string | null;
  content_type: string | null;
  page_count: number | null;
  jewish_year: number | null;
};

export type ParshaSeoPage = {
  parsha_key: string;
  slug: string;
  label: string;
  total_count: number;
  years: Array<{ year: number; count: number }>;
  resources: ParshaSeoResource[];
  audience_counts: Record<string, number>;
  type_counts: Record<string, number>;
};

function canonicalParshaForSlug(slug: string): string | null {
  return PARSHIYOS.find((name) => !isYomTovReading(name) && readingSlug(name) === slug) ?? null;
}

export const getParshaSeoPage = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<ParshaSeoPage | null> => {
    const canonical = canonicalParshaForSlug(data.slug);
    if (!canonical) return null;

    const admin = getSupabaseAdmin();
    const { data: candidates, error: candidateError } = await admin.from("pdfs").select("parsha_key").eq("published", true).not("jewish_year", "is", null);
    if (candidateError) throw new Error("Unable to load publication readings");
    const aliases = Array.from(new Set<string>(((candidates ?? []) as Array<{ parsha_key: string | null }>).map(row => row.parsha_key).filter((key): key is string => typeof key === "string" && toParshaComparableKey(key) === toParshaComparableKey(canonical))));
    const { data: rows, error } = await admin
      .from("pdfs")
      .select(
        "id, title, description, summary_quick, audience, format_type, content_type, page_count, jewish_year, parsha_key, created_at, publication_id",
      )
      .eq("published", true)
      .in("parsha_key", aliases.length ? aliases : [canonical])
      .not("jewish_year", "is", null)
      .order("jewish_year", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("getParshaSeoPage error", error);
      return {
        parsha_key: canonical,
        slug: data.slug,
        label: formatReadingLabel(canonical),
        total_count: 0,
        years: [],
        resources: [],
        audience_counts: {},
        type_counts: {},
      };
    }

    const matches = rows ?? [];

    const yearCounts = new Map<number, number>();
    for (const row of matches) {
      const year = row.jewish_year as number | null;
      if (year) yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
    }

    const years = [...yearCounts.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);

    const audience_counts: Record<string, number> = {};
    const type_counts: Record<string, number> = {};
    for (const row of matches) {
      const audience = normalizeAudience(row.audience ?? null, row.title, row.publication_id) ?? String(row.audience ?? "").trim();
      if (audience) audience_counts[audience] = (audience_counts[audience] ?? 0) + 1;
      const type = String(
        (row as any).content_type === "Questions & Answers"
          ? (row as any).content_type
          : (row as any).format_type ?? (row as any).content_type ?? "",
      ).trim();
      if (type) type_counts[type] = (type_counts[type] ?? 0) + 1;
    }

    const resources: ParshaSeoResource[] = matches.map((row: any) => ({
      id: row.id as string,
      title: tfttOriginalSeriesById(row.publication_id)?.title ?? renameLegacySeriesText(row.title as string),
      description: originalDescriptionFallback(row.publication_id, renameLegacySeriesText(standardizeCopy((row.description as string | null) ?? null))),
      summary_quick: renameLegacySeriesText(standardizeCopy((row.summary_quick as string | null) ?? null)),
      audience: normalizeAudience(row.audience ?? null, row.title, row.publication_id) ?? row.audience ?? null,
      format_type: (row.format_type as string | null) ?? null,
      content_type: (row.content_type as string | null) ?? null,
      page_count: typeof row.page_count === "number" ? row.page_count : null,
      jewish_year: (row.jewish_year as number | null) ?? null,
    }));

    return {
      parsha_key: canonical,
      slug: data.slug,
      label: formatReadingLabel(canonical),
      total_count: matches.length,
      years,
      resources,
      audience_counts,
      type_counts,
    };
  });

export const listParshaSeoSummaries = createServerFn({ method: "GET" }).handler(
  async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("pdfs")
      .select("parsha_key, jewish_year")
      .eq("published", true);

    if (error) { console.error("listParshaSeoSummaries error", error); throw new Error("Unable to load the reading library"); }
    return summarizeReadingLibrary(data ?? []);
  },
);
