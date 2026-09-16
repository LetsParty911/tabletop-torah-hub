import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { publicationSlug } from "@/lib/publication-slug";
import { standardizeCopy } from "@/lib/standardize-copy";

export type PublicationEdition = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  badge: string | null;
  parsha_key: string;
  jewish_year: number | null;
  created_at: string | null;
};

export type PublicationPageSummary = {
  id: string;
  name: string;
  slug: string;
  publisher: string | null;
  default_audience: string | null;
  default_format_type: string | null;
  default_description: string | null;
  edition_count: number;
};

export const listPublicationPages = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publications: PublicationPageSummary[] }> => {
    const admin = getSupabaseAdmin();
    const { data: pubs, error } = await admin
      .from("publications")
      .select("id, name, publisher, default_audience, default_format_type, default_description, active, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("listPublicationPages publications error", error);
      return { publications: [] };
    }

    const { data: rows, error: rowsError } = await admin
      .from("pdfs")
      .select("publication_id")
      .eq("published", true)
      .not("publication_id", "is", null);

    if (rowsError) {
      console.error("listPublicationPages pdfs error", rowsError);
    }

    const counts = new Map<string, number>();
    for (const row of rows ?? []) {
      const id = row.publication_id as string | null;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return {
      publications: (pubs ?? [])
        .map((p) => ({
          id: p.id as string,
          name: p.name as string,
          slug: publicationSlug(p.name as string),
          publisher: (p.publisher as string | null) ?? null,
          default_audience: (p.default_audience as string | null) ?? null,
          default_format_type: (p.default_format_type as string | null) ?? null,
          default_description: standardizeCopy((p.default_description as string | null) ?? null),
          edition_count: counts.get(p.id as string) ?? 0,
        }))
        .filter((p) => p.edition_count > 0),
    };
  },
);

export const getPublicationPage = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().trim().min(1).max(160) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: pubs, error } = await admin
      .from("publications")
      .select("id, name, publisher, default_audience, default_format_type, default_description, active")
      .eq("active", true);

    if (error) {
      console.error("getPublicationPage publications error", error);
      return { publication: null, editions: [] as PublicationEdition[] };
    }

    const publication = (pubs ?? []).find(
      (p) => publicationSlug(p.name as string) === data.slug,
    );
    if (!publication) {
      return { publication: null, editions: [] as PublicationEdition[] };
    }

    const { data: rows, error: rowsError } = await admin
      .from("pdfs")
      .select("id, title, subtitle, description, audience, format_type, page_count, badge, parsha_key, jewish_year, created_at")
      .eq("published", true)
      .eq("publication_id", publication.id)
      .order("jewish_year", { ascending: false })
      .order("created_at", { ascending: false });

    if (rowsError) {
      console.error("getPublicationPage pdfs error", rowsError);
      return { publication: null, editions: [] as PublicationEdition[] };
    }

    return {
      publication: {
        id: publication.id as string,
        name: publication.name as string,
        slug: publicationSlug(publication.name as string),
        publisher: (publication.publisher as string | null) ?? null,
        default_audience: (publication.default_audience as string | null) ?? null,
        default_format_type: (publication.default_format_type as string | null) ?? null,
        default_description: standardizeCopy(
          (publication.default_description as string | null) ?? null,
        ),
      },
      editions: (rows ?? []).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        subtitle: standardizeCopy((r.subtitle as string | null) ?? null),
        description: standardizeCopy((r.description as string | null) ?? null),
        audience: (r.audience as string | null) ?? null,
        format_type: (r.format_type as string | null) ?? null,
        page_count: typeof r.page_count === "number" ? r.page_count : null,
        badge: (r.badge as string | null) ?? null,
        parsha_key: r.parsha_key as string,
        jewish_year: typeof r.jewish_year === "number" ? r.jewish_year : null,
        created_at: (r.created_at as string | null) ?? null,
      })) as PublicationEdition[],
    };
  });
