import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { standardizeCopy } from "@/lib/standardize-copy";
import { publicationLabel, PUBLICATION_LABELS } from "@/lib/badges";
import { readingChronoIndex } from "@/lib/parshiyos";
import { normalizeAudience, type AudienceKey } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";

export type ArchivePdfAll = {
  id: string;
  title: string;
  publisher: string | null;
  publication: string | null;
  subtitle: string | null;
  description: string | null;
  audience: string | null;
  format_type: string | null;
  content_type: string | null;
  page_count: number | null;
  badge: string | null;
};

export type ArchiveParshaAll = { parshaKey: string; pdfs: ArchivePdfAll[] };
export type ArchiveYearAll = { year: number; parshiyos: ArchiveParshaAll[] };

export type ArchivePageInput = {
  year: string;
  parsha: string;
  audience: "All" | AudienceKey;
  q: string;
  length: "All" | "short" | "long" | "study";
  type: string;
  pub: string;
  page: number;
};

export type ArchivePageResult = {
  years: ArchiveYearAll[];
  yearOptions: number[];
  allParshiyos: string[];
  typeOptions: string[];
  publicationOptions: string[];
  audienceCounts: Record<"All" | AudienceKey, number>;
  totalPdfs: number;
  totalPages: number;
  safePage: number;
  archiveTotal: number;
};

const PAGE_SIZE = 48;

const inputSchema = z.object({
  year: z.string().max(10),
  parsha: z.string().max(60),
  audience: z.enum(["All", "Children", "Families", "Adults"]),
  q: z.string().max(100),
  length: z.enum(["All", "short", "long", "study"]),
  type: z.string().max(60),
  pub: z.string().max(120),
  page: z.number().int().min(1).max(999),
});

function resourceType(r: ArchivePdfAll): string | null {
  return r.content_type === "Questions & Answers"
    ? "Questions & Answers"
    : formatTypeLabel(r.format_type);
}

function matchesLength(r: ArchivePdfAll, length: ArchivePageInput["length"]) {
  if (length === "All") return true;
  if (typeof r.page_count !== "number") return false;
  if (length === "short") return r.page_count < 5;
  if (length === "study") return r.page_count >= 20;
  return r.page_count >= 5;
}

function canonicalPub(r: ArchivePdfAll): string | null {
  const p = r.publication?.trim();
  return p ? p : null;
}

