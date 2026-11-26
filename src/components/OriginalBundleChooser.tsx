import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Download, LoaderCircle } from "lucide-react";
import { OriginalSeriesCover } from "@/components/OriginalSeriesCover";
import { trackFp } from "@/lib/first-party-analytics";
import { originalBundleFilename, type OriginalBundle } from "@/lib/original-bundles";

type Preparation = {
  status: "idle" | "preparing" | "ready" | "error";
  url?: string;
  pageCount?: number;
  progress?: string;
};

const ACTION_CLASS = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-55";

export function OriginalBundleChooser({
  bundles,
  collectionLabel,
  parshaKey,
}: {
  bundles: OriginalBundle[];
  collectionLabel: string;
  parshaKey: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [preparations, setPreparations] = useState<Record<string, Preparation>>({});
  const objectUrls = useRef(new Set<string>());
  const version = bundles.map((bundle) => bundle.items.map((item) => item.resource?.id ?? "missing").join(",")).join("|");

  useEffect(() => {
    setPreparations({});
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, [version]);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  const prepare = async (bundle: OriginalBundle) => {
    if (!bundle.isComplete) return;
    setPreparations((current) => ({
      ...current,
      [bundle.key]: { status: "preparing", progress: "Loading the PDF library…" },
    }));
    try {
      const { mergeOriginalBundlePdf } = await import("@/lib/original-bundle-pdf");
      const result = await mergeOriginalBundlePdf(bundle, ({ completed, total, title }) => {
        setPreparations((current) => ({
          ...current,
          [bundle.key]: {
            status: "preparing",
            progress: completed === total ? "Finishing your combined PDF…" : `Preparing ${completed + 1} of ${total}: ${title}`,
          },
        }));
      });
      const url = URL.createObjectURL(result.blob);
      objectUrls.current.add(url);
      setPreparations((current) => ({
        ...current,
        [bundle.key]: { status: "ready", url, pageCount: result.pageCount },
      }));
    } catch {
      setPreparations((current) => ({
        ...current,
        [bundle.key]: { status: "error" },
      }));
    }
  };

  return (
    <>
      <ul aria-label="Original publication bundles" className="mt-4 grid gap-3 text-left md:grid-cols-3">
        {bundles.map((bundle) => {
          const preparation = preparations[bundle.key] ?? { status: "idle" } as Preparation;
          const availability = `${bundle.availableCount} of ${bundle.items.length} PDFs available for ${collectionLabel}`;
          return (
            <li key={bundle.key} className="flex min-w-0 flex-col rounded-xl border border-accent/40 bg-card/75 p-3 shadow-sm">
              <div className="-mx-3 -mt-3 rounded-t-xl bg-gold-decorative/10 px-3 pb-2.5 pt-3 text-center md:min-h-[6.5rem]">
                <h3 className="border-b border-gold-decorative/80 pb-1.5 font-serif text-[clamp(1.375rem,6.2vw,1.875rem)] font-bold leading-tight text-primary text-balance md:text-xl lg:text-2xl">{bundle.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{bundle.description}</p>
              </div>
              <ul aria-label={`${bundle.title} publications`} className="mt-3 flex items-start justify-center gap-2">
                {bundle.items.map(({ series, resource }) => (
                  <li key={series.key} className="min-w-0 flex-1">
                    {resource ? (
                      <Link
                        to="/view/$id"
                        params={{ id: resource.id }}
                        aria-label={`View ${series.title} for ${collectionLabel}`}
                        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <OriginalSeriesCover series={series} />
                        <span className="mt-1 block break-words text-center font-serif text-[11px] font-semibold leading-tight text-primary">{series.title}</span>
                      </Link>
                    ) : (
                      <Link
                        to="/originals"
                        hash={`series-${series.key}`}
                        aria-label={`View ${series.title} series archive`}
                        className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <OriginalSeriesCover series={series} />
                        <span className="mt-1 block break-words text-center font-serif text-[11px] font-semibold leading-tight text-primary">{series.title}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-3">
                <p className="mb-2 text-center text-xs font-medium text-muted-foreground" aria-live="polite">
                  {preparation.status === "preparing" ? preparation.progress : availability}
                </p>
                {preparation.status === "ready" && preparation.url ? (
                  <>
                    <a
                      href={preparation.url}
                      download={originalBundleFilename(bundle, collectionLabel)}
                      onClick={() => trackFp("bundle_download", {
                        parsha: parshaKey,
                        metadata: {
                          action: "bundle_download",
                          bundle_key: bundle.key,
                          constituent_count: bundle.items.length,
                          page_count: preparation.pageCount ?? null,
                        },
                      })}
                      className={ACTION_CLASS}
                      aria-label={`Download combined ${bundle.title} for ${collectionLabel}`}
                    >
                      <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Download Combined PDF
                    </a>
                    <p role="status" className="mt-2 text-center text-xs text-muted-foreground">
                      Ready: {preparation.pageCount} pages to save or print.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!bundle.isComplete || preparation.status === "preparing"}
                    onClick={() => void prepare(bundle)}
                    className={ACTION_CLASS}
                    aria-label={`${preparation.status === "error" ? "Retry" : "Prepare"} combined ${bundle.title} for ${collectionLabel}`}
                  >
                    {preparation.status === "preparing" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {!bundle.isComplete ? "Combined PDF unavailable yet" : preparation.status === "preparing" ? "Preparing Combined PDF…" : preparation.status === "error" ? "Try Preparing Again" : "Prepare Combined PDF"}
                  </button>
                )}
                {preparation.status === "error" && (
                  <p role="alert" className="mt-2 text-center text-xs font-medium text-destructive">
                    This bundle could not be prepared. Each available publication still opens above.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mx-auto mt-4 max-w-3xl border-t border-accent/30 pt-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="all-original-publications"
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-accent/45 bg-background px-5 py-2.5 font-serif text-sm font-semibold text-primary hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {expanded ? "Hide Individual Publications" : "View All 7 Individual Publications"}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <div id="all-original-publications" hidden={!expanded} className="mt-3 text-left">
          {expanded && (
            <ul className="divide-y divide-accent/25 rounded-xl border border-accent/35 bg-card/60 px-4">
              {bundles.flatMap((bundle) => bundle.items).map(({ series, resource }) => (
                <li key={series.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-serif text-sm font-bold text-primary">{series.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {resource ? `Available for ${collectionLabel}` : `Not yet published for ${collectionLabel}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
                    {resource && (
                      <Link to="/view/$id" params={{ id: resource.id }} className="inline-flex min-h-11 items-center text-primary underline decoration-accent/60 underline-offset-4">
                        This week's publication
                      </Link>
                    )}
                    <Link to="/originals" hash={`series-${series.key}`} className="inline-flex min-h-11 items-center text-primary underline decoration-accent/60 underline-offset-4">
                      Series archive
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
