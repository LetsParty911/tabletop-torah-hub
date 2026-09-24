import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { trackEvent } from "@/lib/analytics";
import pdf11x17 from "@/assets/sukkah-trust-11x17.pdf.asset.json";
import pdf8x11 from "@/assets/sukkah-trust-8-5x11.pdf.asset.json";
import preview11x17 from "@/assets/sukkah-trust-11x17-preview.jpg.asset.json";

const THEME = "Sukkos Decoration — Trust in Hashem";

const SIZES = [
  {
    key: "8.5x11",
    label: "Download 8.5 × 11",
    hint: "Standard home printer",
    size: "8.5 × 11",
    href: pdf8x11.url,
    filename: "Sukkos-Decoration-Trust-in-Hashem-8.5x11.pdf",
  },
  {
    key: "11x17",
    label: "Download 11 × 17",
    hint: "Large Sukkah poster",
    size: "11 × 17",
    href: pdf11x17.url,
    filename: "Sukkos-Decoration-Trust-in-Hashem-11x17.pdf",
  },
] as const;

type SukkosTrustFeatureProps = {
  compact?: boolean;
};

export function SukkosTrustFeature({ compact = false }: SukkosTrustFeatureProps) {
  const titleId = compact ? "sukkos-feature-archive-title" : "sukkos-feature-title";

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-lg border-2 border-gold-decorative bg-primary shadow-lg"
    >
      <div
        className={`grid items-stretch ${compact ? "md:grid-cols-[minmax(12rem,0.5fr)_1.5fr]" : "md:grid-cols-[minmax(18rem,0.85fr)_1.15fr]"}`}
      >
        <div className={`order-1 bg-card ${compact ? "p-3" : "p-3 sm:p-4 md:p-5"}`}>
          <div
            className={`mx-auto aspect-[11/17] w-full overflow-hidden rounded-md border border-accent/40 bg-background ${compact ? "max-w-[9rem] sm:max-w-[11rem]" : "max-w-[13rem] sm:max-w-[17rem] md:max-w-[19rem]"}`}
          >
            <img
              src={preview11x17.url}
              alt="Preview of the Trust in Hashem Sukkah decoration (11 × 17)"
              loading={compact ? "lazy" : "eager"}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
            Preview: 11 × 17 version
          </p>
        </div>

        <div
          className={`order-2 flex flex-col justify-center text-primary-foreground ${compact ? "px-5 py-6 sm:px-7" : "px-5 py-7 sm:px-8 sm:py-9 md:px-10"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-gold-decorative bg-gold-decorative/15 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-gold-decorative">
              Free Download
            </span>
            <span className="rounded-full border border-primary-foreground/40 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-primary-foreground">
              8.5 × 11 · 11 × 17
            </span>
          </div>
          <h2
            id={titleId}
            className={`mt-4 font-serif font-bold leading-tight text-primary-foreground ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}
          >
            NEW: Sukkos Decoration — Trust in Hashem
          </h2>
          <p
            className={`mt-3 max-w-xl font-serif leading-relaxed text-primary-foreground/90 ${compact ? "text-base" : "text-base sm:text-lg"}`}
          >
            A beautiful collection of pesukim about placing our trust in Hashem — ready to print for your Sukkah.
          </p>

          <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-gold-decorative">
            Choose your print size
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {SIZES.map((s) => (
              <div
                key={s.key}
                id={s.key === "8.5x11" ? "sukkah-8x11" : "sukkah-11x17"}
                className="scroll-mt-24 flex flex-col gap-1"
              >
                <DownloadToPrintButton
                  href={s.href}
                  publicationName={THEME}
                  publicationTitle={`${THEME} (${s.size})`}
                  publicationSeries={THEME}
                  label={s.label}
                  parsha="Sukkos"
                  filename={s.filename}
                  onClick={() =>
                    trackEvent("pdf_download", {
                      file_id: `sukkos-trust-${s.key}`,
                      file_title: `${THEME} (${s.size})`,
                      source_name: THEME,
                      parsha: "Sukkos",
                      print_size: s.size,
                    })
                  }
                  className="min-h-12 w-full rounded-full bg-gold-decorative! px-5 py-3 text-base font-bold text-primary! hover:bg-card!"
                />
                <span className="text-center text-xs text-primary-foreground/75">{s.hint}</span>
              </div>
            ))}
          </div>

          <p className="mt-5 font-semibold text-gold-decorative">Print • Laminate • Enjoy in your Sukkah</p>
          {!compact && (
            <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">
              Download it, use it, and share it with family and friends.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
