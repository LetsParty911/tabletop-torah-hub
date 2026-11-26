import { BookOpen, Download } from "lucide-react";
import { pdfActionLabel } from "@/lib/pdf-action-label";
import { getSessionId, getVisitorId, trackFp } from "@/lib/first-party-analytics";
import { pdfActionHrefs } from "@/lib/collection-status";

type DownloadToPrintButtonProps = {
  href: string;
  onClick?: () => void;
  className?: string;
  /** Display an explicitly labeled download option only on the PDF detail page. */
  showDownload?: boolean;
  publicationId?: string;
  publicationName?: string;
  publicationTitle?: string;
  label?: string;
  filename?: string;
  parsha?: string | null;
  jewishYear?: number | null;
  publisher?: string | null;
  publicationSeries?: string | null;
  /** Catalogue edition year; also used as the analytics jewish_year when jewishYear is omitted. */
  labelYear?: number | null;
};

type PdfActionContext = Pick<
  DownloadToPrintButtonProps,
  "publicationId" | "publicationName" | "publicationTitle" | "publicationSeries" | "publisher" | "parsha" | "jewishYear"
>;

/** Shared analytics and server-route correlation for both Open PDF entry points. */
export function recordPdfAction(
  event: React.MouseEvent<HTMLAnchorElement>,
  actionType: "open_pdf" | "download",
  openHref: string,
  { publicationId, publicationName, publicationTitle, publicationSeries, publisher, parsha, jewishYear }: PdfActionContext,
  entryPoint: "button" | "thumbnail" | "save_or_print" = "button",
) {
  // One action ID is shared by the client event (metadata.action_id) and the
  // server route (?a=) so download/download_served and open/pdf_route_result
  // correlate and deduplicate. Navigation still works if crypto is missing.
  let action: string | null = null;
  try { action = crypto.randomUUID(); } catch { action = null; }
  try {
    if (!action) throw new Error("no action id");
    const url = new URL(actionType === "download" && publicationId ? pdfActionHrefs(publicationId).download : openHref, window.location.origin);
    url.searchParams.set("a", action);
    url.searchParams.set("s", getSessionId());
    url.searchParams.set("v", getVisitorId());
    event.currentTarget.href = url.pathname + url.search;
  } catch { /* The PDF must remain accessible without tracking. */ }

  try {
    trackFp(actionType === "download" ? "download" : "publication_click", {
      publication_id: publicationId ?? null,
      publication_title: publicationTitle ?? publicationName ?? null,
      publication_series: publicationSeries ?? publicationName ?? null,
      publisher: publisher ?? null,
      parsha: parsha ?? null,
      jewish_year: jewishYear ?? null,
      metadata: action
        ? { action: actionType, entry_point: entryPoint, action_id: action }
        : { action: actionType, entry_point: entryPoint },
    });
  } catch { /* Never block the PDF link. */ }
}

/**
 * Collection cards show one public action: Read Now. The individual PDF detail
 * page can opt in to a clearly labeled Download PDF action for saving/printing.
 * Keep the existing validated /pdf and /download routes.
 *
 * Count each deliberate button or thumbnail click as publication_click with
 * metadata.action = "open_pdf", exactly as the existing admin analytics does.
 * Do not infer downloads or printing, and never count automatic PDF previews.
 * The document opens even when client-side analytics is unavailable.
 */
export function DownloadToPrintButton({
  href,
  className = "",
  showDownload = false,
  onClick,
  publicationId,
  publicationName,
  publicationTitle,
  parsha,
  jewishYear,
  publisher,
  publicationSeries,
  label = "Read Now",
  labelYear,
}: DownloadToPrintButtonProps) {
  const openHref = publicationId
    ? pdfActionHrefs(publicationId).open
    : href.replace(/\/download(?:\?.*)?$/, "/pdf");
  const title = publicationTitle || publicationName || "PDF";

  const recordOpen = (
    event: React.MouseEvent<HTMLAnchorElement>,
    actionType: "open_pdf" | "download",
    entryPoint: "button" | "save_or_print" = "button",
  ) => {
    recordPdfAction(event, actionType, openHref, {
      publicationId, publicationName, publicationTitle, publicationSeries, publisher, parsha,
      jewishYear: jewishYear ?? labelYear ?? null,
    }, entryPoint);
  };

  return (
    <div className={["flex w-full items-center gap-2", showDownload && publicationId ? "flex-wrap" : "", className].join(" ")}>
      <a
        href={openHref}
        target="_blank"
        onClick={(event) => { recordOpen(event, "open_pdf"); onClick?.(); }}
        rel="nofollow noopener noreferrer"
        aria-label={pdfActionLabel("open", title, parsha, jewishYear ?? labelYear)}
        className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </a>
      {showDownload && publicationId && (
        <a
          href={pdfActionHrefs(publicationId).download}
          onClick={(event) => recordOpen(event, "download")}
          aria-label={pdfActionLabel("download", title, parsha, jewishYear ?? labelYear)}
          title="Download PDF to save or print"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-accent/50 bg-background px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-accent/10"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Download PDF</span>
        </a>
      )}
      {showDownload && publicationId && (
        <div className="w-full rounded-lg border border-accent/30 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">Saving or printing on iPhone or iPad?</p>
          <a
            href={openHref}
            target="_blank"
            rel="nofollow noopener noreferrer"
            onClick={(event) => recordOpen(event, "open_pdf", "save_or_print")}
            aria-label={`Open PDF to save or print on iPhone or iPad: ${title}`}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Open PDF to Save or Print
          </a>
          <p>In the PDF viewer, tap Share, then choose Save to Files or Print. If you are using an in-app browser, try opening this page in Safari.</p>
        </div>
      )}
    </div>
  );
}
