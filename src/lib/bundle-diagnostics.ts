/** Only controlled diagnostic codes are sent to analytics; never raw exception text or URLs. */
export type BundleFailureCode =
  | "library_load_failed"
  | "merge_failed"
  | "object_url_failed"
  | "fetch_timeout"
  | "fetch_failed"
  | "http_error"
  | "invalid_pdf"
  | "pdf_parse_or_merge_failed"
  | "pdf_save_failed";

export class BundlePdfError extends Error {
  constructor(
    message: string,
    public readonly code: BundleFailureCode,
    public readonly publicationId?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "BundlePdfError";
  }
}
