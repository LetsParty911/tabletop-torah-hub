import { SmallPdfImage } from "@/components/SmallPdfImage";
import { useState } from "react";
import { FileText } from "lucide-react";
import { recordPdfAction } from "@/components/DownloadToPrintButton";
import { pdfActionLabel } from "@/lib/pdf-action-label";
import { resolveListingCover, type ListingCoverContext } from "@/lib/originals-promotion";

/**
 * Public cards for the seven TFTT originals use canonical permanent artwork.
 * Historical archives retain actual issue previews. Existing independent
 * series cover exceptions are preserved.
 * Clicking a cover is the same tracked PDF-open action as the Open PDF button.
 * A missing or failed preview falls back to the existing document icon.
 */
export function PdfCoverThumbnail({
  pdfId,
  seriesPublicationId,
  coverContext = "listing",
  thumbnailUrl,
  smallThumbnailUrl,
  title,
  publicationName,
  publisher,
  parsha,
  jewishYear,
}: {
  pdfId: string;
  seriesPublicationId?: string | null;
  coverContext?: ListingCoverContext;
  thumbnailUrl?: string | null;
  smallThumbnailUrl?: string | null;
  title: string;
  publicationName?: string | null;
  publisher?: string | null;
  parsha?: string | null;
  jewishYear?: number | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [permanentFailed, setPermanentFailed] = useState(false);

  // Preserve the same timeless cover throughout these two weekly series.
  const normalizedSeries = (publicationName ?? title).trim().toLowerCase();
  const isMiKaamchaCover = normalizedSeries === "mi ka'amcha yisroel" || normalizedSeries === "mikaamcha";
  const permanentCover = normalizedSeries === "torah wellsprings"
    ? "/publication-covers/torah-wellsprings-plaque-v2.jpg"
    : isMiKaamchaCover
      ? "/publication-covers/mi-kaamcha-yisroel-permanent.jpg"
      : null;
  const cover = resolveListingCover(seriesPublicationId, thumbnailUrl, smallThumbnailUrl, coverContext);
  const usingLegacyPermanent = !cover.series && Boolean(permanentCover && !permanentFailed);
  const usingPermanent = Boolean(cover.series) || usingLegacyPermanent;
  const imageUrl = usingLegacyPermanent ? permanentCover : cover.src;
  const dimensions = cover.series ? "h-20 w-16" : "h-[83px] w-16";

  if (!imageUrl || failedUrl === imageUrl) {
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
      aria-label={pdfActionLabel("open", title, parsha, jewishYear)}
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
      className={`block ${dimensions} shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <SmallPdfImage
        key={imageUrl}
        src={imageUrl}
        verifiedSmallSrc={usingPermanent ? null : cover.smallSrc}
        alt={usingPermanent ? `${cover.series?.title ?? publicationName ?? title} permanent cover` : `First page of ${title}`}
        width={64}
        height={cover.series ? 80 : 83}
        loading="lazy"
        decoding="async"
        onUnavailable={() => {
          if (usingLegacyPermanent) setPermanentFailed(true);
          else setFailedUrl(imageUrl);
        }}
        className={`${dimensions} rounded-sm border border-accent/40 bg-card object-contain shadow-sm hover:border-accent`}
      />
    </a>
  );
}
