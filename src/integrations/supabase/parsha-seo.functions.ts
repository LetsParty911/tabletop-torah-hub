import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { PARSHIYOS_54, formatReadingLabel } from "@/lib/parshiyos";
import { readingSlug } from "@/lib/reading-page";
import { standardizeCopy } from "@/lib/standardize-copy";

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
  return PARSHIYOS_54.find((name) => readingSlug(name) === slug) ?? null;
}

export const getParshaSeoPage = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<ParshaSeoPage | null> => {
    const canonical = canonicalParshaForSlug(data.slug);
    if (!canonical) return null;

    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("pdfs")
      .select(
        "id, title, description, summary_quick, audience, format_type, content_type, page_count, jewish_year, parsha_key, created_at",
      )
      .eq("published", true)
      .eq("parsha_key", canonical)
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
      const audience = String((row as any).audience ?? "").trim();
      if (audience) audience_counts[audience] = (audience_counts[audience] ?? 0) + 1;
      const type = String(
        (row as any).content_type === "Questions & Answers"
          ? (row as any).content_type
          : (row as any).format_type ?? (row as any).content_type ?? "",
      ).trim();
      if (type) type_counts[type] = (type_counts[type] ?? 0) + 1;
    }

    const resources: ParshaSeoResource[] = matches.slice(0, 18).map((row: any) => ({
      id: row.id as string,
      title: row.title as string,
      description: standardizeCopy((row.description as string | null) ?? null),
      summary_quick: standardizeCopy((row.summary_quick as string | null) ?? null),
      audience: (row.audience as string | null) ?? null,
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
  async (): Promise<Array<{ parsha_key: string; slug: string; label: string; count: number; years: number[] }>> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("pdfs")
      .select("parsha_key, jewish_year")
      .eq("published", true);

    const counts = new Map<string, { count: number; years: Set<number> }>();
    if (!error) {
      for (const row of data ?? []) {
        const slug = readingSlug(String((row as any).parsha_key ?? ""));
        if (!PARSHIYOS_54.some((name) => readingSlug(name) === slug)) continue;
        const entry = counts.get(slug) ?? { count: 0, years: new Set<number>() };
        entry.count += 1;
        const year = (row as any).jewish_year as number | null;
        if (year) entry.years.add(year);
        counts.set(slug, entry);
      }
    } else {
      console.error("listParshaSeoSummaries error", error);
    }

    return PARSHIYOS_54.map((parsha_key) => {
      const slug = readingSlug(parsha_key);
      const entry = counts.get(slug);
      return {
        parsha_key,
        slug,
        label: formatReadingLabel(parsha_key),
        count: entry?.count ?? 0,
        years: [...(entry?.years ?? new Set<number>())].sort((a, b) => b - a),
      };
    });
  },
);
