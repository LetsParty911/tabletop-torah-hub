import { useState } from "react";
import { FileText } from "lucide-react";
import { recordPdfAction } from "@/components/DownloadToPrintButton";

/**
 * Shows a PDF's first page by default. Torah Wellsprings is the sole exception:
 * its timeless cover is reused for every weekly edition.
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
  const [permanentFailed, setPermanentFailed] = useState(false);

  // Preserve the same timeless cover throughout these two weekly series.
  const normalizedSeries = (publicationName ?? title).trim().toLowerCase();
  const isMiKaamchaCover = normalizedSeries === "mi ka'amcha yisroel" || normalizedSeries === "mikaamcha";
  const permanentCover = normalizedSeries === "torah wellsprings"
    ? "/publication-covers/torah-wellsprings-plaque-v2.jpg"
    : isMiKaamchaCover
      ? "/publication-covers/mi-kaamcha-yisroel-permanent.jpg"
      : null;
  const usingPermanent = Boolean(permanentCover && !permanentFailed);
  const imageUrl = usingPermanent ? permanentCover : thumbnailUrl;

  if (!imageUrl || failed) {
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
        src={imageUrl}
        alt={usingPermanent ? `${publicationName ?? title} permanent cover` : `First page of ${title}`}
        width={64}
        height={83}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (usingPermanent) setPermanentFailed(true);
          else setFailed(true);
        }}
        className={`h-[83px] w-16 rounded-sm border border-accent/40 shadow-sm hover:border-accent ${usingPermanent && isMiKaamchaCover ? "bg-[#0b2641] object-contain" : "bg-card object-cover object-top"}`}
      />
    </a>
  );
}
