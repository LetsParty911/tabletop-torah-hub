/** Presentation only: raw event names, IDs, qualifications and counts stay unchanged. */
export const PDF_REPORTING = {
  attempted: "Counted PDF attempted opens",
  distinctClicked: "Distinct PDFs clicked",
  viewerLoads: "PDF viewer loads",
  redirects: "PDF redirects issued (not confirmed downloads)",
  attemptedDefinition: "Every distinct human-qualified Open PDF click or historical download request, including correlated unpaired historical redirects. Retries and paired download/redirect records count once. No per-visitor limit. These are attempted opens, not completed downloads or proof of reading.",
  clickedDefinition: "Distinct nonempty publication IDs among human-qualified tagged Open PDF clicks. Missing IDs are excluded; titles are never used to infer IDs. Attempted opens, not verified reading.",
  usedTorahDefinition: "Distinct visitor IDs in human-qualified sessions with a tagged Open PDF click, PDF viewer load, historical download request/served redirect, share, or signup. Existing qualification and priority are unchanged. Not proof of reading, completed transfer, or printing.",
  transferNote: "A 302 only confirms that the application issued a redirect. Completed file transfers and printing are not measured. Redirects are never added to their paired action as a second successful download.",
} as const;

export function pdfReasonLabel(reason: string): string {
  return reason === "Opened a PDF" ? "PDF viewer loaded (automatic)" : reason;
}

export function pdfEventLabel(event: string, metadata?: Record<string, unknown> | null): string {
  if (event === "pdf_open") return PDF_REPORTING.viewerLoads;
  if (event === "download") return "Download request/action";
  if (event === "download_served") return "Historical PDF redirect issued (not confirmed download)";
  if (event === "pdf_route_result") {
    if (metadata?.["http_status"] === 302) return "PDF redirect issued (not confirmed download)";
    if ([404, 500].includes(Number(metadata?.["http_status"]))) return "PDF route failed";
    return "PDF route result (outcome in recorded details)";
  }
  if (event === "publication_click") return metadata?.["action"] === "open_pdf" ? "Open PDF click (attempted open)" : "Publication click (selection or attempted open)";
  if (event === "print_click") return "Print click (not confirmed printing)";
  return event.replaceAll("_", " ");
}