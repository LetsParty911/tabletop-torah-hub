import { FileText } from "lucide-react";
import { trackFp } from "@/lib/first-party-analytics";

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
 * One clear action for public PDFs. Existing card callers still pass their
 * legacy props, but the component never forces a file download or claims to
 * start printing. Analytics records only a request to open the PDF.
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
  const pdfHref = publicationId
    ? `/view/${encodeURIComponent(publicationId)}/pdf`
    : href.replace(/\/download(?:\?.*)?$/, "/pdf");
  const title = publicationTitle || publicationName || "PDF";
  const recordOpen = () => {
    trackFp("publication_click", {
      publication_id: publicationId ?? null,
      publication_title: publicationTitle ?? publicationName ?? null,
      publication_series: publicationSeries ?? publicationName ?? null,
      publisher: publisher ?? null,
      parsha: parsha ?? null,
      jewish_year: jewishYear ?? null,
      metadata: { action: "open_pdf" },
    });
  };

  return (
    <div className={["flex flex-wrap items-center", className].join(" ")}>
      <a
        href={pdfHref}
        target="_blank"
        rel="nofollow noopener noreferrer"
        onClick={recordOpen}
        aria-label={`Open PDF: ${title}`}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground touch-manipulation"
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Open PDF</span>
      </a>
    </div>
  );
}
