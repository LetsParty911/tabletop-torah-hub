import { BookOpen, Download } from "lucide-react";
import { getSessionId, getVisitorId, trackFp } from "@/lib/first-party-analytics";
import { pdfActionHrefs } from "@/lib/collection-status";

type DownloadToPrintButtonProps = {
  href: string;
  onClick?: () => void;
  className?: string;
  publicationId?: string;
  publicationName?: string;
  publicationTitle?: string;
  label?: string;
  filename?: string;
  parsha?: string | null;
  jewishYear?: number | null;
  publisher?: string | null;
  publicationSeries?: string | null;
};

/**
 * One public action per PDF: Open PDF. The browser's PDF viewer then provides
 * its normal print/save controls. Keep the existing inline /pdf route.
 *
 * Count each deliberate button click as publication_click with
 * metadata.action = "open_pdf", exactly as the existing admin analytics does.
 * Do not infer downloads or printing, and never count automatic PDF previews.
 * The document opens even when client-side analytics is unavailable.
 */
export function DownloadToPrintButton({
  href,
  className = "",
  publicationId,
  publicationName,
  publicationTitle,
  parsha,
  jewishYear,
  publisher,
  publicationSeries,
}: DownloadToPrintButtonProps) {
  const openHref = publicationId
    ? pdfActionHrefs(publicationId).open
    : href.replace(/\/download(?:\?.*)?$/, "/pdf");
  const title = publicationTitle || publicationName || "PDF";

  const recordOpen = (event: React.MouseEvent<HTMLAnchorElement>, actionType: "open_pdf" | "download") => {
    // Correlate the intended open with its server route without interrupting
    // navigation if browser storage or analytics is unavailable.
    try {
      const action = crypto.randomUUID();
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
        metadata: { action: actionType },
      });
    } catch { /* Never block the PDF link. */ }
  };

  return (
    <div className={["flex w-full items-center gap-2", className].join(" ")}>
      <a
        href={openHref}
        onClick={(event) => recordOpen(event, "open_pdf")}
        rel="nofollow"
        aria-label={"Open PDF: " + title}
        className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Open PDF</span>
      </a>
      {publicationId && (
        <a
          href={pdfActionHrefs(publicationId).download}
          onClick={(event) => recordOpen(event, "download")}
          aria-label={"Download PDF: " + title}
          title="Download PDF to save or print"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-background text-primary transition-colors hover:bg-accent/10"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
