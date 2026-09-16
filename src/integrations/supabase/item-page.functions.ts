import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { publicationSlug } from "@/lib/publication-slug";
import { standardizeCopy } from "@/lib/standardize-copy";

export type ItemPublicationContext = {
  id: string;
  name: string;
  slug: string;
  publisher: string | null;
};

export type RelatedEdition = {
  id: string;
  title: string;
  parsha_key: string;
  jewish_year: number | null;
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
};

export const getItemPublicationContext = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{
    publication: ItemPublicationContext | null;
    related: RelatedEdition[];
  }> => {
    const admin = getSupabaseAdmin();

    const { data: link, error: linkError } = await admin
      .from("pdfs")
      .select("publication_id")
      .eq("id", data.id)
      .eq("published", true)
      .maybeSingle();

    if (linkError || !link?.publication_id) {
      return { publication: null, related: [] };
    }

    const { data: publication, error: publicationError } = await admin
      .from("publications")
      .select("id, name, publisher, active")
      .eq("id", link.publication_id)
      .maybeSingle();

    if (publicationError || !publication || publication.active === false) {
      return { publication: null, related: [] };
    }

    const { data: rows, error: rowsError } = await admin
      .from("pdfs")
      .select("id, title, parsha_key, jewish_year, description, audience, format_type, page_count, created_at")
      .eq("published", true)
      .eq("publication_id", publication.id)
      .neq("id", data.id)
      .order("jewish_year", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4);

    if (rowsError) {
      console.error("getItemPublicationContext related editions error", rowsError);
    }

    return {
      publication: {
        id: publication.id as string,
        name: publication.name as string,
        slug: publicationSlug(publication.name as string),
        publisher: (publication.publisher as string | null) ?? null,
      },
      related: (rows ?? []).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        parsha_key: row.parsha_key as string,
        jewish_year: typeof row.jewish_year === "number" ? row.jewish_year : null,
        description: standardizeCopy((row.description as string | null) ?? null),
        audience: (row.audience as string | null) ?? null,
        format_type: (row.format_type as string | null) ?? null,
        page_count: typeof row.page_count === "number" ? row.page_count : null,
      })) as RelatedEdition[],
    };
  });
