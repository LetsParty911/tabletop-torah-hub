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
 * The single public PDF action: a plain link to the existing inline viewer
 * route (/view/$id/pdf) so the PDF stays reachable if tracking fails.
 * Read Now preserves the exact deliberate Open PDF tracking event
 * (publication_click, metadata.action = "open_pdf") with the correlation
 * query params; the inline viewer keeps its own download/print controls.
 * The event is never emitted for impressions or automatic viewer loads.
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
  const openHref = publicationId ? pdfActionHrefs(publicationId).open : href.replace(/\/download(?:\?.*)?$/, "/pdf");
  const title = publicationTitle || publicationName || "PDF";

  const record = (event: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      // Correlate with the server route result; keep normal link behavior.
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
    } catch { /* never block the link */ }
  };

  return (
    <a
      href={openHref}
      target="_blank"
      rel="nofollow noopener noreferrer"
      onClick={record}
      aria-label={`Read Now: ${title}`}
      className={["inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground touch-manipulation", className].join(" ")}
    >
      <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Read Now</span>
    </a>
  );
}
