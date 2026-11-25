import { AUDIENCE_OPTIONS, FORMAT_TYPE_OPTIONS } from "./pdf-constants";

type PublicationFields = {
  title?: string | null;
  parsha_key?: string | null;
  jewish_year?: number | null;
  audience?: string | null;
  format_type?: string | null;
  description?: string | null;
  page_count?: number | null;
};

function nonblank(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Drafts can be incomplete. Public PDFs must have the metadata that all
 * reader-facing listings actually use. The finer content_type is optional;
 * format_type supplies the shared public content classification. */
export function missingPublicationFields(
  row: PublicationFields,
  includeDerivedFields = true,
): string[] {
  const missing: string[] = [];
  if (!nonblank(row.title)) missing.push("title");
  if (!nonblank(row.parsha_key)) missing.push("parsha");
  if (includeDerivedFields &&
      !(typeof row.jewish_year === "number" && Number.isInteger(row.jewish_year) &&
        row.jewish_year >= 5000 && row.jewish_year <= 7000)) missing.push("Jewish year");
  if (!AUDIENCE_OPTIONS.some((value) => value === row.audience)) missing.push("audience");
  if (!FORMAT_TYPE_OPTIONS.some((value) => value === row.format_type)) missing.push("format");
  if (!nonblank(row.description)) missing.push("description");
  if (includeDerivedFields &&
      !(typeof row.page_count === "number" && Number.isInteger(row.page_count) &&
        row.page_count > 0 && row.page_count <= 10000)) missing.push("page count");
  return missing;
}

export function publicationQualityError(
  row: PublicationFields,
  includeDerivedFields = true,
): string | null {
  const missing = missingPublicationFields(row, includeDerivedFields);
  return missing.length ? `Before publishing, complete: ${missing.join(", ")}. Save as a draft if needed.` : null;
}

/** Existing legacy publications can be repaired gradually. Never let an edit
 * introduce a new missing required field on an already-published document. */
export function publishedMetadataEditError(
  before: PublicationFields,
  after: PublicationFields,
): string | null {
  const prior = new Set(missingPublicationFields(before));
  const newlyMissing = missingPublicationFields(after).filter((field) => !prior.has(field));
  return newlyMissing.length ? `Published PDFs must retain: ${newlyMissing.join(", ")}.` : null;
}
