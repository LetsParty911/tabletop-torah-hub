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
  content_type: string | null;
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
      .select("id, title, parsha_key, jewish_year, description, audience, format_type, content_type, page_count, created_at")
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
      related: (rows ?? []).map((row: any) => ({
        id: row.id as string,
        title: row.title as string,
        parsha_key: row.parsha_key as string,
        jewish_year: typeof row.jewish_year === "number" ? row.jewish_year : null,
        description: standardizeCopy((row.description as string | null) ?? null),
        audience: (row.audience as string | null) ?? null,
        format_type: (row.format_type as string | null) ?? null,
        content_type: (row.content_type as string | null) ?? null,
        page_count: typeof row.page_count === "number" ? row.page_count : null,
      })) as RelatedEdition[],
    };
  });


export type RelatedParshaItem = {
  id: string;
  title: string;
  parsha_key: string;
  jewish_year: number | null;
  description: string | null;
  audience: string | null;
  format_type: string | null;
  content_type: string | null;
  page_count: number | null;
};

export const getRelatedParshaItems = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<RelatedParshaItem[]> => {
    const admin = getSupabaseAdmin();
    const { data: current, error: currentError } = await admin
      .from("pdfs")
      .select("parsha_key, jewish_year")
      .eq("id", data.id)
      .eq("published", true)
      .maybeSingle();

    if (currentError || !current?.parsha_key) return [];

    let query = admin
      .from("pdfs")
      .select("id, title, parsha_key, jewish_year, description, audience, format_type, content_type, page_count, created_at")
      .eq("published", true)
      .eq("parsha_key", current.parsha_key)
      .neq("id", data.id)
      .order("jewish_year", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4);

    if (typeof current.jewish_year === "number") {
      query = query.eq("jewish_year", current.jewish_year);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("getRelatedParshaItems error", error);
      return [];
    }

    return (rows ?? []).map((row: any) => ({
      id: row.id as string,
      title: row.title as string,
      parsha_key: row.parsha_key as string,
      jewish_year: typeof row.jewish_year === "number" ? row.jewish_year : null,
      description: standardizeCopy((row.description as string | null) ?? null),
      audience: (row.audience as string | null) ?? null,
      format_type: (row.format_type as string | null) ?? null,
      content_type: (row.content_type as string | null) ?? null,
      page_count: typeof row.page_count === "number" ? row.page_count : null,
    }));
  });


export type OriginalHtmlContent = {
  text: string;
  extracted: boolean;
};

const TFTT_ORIGINAL_PUBLICATION_IDS = new Set([
  "0fa3db5f-c153-4311-a007-415c3c022143",
  "88719788-42fb-4e0b-a34b-3ea1868e750d",
]);

export const getOriginalHtmlContent = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<OriginalHtmlContent | null> => {
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin
      .from("pdfs")
      .select("file_path, publication, publication_id")
      .eq("id", data.id)
      .eq("published", true)
      .maybeSingle();

    if (error || !row?.file_path) return null;
    const isOriginal =
      row.publication === "tftt_original" ||
      (row.publication_id && TFTT_ORIGINAL_PUBLICATION_IDS.has(row.publication_id as string));
    if (!isOriginal) return null;

    try {
      const { data: file, error: downloadError } = await admin.storage
        .from("pdfs")
        .download(row.file_path as string);
      if (downloadError || !file) return null;

      const bytes = Buffer.from(await file.arrayBuffer());
      const { default: pdfParse } = await import("pdf-parse");
      const parsed = await pdfParse(bytes);
      const text = String(parsed.text ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (text.length < 80) return null;
      return { text, extracted: true };
    } catch (e) {
      console.error("getOriginalHtmlContent extraction error", e);
      return null;
    }
  });
