import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Download, LoaderCircle } from "lucide-react";
import { OriginalSeriesCover } from "@/components/OriginalSeriesCover";
import { newActionId, trackFp } from "@/lib/first-party-analytics";
import { BundlePdfError, type BundleFailureCode } from "@/lib/bundle-diagnostics";
import { originalBundleFilename, type OriginalBundle } from "@/lib/original-bundles";

type Preparation = {
  status: "idle" | "preparing" | "ready" | "error";
  url?: string;
  pageCount?: number;
  progress?: string;
  preparationId?: string;
  reportedFailure?: boolean;
};

type BundleDiagnosticStage = "prepare_started" | "prepare_ready" | "prepare_failed" | "open_fallback" | "reported_failure";

function trackBundleDiagnostic(
  bundle: OriginalBundle, parshaKey: string | null, collectionLabel: string,
  preparationId: string | undefined, stage: BundleDiagnosticStage,
  details: Record<string, unknown> = {},
) {
  const year = bundle.items[0]?.resource?.jewish_year ?? null;
  trackFp("bundle_diagnostic", {
    parsha: parshaKey,
    jewish_year: year,
    metadata: {
      bundle_key: bundle.key,
      bundle_name: bundle.title,
      edition_label: collectionLabel,
      jewish_year: year,
      preparation_id: preparationId ?? null,
      stage,
      ...details,
    },
  });
}

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
  const lastDownloadIds = useRef(new Map<string, string>());
  const version = bundles.map((bundle) => bundle.items.map((item) => item.resource?.id ?? "missing").join(",")).join("|");

  useEffect(() => {
    setPreparations({});
    lastDownloadIds.current.clear();
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, [version]);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  const prepare = async (bundle: OriginalBundle) => {
    if (!bundle.isComplete) return;
    const preparationId = newActionId();
    lastDownloadIds.current.delete(bundle.key);
    trackBundleDiagnostic(bundle, parshaKey, collectionLabel, preparationId, "prepare_started");
    setPreparations((current) => ({
      ...current,
      [bundle.key]: { status: "preparing", preparationId, progress: "Loading the PDF library…" },
    }));
    let failureCode: BundleFailureCode = "library_load_failed";
    try {
      const { mergeOriginalBundlePdf } = await import("@/lib/original-bundle-pdf");
      failureCode = "merge_failed";
      const result = await mergeOriginalBundlePdf(bundle, ({ completed, total, title }) => {
        setPreparations((current) => ({
          ...current,
          [bundle.key]: {
            status: "preparing",
            preparationId,
            progress: completed === total ? "Finishing your combined PDF…" : `Preparing ${completed + 1} of ${total}: ${title}`,
          },
        }));
      });
      failureCode = "object_url_failed";
      const url = URL.createObjectURL(result.blob);
      objectUrls.current.add(url);
      setPreparations((current) => ({
        ...current,
        [bundle.key]: { status: "ready", url, preparationId, pageCount: result.pageCount },
      }));
      trackBundleDiagnostic(bundle, parshaKey, collectionLabel, preparationId, "prepare_ready", {
        page_count: result.pageCount, byte_count: result.blob.size,
      });
    } catch (error) {
      const details = error instanceof BundlePdfError
        ? { failure_code: error.code, constituent_id: error.publicationId ?? null, http_status: error.httpStatus ?? null }
        : { failure_code: failureCode };
      trackBundleDiagnostic(bundle, parshaKey, collectionLabel, preparationId, "prepare_failed", details);
      setPreparations((current) => ({
        ...current,
        [bundle.key]: { status: "error", preparationId },
      }));
    }
  };

  return (
    <>
      <ul aria-label="Original publication bundles" className="mt-4 grid gap-3 text-left md:grid-cols-[2fr_2fr_3fr]">
        {bundles.map((bundle) => {
          const preparation = preparations[bundle.key] ?? { status: "idle" } as Preparation;
          const availability = `${bundle.availableCount} of ${bundle.items.length} PDFs available for ${collectionLabel}`;
          return (
            <li key={bundle.key} className="flex min-w-0 flex-col rounded-xl border border-accent/40 bg-card/75 p-3 shadow-sm">
              <div className="-mx-3 -mt-3 overflow-hidden rounded-t-xl text-center">
                <h3 className="border-b-2 border-gold-decorative bg-primary px-2.5 py-2.5 font-serif text-[clamp(1.375rem,6.5vw,1.875rem)] font-bold leading-tight text-primary-foreground text-balance md:flex md:min-h-16 md:items-center md:justify-center md:text-xl lg:text-2xl">{bundle.title}</h3>
                <p className="px-3 pt-2.5 text-xs leading-relaxed text-muted-foreground md:min-h-11">{bundle.description}</p>
              </div>
              <ul aria-label={`${bundle.title} publications`} className="mt-3 flex flex-wrap items-start justify-center gap-2">
                {bundle.items.map(({ series, resource }) => (
                  <li key={series.key} className="min-w-0 w-[calc(50%-0.25rem)] max-w-36 md:w-auto md:max-w-none md:flex-1">
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
                      onClick={() => {
                        const year = bundle.items[0]?.resource?.jewish_year ?? null;
                        const pageCount = preparation.pageCount ?? null;
                        const actionId = newActionId();
                        lastDownloadIds.current.set(bundle.key, actionId);
                        if (preparation.reportedFailure) {
                          setPreparations(current => ({
                            ...current, [bundle.key]: { ...preparation, reportedFailure: false },
                          }));
                        }
                        trackFp("bundle_download", {
                          parsha: parshaKey,
                          jewish_year: year,
                          metadata: {
                            action: "bundle_download",
                            action_id: actionId,
                            preparation_id: preparation.preparationId ?? null,
                            bundle_key: bundle.key,
                            bundle_name: bundle.title,
                            jewish_year: year,
                            edition_label: collectionLabel,
                            constituent_ids: bundle.items.flatMap(item => item.resource ? [item.resource.id] : []),
                            constituent_count: bundle.items.length,
                            page_count: pageCount,
                          },
                        });
                        // Mirror this same action to built-in analytics, not a second canonical row.
                        window.__lovableEvents?.track?.("project.bundle_download_action", {
                          bundle_key: bundle.key,
                          bundle_name: bundle.title,
                          parsha: parshaKey,
                          jewish_year: year,
                          constituent_count: bundle.items.length,
                          page_count: pageCount,
                        });
                      }}
                      className={ACTION_CLASS}
                      aria-label={`Download combined ${bundle.title} for ${collectionLabel}`}
                    >
                      <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Download Combined PDF
                    </a>
                    <p role="status" className="mt-2 text-center text-xs text-muted-foreground">
                      PDF ready: {preparation.pageCount} pages. Choose Download or Open &amp; Print.
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
                      <a
                        href={preparation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                        onClick={() => trackBundleDiagnostic(bundle, parshaKey, collectionLabel, preparation.preparationId, "open_fallback", {
                          related_action_id: lastDownloadIds.current.get(bundle.key) ?? null,
                        })}
                        aria-label={`Open and print combined ${bundle.title} for ${collectionLabel}`}
                      >Open &amp; Print PDF</a>
                      <button
                        type="button"
                        disabled={preparation.reportedFailure}
                        className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 disabled:no-underline"
                        aria-label={`Report a download problem with ${bundle.title}`}
                        onClick={() => {
                          trackBundleDiagnostic(bundle, parshaKey, collectionLabel, preparation.preparationId, "reported_failure", {
                            related_action_id: lastDownloadIds.current.get(bundle.key) ?? null,
                            failure_code: "visitor_reported_download_problem",
                          });
                          setPreparations(current => ({
                            ...current, [bundle.key]: { ...preparation, reportedFailure: true },
                          }));
                        }}
                      >Download didn't work?</button>
                    </div>
                    {preparation.reportedFailure && (
                      <p role="status" className="mt-1 text-center text-xs text-muted-foreground">
                        Problem reported. Try Open &amp; Print PDF, or open the individual publications above.
                      </p>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!bundle.isComplete || preparation.status === "preparing"}
                    onClick={() => void prepare(bundle)}
                    className={ACTION_CLASS}
                    aria-label={bundle.isComplete && preparation.status === "idle" ? `Get Bundle PDF: ${bundle.title} for ${collectionLabel}` : `${preparation.status === "error" ? "Retry" : "Prepare"} combined ${bundle.title} for ${collectionLabel}`}
                  >
                    {preparation.status === "preparing" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {!bundle.isComplete ? "Combined PDF unavailable yet" : preparation.status === "preparing" ? "Preparing Combined PDF…" : preparation.status === "error" ? "Try Preparing Again" : "Get Bundle PDF"}
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
