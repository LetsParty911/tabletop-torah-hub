import { originalDescriptionFallback } from "@/lib/tftt-originals";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { canonicalPublicationName, canonicalPublicationSlug, findPublicationBySlug } from "@/lib/publication-slug";
import { standardizeCopy } from "@/lib/standardize-copy";
import { renameLegacySeriesText } from "@/lib/tftt-originals";
import { pdfThumbUrl } from "@/integrations/supabase/api.functions";
import { readThumbnailInventory } from "@/lib/verified-thumbnails.server";

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
  thumb_url: string | null;
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
  thumb_url: string | null;
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
      .select("id, publication_id, created_at")
      .eq("published", true)
      .not("publication_id", "is", null);

    if (rowsError) {
      console.error("listPublicationPages pdfs error", rowsError);
    }

    const inventory = await readThumbnailInventory(admin);
    const counts = new Map<string, number>();
    const latest = new Map<string, { id: string; created_at: string }>();
    for (const row of rows ?? []) {
      const id = row.publication_id as string | null;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      const date = (row.created_at as string | null) ?? "";
      const prev = latest.get(id);
      if (!prev || date > prev.created_at) latest.set(id, { id: row.id as string, created_at: date });
    }

    return {
      publications: (pubs ?? [])
        .map((p: any) => ({
          id: p.id as string,
          name: canonicalPublicationName(p),
          slug: canonicalPublicationSlug(p),
          publisher: (p.publisher as string | null) ?? null,
          default_audience: (p.default_audience as string | null) ?? null,
          default_format_type: (p.default_format_type as string | null) ?? null,
          default_description: originalDescriptionFallback(p.id, renameLegacySeriesText(standardizeCopy((p.default_description as string | null) ?? null))),
          edition_count: counts.get(p.id as string) ?? 0,
          thumb_url: latest.get(p.id as string) ? pdfThumbUrl(latest.get(p.id as string)!.id, p.id as string, inventory.originalVersions.get(latest.get(p.id as string)!.id)) : null,
        }))
        .filter((p: any) => p.edition_count > 0),
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

    // The external client is not schema-typed. Preserve the selected row's
    // full metadata shape when passing it through the generic slug helper.
    type SelectedPublication = {
      id: string;
      name: string;
      publisher: string | null;
      default_audience: string | null;
      default_format_type: string | null;
      default_description: string | null;
      active: boolean;
    };
    const publication = findPublicationBySlug<SelectedPublication>(pubs ?? [], data.slug);
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

    const inventory = await readThumbnailInventory(admin);
    return {
      publication: {
        id: publication.id as string,
        name: canonicalPublicationName(publication),
        slug: canonicalPublicationSlug(publication),
        publisher: (publication.publisher as string | null) ?? null,
        default_audience: (publication.default_audience as string | null) ?? null,
        default_format_type: (publication.default_format_type as string | null) ?? null,
        default_description: originalDescriptionFallback(publication.id, renameLegacySeriesText(standardizeCopy(
          (publication.default_description as string | null) ?? null,
        ))),
      },
      editions: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        title: renameLegacySeriesText(r.title as string),
        subtitle: renameLegacySeriesText(standardizeCopy((r.subtitle as string | null) ?? null)),
        description: originalDescriptionFallback(publication.id, renameLegacySeriesText(standardizeCopy((r.description as string | null) ?? null))),
        audience: (r.audience as string | null) ?? null,
        format_type: (r.format_type as string | null) ?? null,
        page_count: typeof r.page_count === "number" ? r.page_count : null,
        badge: (r.badge as string | null) ?? null,
        parsha_key: r.parsha_key as string,
        jewish_year: typeof r.jewish_year === "number" ? r.jewish_year : null,
        created_at: (r.created_at as string | null) ?? null,
        thumb_url: pdfThumbUrl(r.id as string, publication.id as string, inventory.originalVersions.get(r.id as string)),
      })) as PublicationEdition[],
    };
  });
