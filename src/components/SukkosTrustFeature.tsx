import { Download, ImagePlus } from "lucide-react";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

const TITLE = "Sukkos Decoration — Trust in Hashem";

type SukkosTrustFeatureProps = {
  artworkSrc?: string;
  downloadHref?: string;
  publicationId?: string;
  compact?: boolean;
};

export function SukkosTrustFeature({
  artworkSrc,
  downloadHref,
  publicationId,
  compact = false,
}: SukkosTrustFeatureProps) {
  const download = downloadHref ? (
    <DownloadToPrintButton
      href={downloadHref}
      publicationId={publicationId}
      publicationName={TITLE}
      publicationTitle={TITLE}
      publicationSeries="Torah for the Table"
      parsha="Sukkos"
      filename="Sukkos-Decoration-Trust-in-Hashem-11x17.pdf"
      onClick={() =>
        trackEvent("pdf_download", {
          file_id: publicationId ?? "sukkos-trust-decoration",
          file_title: TITLE,
          source_name: TITLE,
          parsha: "Sukkos",
          print_size: "11 × 17",
        })
      }
      className="min-h-12 w-full px-6 py-3 text-base font-bold sm:w-auto"
    />
  ) : (
    <Button
      type="button"
      disabled
      aria-label="Download unavailable until the Sukkos artwork is attached"
      className="min-h-12 w-full rounded-full px-6 py-3 text-base font-bold sm:w-auto"
    >
      <Download aria-hidden="true" />
      Download 11 × 17
    </Button>
  );

  return (
    <section
      aria-labelledby={compact ? "sukkos-feature-archive-title" : "sukkos-feature-title"}
      className="overflow-hidden rounded-lg border-2 border-gold-decorative bg-primary shadow-lg"
    >
      <div className={`grid items-stretch ${compact ? "md:grid-cols-[minmax(15rem,0.7fr)_1.3fr]" : "md:grid-cols-[minmax(18rem,0.85fr)_1.15fr]"}`}>
        <div className="order-1 bg-card p-3 sm:p-4 md:p-5">
          <div className="mx-auto flex aspect-[11/17] max-h-[29rem] w-full max-w-[19rem] items-center justify-center overflow-hidden rounded-md border border-accent/40 bg-background">
            {artworkSrc ? (
              <img
                src={artworkSrc}
                alt="Sukkos Trust in Hashem printable decoration"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="px-5 text-center text-primary">
                <ImagePlus className="mx-auto h-9 w-9 text-accent-readable" aria-hidden="true" />
                <p className="mt-3 font-serif text-lg font-bold">Artwork attachment needed</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  The exact supplied Sukkos artwork will appear here without alteration.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="order-2 flex flex-col justify-center px-5 py-7 text-primary-foreground sm:px-8 sm:py-9 md:px-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-gold-decorative bg-gold-decorative/15 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-gold-decorative">
              Free Download
            </span>
            <span className="rounded-full border border-primary-foreground/40 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-primary-foreground">
              Print Size: 11 × 17
            </span>
          </div>
          <h2
            id={compact ? "sukkos-feature-archive-title" : "sukkos-feature-title"}
            className={`mt-4 font-serif font-bold leading-tight text-primary-foreground ${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}
          >
            NEW: Sukkos Decoration — Trust in Hashem
          </h2>
          <p className="mt-4 max-w-xl font-serif text-base leading-relaxed text-primary-foreground/90 sm:text-lg">
            A beautiful collection of pesukim about placing our trust in Hashem — ready to print for your Sukkah.
          </p>
          <div className="mt-6">{download}</div>
          {!downloadHref && (
            <p className="mt-2 text-xs text-primary-foreground/75">
              Download will activate when the exact artwork file is attached.
            </p>
          )}
          <p className="mt-5 font-semibold text-gold-decorative">Print • Laminate • Enjoy in your Sukkah</p>
          <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">
            Download it, use it, and share it with family and friends.
          </p>
        </div>
      </div>
    </section>
  );
}