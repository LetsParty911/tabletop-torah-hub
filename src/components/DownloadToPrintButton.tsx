import { Download, FileText, Printer } from "lucide-react";
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

type Kind = "open" | "download" | "print";

/**
 * Public PDF actions, each a plain link to an existing server route so the PDF
 * stays reachable if tracking fails:
 *  - Open PDF  → /view/$id/pdf (inline viewer)       → publication_click
 *  - Download  → /view/$id/download (attachment)      → download
 *  - Print     → opens the inline PDF so the visitor prints from the browser;
 *                it never forces printing            → print_click
 * Every click is recorded separately with no per-visitor cap.
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
  const routes = publicationId
    ? pdfActionHrefs(publicationId)
    : {
        open: href.replace(/\/download(?:\?.*)?$/, "/pdf"),
        download: href.replace(/\/pdf(?:\?.*)?$/, "/download"),
      };
  const title = publicationTitle || publicationName || "PDF";

  const record = (kind: Kind) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    let action: string | null = null;
    if (kind !== "print") {
      // Correlate with the server route result; keep normal link behavior.
      try {
        action = crypto.randomUUID();
        const url = new URL(kind === "open" ? routes.open : routes.download, window.location.origin);
        url.searchParams.set("a", action);
        url.searchParams.set("s", getSessionId());
        url.searchParams.set("v", getVisitorId());
        event.currentTarget.href = url.pathname + url.search;
      } catch { /* The PDF must remain accessible without tracking. */ }
    }
    try {
      const base = {
        publication_id: publicationId ?? null,
        publication_title: publicationTitle ?? publicationName ?? null,
        publication_series: publicationSeries ?? publicationName ?? null,
        publisher: publisher ?? null,
        parsha: parsha ?? null,
        jewish_year: jewishYear ?? null,
      };
      if (kind === "open") trackFp("publication_click", { ...base, metadata: { action: "open_pdf" } });
      else if (kind === "download") trackFp("download", { ...base, metadata: { action: "download_pdf", action_id: action } });
      else trackFp("print_click", { ...base, metadata: { action: "open_pdf_to_print" } });
    } catch { /* never block the link */ }
  };

  const secondary =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-accent/60 bg-background px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground touch-manipulation";

  return (
    <div className={["flex w-full flex-col gap-2", className].join(" ")}>
      <a
        href={routes.open}
        target="_blank"
        rel="nofollow noopener noreferrer"
        onClick={record("open")}
        aria-label={`Open PDF: ${title}`}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground touch-manipulation"
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Open PDF</span>
      </a>
      <div className="flex gap-2">
        <a
          href={routes.download}
          rel="nofollow noopener"
          onClick={record("download")}
          aria-label={`Download PDF: ${title}`}
          className={secondary}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Download PDF</span>
        </a>
        <a
          href={routes.open}
          target="_blank"
          rel="nofollow noopener noreferrer"
          onClick={record("print")}
          aria-label={`Print: opens ${title} so you can print it from your browser`}
          title="Opens the PDF — then use your browser's Print"
          className={secondary}
        >
          <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Print</span>
        </a>
      </div>
    </div>
  );
}
