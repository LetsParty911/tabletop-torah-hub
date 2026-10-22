import { FileText } from "lucide-react";
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

  const recordOpen = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Correlate the intended open with its server route without interrupting
    // navigation if browser storage or analytics is unavailable.
    try {
      const action = crypto.randomUUID();
      const url = new URL(openHref, window.location.origin);
      url.searchParams.set("a", action);
      url.searchParams.set("s", getSessionId());
      url.searchParams.set("v", getVisitorId());
      event.currentTarget.href = url.pathname + url.search;
    } catch { /* The PDF must remain accessible without tracking. */ }

    try {
      trackFp("publication_click", {
        publication_id: publicationId ?? null,
        publication_title: publicationTitle ?? publicationName ?? null,
        publication_series: publicationSeries ?? publicationName ?? null,
        publisher: publisher ?? null,
        parsha: parsha ?? null,
        jewish_year: jewishYear ?? null,
        metadata: { action: "open_pdf" },
      });
    } catch { /* Never block the PDF link. */ }
  };

  return (
    <div className={["w-full", className].join(" ")}>
      <a
        href={openHref}
        target="_blank"
        rel="nofollow noopener noreferrer"
        onClick={recordOpen}
        aria-label={"Open PDF: " + title}
        title="Open the PDF, then use your viewer to print or save"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground touch-manipulation"
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Open PDF</span>
      </a>
    </div>
  );
}
