import { useState } from "react";
import { FileText } from "lucide-react";
import { recordPdfAction } from "@/components/DownloadToPrintButton";

/**
 * Shows the uploaded PDF's actual first page wherever a publication appears.
 * Clicking a cover is the same tracked PDF-open action as the Open PDF button.
 * A missing or failed preview falls back to the existing document icon.
 */
export function PdfCoverThumbnail({
  pdfId,
  thumbnailUrl,
  title,
  publicationName,
  publisher,
  parsha,
  jewishYear,
}: {
  pdfId: string;
  thumbnailUrl?: string | null;
  title: string;
  publicationName?: string | null;
  publisher?: string | null;
  parsha?: string | null;
  jewishYear?: number | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!thumbnailUrl || failed) {
    return (
      <div
        role="img"
        aria-label={`PDF cover unavailable for ${title}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-primary sm:h-11 sm:w-11"
      >
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }

  const href = `/view/${pdfId}/pdf`;
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      title={`Open PDF: ${title}`}
      aria-label={`Open PDF in a new tab: ${title}`}
      onClick={(event) =>
        recordPdfAction(
          event,
          "open_pdf",
          href,
          {
            publicationId: pdfId,
            publicationName: publicationName ?? title,
            publicationTitle: title,
            publicationSeries: publicationName ?? null,
            publisher: publisher ?? null,
            parsha: parsha ?? null,
            jewishYear: jewishYear ?? null,
          },
          "thumbnail",
        )
      }
      className="block h-[83px] w-16 shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <img
        src={thumbnailUrl}
        alt={`First page of ${title}`}
        width={64}
        height={83}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-[83px] w-16 rounded-sm border border-accent/40 bg-card object-cover object-top shadow-sm hover:border-accent"
      />
    </a>
  );
}