export const listArchiveAll = createServerFn({ method: "GET" })
  .inputValidator((input: ArchivePageInput) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();

    const { data: rows, error } = await admin
      .from("pdfs")
      .select(
        "id, title, subtitle, parsha_key, jewish_year, created_at, description, audience, format_type, content_type, page_count, badge, publication, publication_id",
      )
      .eq("published", true)
      .order("jewish_year", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listArchiveAll pdfs error", error);
      return {
        years: [] as ArchiveYearAll[],
        yearOptions: [] as number[],
        allParshiyos: [] as string[],
        typeOptions: [] as string[],
        publicationOptions: [] as string[],
        audienceCounts: { All: 0, Children: 0, Families: 0, Adults: 0 },
        totalPdfs: 0,
        totalPages: 1,
        safePage: 1,
        archiveTotal: 0,
      } satisfies ArchivePageResult;
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

    type InternalPdf = ArchivePdfAll & {
      year: number;
      parshaKey: string;
      created_at: string;
      sort_order: number;
    };

    const all: InternalPdf[] = [];
    for (const row of rows ?? []) {
      const year = typeof row.jewish_year === "number" ? row.jewish_year : 0;
      const parshaKey = (row.parsha_key as string | null)?.trim();
      if (!year || !parshaKey) continue;

      const canonical = row.publication_id
        ? pubMap.get(row.publication_id as string)
        : undefined;

      all.push({
        id: row.id as string,
        title: canonical?.name ?? (row.title as string),
        publisher: canonical?.publisher ?? null,
        publication:
          canonical?.name ??
          (row.publication && PUBLICATION_LABELS[row.publication as string]
            ? publicationLabel(row.publication as string)
            : null),
        subtitle: standardizeCopy((row.subtitle as string | null) ?? null),
        description: standardizeCopy((row.description as string | null) ?? null),
        audience: (row.audience as string | null) ?? null,
        format_type: (row.format_type as string | null) ?? null,
        content_type: (row.content_type as string | null) ?? null,
        page_count: typeof row.page_count === "number" ? row.page_count : null,
        badge: (row.badge as string | null) ?? null,
        year,
        parshaKey,
        created_at: (row.created_at as string | null) ?? "",
        sort_order: canonical?.sort_order ?? 999999,
      });
    }

    const archiveTotal = all.length;
    const yearOptions = Array.from(new Set(all.map((r) => r.year))).sort((a, b) => b - a);
    const allParshiyos = Array.from(new Set(all.map((r) => r.parshaKey))).sort();
    const typeOptions = Array.from(
      new Set(all.map((r) => resourceType(r)).filter((v): v is string => !!v)),
    ).sort((a, b) => a.localeCompare(b));
    const publicationOptions = Array.from(
      new Set(all.map((r) => canonicalPub(r)).filter((v): v is string => !!v)),
    ).sort((a, b) => a.localeCompare(b));

    const q = data.q.trim().toLowerCase();
    const baseMatches = (r: InternalPdf, includeAudience: boolean) => {
      if (data.year !== "all" && String(r.year) !== data.year) return false;
      if (data.parsha !== "all" && r.parshaKey !== data.parsha) return false;
      if (
        q &&
        ![r.title, r.publication, r.publisher, r.subtitle, r.description]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q))
      ) return false;
      if (!matchesLength(r, data.length)) return false;
      if (data.type !== "All" && resourceType(r) !== data.type) return false;
      if (data.pub !== "All" && canonicalPub(r) !== data.pub) return false;
      if (
        includeAudience &&
        data.audience !== "All" &&
        normalizeAudience(r.audience, r.title) !== data.audience
      ) return false;
      return true;
    };

    const audienceCounts: Record<"All" | AudienceKey, number> = {
      All: 0,
      Children: 0,
      Families: 0,
      Adults: 0,
    };
    for (const r of all) {
      if (!baseMatches(r, false)) continue;
      audienceCounts.All += 1;
      const audience = normalizeAudience(r.audience, r.title);
      if (audience) audienceCounts[audience] += 1;
    }

    const filtered = all.filter((r) => baseMatches(r, true));

    filtered.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      const ia = readingChronoIndex(a.parshaKey);
      const ib = readingChronoIndex(b.parshaKey);
      if (ia >= 0 && ib >= 0 && ia !== ib) return ib - ia;
      if (ia >= 0 && ib < 0) return -1;
      if (ib >= 0 && ia < 0) return 1;
      if (a.parshaKey !== b.parshaKey) {
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
        return a.parshaKey.localeCompare(b.parshaKey);
      }
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.title.localeCompare(b.title);
    });

    const totalPdfs = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalPdfs / PAGE_SIZE));
    const safePage = Math.min(data.page, totalPages);
    const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const yearMap = new Map<number, Map<string, ArchivePdfAll[]>>();
    for (const row of pageRows) {
      if (!yearMap.has(row.year)) yearMap.set(row.year, new Map());
      const parshaMap = yearMap.get(row.year)!;
      if (!parshaMap.has(row.parshaKey)) parshaMap.set(row.parshaKey, []);
      const {
        year: _year,
        parshaKey: _parsha,
        created_at: _created,
        sort_order: _sort,
        ...pdf
      } = row;
      parshaMap.get(row.parshaKey)!.push(pdf);
    }

    const years: ArchiveYearAll[] = Array.from(yearMap.entries()).map(([year, parshaMap]) => ({
      year,
      parshiyos: Array.from(parshaMap.entries()).map(([parshaKey, pdfs]) => ({
        parshaKey,
        pdfs,
      })),
    }));

    return {
      years,
      yearOptions,
      allParshiyos,
      typeOptions,
      publicationOptions,
      audienceCounts,
      totalPdfs,
      totalPages,
      safePage,
      archiveTotal,
    } satisfies ArchivePageResult;
  });
