import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { readingSlug, isYomTovReading } from "@/lib/reading-page";
import { publicationSlug } from "@/lib/publication-slug";
import { standardizeCopy } from "@/lib/standardize-copy";
import { formatReadingLabel } from "@/lib/parshiyos";

export type ReadingResource = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  summary_quick: string | null;
  audience: string | null;
  format_type: string | null;
  content_type: string | null;
  page_count: number | null;
  badge: string | null;
  parsha_key: string;
  jewish_year: number;
  publication_id: string | null;
  publication_name: string | null;
  publication_slug: string | null;
  publisher: string | null;
};

export type ReadingCollectionSummary = {
  parsha_key: string;
  jewish_year: number;
  slug: string;
  kind: "parsha" | "yom-tov";
  label: string;
  count: number;
};

export const listReadingCollections = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ collections: ReadingCollectionSummary[] }> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("pdfs")
      .select("parsha_key, jewish_year")
      .eq("published", true)
      .not("jewish_year", "is", null);

    if (error) {
      console.error("listReadingCollections error", error);
      return { collections: [] };
    }

    const map = new Map<string, ReadingCollectionSummary>();
    for (const row of data ?? []) {
      const key = (row.parsha_key as string | null)?.trim();
      const year = row.jewish_year as number | null;
      if (!key || !year) continue;
      const slug = readingSlug(key);
      const mapKey = `${year}:${slug}`;
      const existing = map.get(mapKey);
      if (existing) {
        existing.count += 1;
      } else {
        const yomTov = isYomTovReading(key);
        map.set(mapKey, {
          parsha_key: key,
          jewish_year: year,
          slug,
          kind: yomTov ? "yom-tov" : "parsha",
          label: formatReadingLabel(key),
          count: 1,
        });
      }
    }

    return {
      collections: [...map.values()].sort((a, b) => {
        if (a.jewish_year !== b.jewish_year) return b.jewish_year - a.jewish_year;
        return a.label.localeCompare(b.label);
      }),
    };
  },
);

export const getReadingCollection = createServerFn({ method: "GET" })
  .inputValidator((input: { kind: "parsha" | "yom-tov"; slug: string; year: number }) =>
    z
      .object({
        kind: z.enum(["parsha", "yom-tov"]),
        slug: z.string().trim().min(1).max(160),
        year: z.number().int().min(5000).max(7000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();

    const { data: candidates, error: candidateError } = await admin
      .from("pdfs")
      .select("parsha_key")
      .eq("published", true)
      .eq("jewish_year", data.year);

    if (candidateError) {
      console.error("getReadingCollection candidates error", candidateError);
      return { collection: null, resources: [] as ReadingResource[] };
    }

    const parshaKey = [...new Set((candidates ?? []).map((r) => r.parsha_key as string))].find(
      (key) =>
        readingSlug(key) === data.slug &&
        (isYomTovReading(key) ? "yom-tov" : "parsha") === data.kind,
    );
    if (!parshaKey) {
      return { collection: null, resources: [] as ReadingResource[] };
    }

    const { data: rows, error: rowsError } = await admin
      .from("pdfs")
      .select(
        "id, title, subtitle, description, summary_quick, audience, format_type, content_type, page_count, badge, parsha_key, jewish_year, publication, publication_id, created_at",
      )
      .eq("published", true)
      .eq("jewish_year", data.year)
      .eq("parsha_key", parshaKey)
      .order("created_at", { ascending: true });

    if (rowsError) {
      console.error("getReadingCollection rows error", rowsError);
      return { collection: null, resources: [] as ReadingResource[] };
    }

    const publicationIds = [...new Set(
      (rows ?? [])
        .map((r) => r.publication_id as string | null)
        .filter((id): id is string => Boolean(id)),
    )];

    const publicationMap = new Map<
      string,
      { name: string; publisher: string | null; slug: string }
    >();
    if (publicationIds.length > 0) {
      const { data: pubs } = await admin
        .from("publications")
        .select("id, name, publisher")
        .in("id", publicationIds);
      for (const p of pubs ?? []) {
        publicationMap.set(p.id as string, {
          name: p.name as string,
          publisher: (p.publisher as string | null) ?? null,
          slug: publicationSlug(p.name as string),
        });
      }
    }

    const resources: ReadingResource[] = (rows ?? []).map((r) => {
      const pubId = (r.publication_id as string | null) ?? null;
      const canonical = pubId ? publicationMap.get(pubId) : undefined;
      const fallbackPublication = (r.publication as string | null) ?? null;
      return {
        id: r.id as string,
        title: r.title as string,
        subtitle: standardizeCopy((r.subtitle as string | null) ?? null),
        description: standardizeCopy((r.description as string | null) ?? null),
        summary_quick: standardizeCopy((r.summary_quick as string | null) ?? null),
        audience: (r.audience as string | null) ?? null,
        format_type: (r.format_type as string | null) ?? null,
        content_type: (r.content_type as string | null) ?? null,
        page_count: typeof r.page_count === "number" ? r.page_count : null,
        badge: (r.badge as string | null) ?? null,
        parsha_key: r.parsha_key as string,
        jewish_year: r.jewish_year as number,
        publication_id: pubId,
        publication_name: canonical?.name ?? fallbackPublication,
        publication_slug: canonical?.slug ?? null,
        publisher: canonical?.publisher ?? null,
      };
    });

    return {
      collection: {
        parsha_key: parshaKey,
        jewish_year: data.year,
        slug: data.slug,
        kind: data.kind,
        label: formatReadingLabel(parshaKey),
        count: resources.length,
      } as ReadingCollectionSummary,
      resources,
    };
  });
