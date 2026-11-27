import { createFileRoute, Link, stripSearchParams, useNavigate, useRouter, useRouterState, type ErrorComponentProps } from "@tanstack/react-router";
import { LENGTH_OPTIONS } from "@/lib/length-filter";
import { Search, SlidersHorizontal, ChevronDown, Loader2 } from "lucide-react";
import {
  nextArchiveSearch,
  parseArchiveSearch,
  selectionCountLabel,
  stripArchiveDefaults,
  type ArchiveSearch,
} from "@/lib/archive-search";
import { claimHardReload, isStaleBuildError, withNavigationTimeout } from "@/lib/navigation-recovery";
import { PdfCoverThumbnail } from "@/components/PdfCoverThumbnail";
import { publicFilterTone, PUBLIC_FILTER_FIELD_TONE, PUBLIC_FILTER_COUNT_TONE, PUBLIC_ARCHIVE_SEARCH_PLACEHOLDER } from "@/lib/public-filter-styles";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ArchiveYearAll as ArchiveYear, type ArchiveParshaAll as ArchiveParsha, type ArchivePdfAll as ArchivePdf } from "@/integrations/supabase/archive-all.functions";
import { listArchiveAll, type ArchivePageInput } from "@/integrations/supabase/archive-all.functions";
import { trackSearch } from "@/lib/site-analytics";
import { trackFp } from "@/lib/first-party-analytics";
import { DownloadAndPrintButtons } from "@/components/DownloadAndPrintButtons";
import { PublicationCardTracker } from "@/components/PublicationCardTracker";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { BackToTop } from "@/components/BackToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { fitPageTitle } from "@/lib/page-title";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { leadWithPublicationTitle } from "@/lib/publication-description";
import { PublicationQuickFacts } from "@/components/PublicationQuickFacts";
import { publicationLabel } from "@/lib/badges";
import { formatReadingLabel, displayReadingName } from "@/lib/parshiyos";
import { usePrewarmDownloads } from "@/hooks/use-prewarm-downloads";
import { isYomTovReading, readingSlug } from "@/lib/reading-page";

const resourceType = (r: ArchivePdf) =>
  r.content_type === "Questions & Answers"
    ? "Questions & Answers"
    : formatTypeLabel(r.format_type);

/** Archive data must arrive or fail visibly; never leave the previous results on screen indefinitely. */
const ARCHIVE_LOAD_TIMEOUT_MS = 20_000;

function ArchiveError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    console.error("Archive load error", error);
    if (!isStaleBuildError(error)) return;
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { storage = null; }
    if (claimHardReload(window.location.href, storage)) window.location.reload();
  }, [error]);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="parchment-frame max-w-md w-full">
        <div role="alert" className="parchment-panel text-center">
          <h1 className="font-serif text-2xl text-primary">Archive unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">We couldn't load these archive results. Please try again.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => { void router.invalidate(); reset(); }}
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Try again
            </button>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-full border border-accent/50 px-5 py-2 text-sm font-medium text-primary hover:bg-accent/10 transition-colors"
            >
              Back home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/archive")({
  component: ArchivePage,
  validateSearch: (search: Record<string, unknown>): ArchiveSearch =>
    stripArchiveDefaults(parseArchiveSearch(search)),
  loaderDeps: ({ search }) => parseArchiveSearch(search as Record<string, unknown>),
  // A superseded filter change aborts its request; a stalled one becomes a retryable error.
  loader: ({ deps, abortController }) =>
    withNavigationTimeout(
      listArchiveAll({ data: deps as ArchivePageInput, signal: abortController.signal }),
      ARCHIVE_LOAD_TIMEOUT_MS,
      "The archive",
    ),
  search: {
    middlewares: [
      stripSearchParams({
        year: "all",
        parsha: "all",
        audience: "All" as const,
        q: "",
        length: "All" as const,
        type: "All",
        pub: "All",
        page: 1,
      }),
    ],
  },
  head: (ctx) => {
    const { loaderData } = ctx;
    const search = parseArchiveSearch(
      ((ctx as { match?: { search?: Record<string, unknown> } }).match?.search ??
        {}) as Record<string, unknown>,
    );

    const parshaLabel =
      search.parsha !== "all"
        ? formatReadingLabel(search.parsha.replace(/^(parshas|parashat)\s+/i, "").trim())
        : null;
    const yearPart = search.year !== "all" ? ` ${search.year}` : "";

    const title = parshaLabel
      ? fitPageTitle(`${parshaLabel}${yearPart}`, " — Archive")
      : "Archive — Torah For The Table";
    const description = parshaLabel
      ? `Printable Divrei Torah for ${parshaLabel}${yearPart} from the Torah For The Table archive — printable PDFs for children, families, and deeper Torah learning.`
      : "Browse the archive of past weekly Divrei Torah collections for Shabbos and Yom Tov.";

    const base = "https://torahforthetable.com/archive";
    const canonicalParams = new URLSearchParams();
    if (parshaLabel) {
      canonicalParams.set("parsha", search.parsha);
      if (search.year !== "all") canonicalParams.set("year", search.year);
    }
    const url = canonicalParams.toString() ? `${base}?${canonicalParams}` : base;

    const image = parshaLabel
      ? `${base.replace("/archive", "")}/og/image.png?parsha=${encodeURIComponent(search.parsha)}`
      : "https://torahforthetable.com/og-image.png";

    const items = (loaderData?.years ?? [])
      .flatMap((y) => y.parshiyos.flatMap((p) => p.pdfs))
      .slice(0, 50)
      .map((pdf, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://torahforthetable.com/view/${pdf.id}`,
        name: pdf.title,
      }));

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah For The Table" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description,
            url,
            isPartOf: {
              "@type": "WebSite",
              name: "Torah For The Table",
              url: "https://torahforthetable.com",
            },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: items.length,
              itemListElement: items,
            },
          }),
        },
      ],
    };
  },
  errorComponent: ArchiveError,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/" className="text-primary underline">Go home</Link>
    </div>
  ),
});

function ArchivePage() {
  const {
    years,
    yearOptions,
    allParshiyos,
    typeOptions,
    publicationOptions,
    audienceCounts,
    totalPdfs,
    totalPages,
    safePage,
    archiveTotal,
  } = Route.useLoaderData();
  const committedSearch = Route.useSearch();
  // While new results load, the router still serves the previous match's
  // search. Controls follow the requested URL so a reader's choice stays
  // visible (and is not reverted) during "Updating results…".
  const requestedSearch = useRouterState({
    select: (s) => (s.location.pathname === "/archive" ? s.location.search : null),
  });
  const search = parseArchiveSearch((requestedSearch ?? committedSearch) as Record<string, unknown>);
  const navigate = useNavigate({ from: Route.fullPath });

  const yearFilter = search.year;
  const parshaFilter = search.parsha;
  const audienceFilter = search.audience;
  const query = search.q;
  const lengthFilter = search.length;
  const typeFilter = search.type;
  const pubFilter = search.pub;
  const page = search.page;
  const PAGE_SIZE = 48;

  const isUpdating = useRouterState({
    select: (s) => s.status === "pending" && s.location.pathname === "/archive",
  });

  const setSearch = (patch: ArchiveSearch, replace = false) => {
    void navigate({
      search: (prev: Record<string, unknown>) => nextArchiveSearch(prev, patch) as never,
      replace,
      resetScroll: false,
    });
  };

  const setYearFilter = (year: string) => setSearch({ year });
  const setParshaFilter = (parsha: string) => setSearch({ parsha });
  const setAudienceFilter = (audience: ArchiveSearch["audience"]) => setSearch({ audience });
  const setLengthFilter = (length: ArchiveSearch["length"]) => setSearch({ length });
  const setTypeFilter = (type: string) => setSearch({ type });
  const setPubFilter = (pub: string) => setSearch({ pub });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [queryDraft, setQueryDraft] = useState(query);
  const lastPushedQuery = useRef(query);
  useEffect(() => {
    if (query !== lastPushedQuery.current) {
      lastPushedQuery.current = query;
      setQueryDraft(query);
    }
  }, [query]);
  useEffect(() => {
    if (queryDraft === query) return;
    const t = setTimeout(() => {
      lastPushedQuery.current = queryDraft;
      setSearch({ q: queryDraft }, true);
    }, 300);
    return () => clearTimeout(t);
  }, [queryDraft, query]);

  const filteredYears = years as ArchiveYear[];
  const pagedYears = filteredYears;

  usePrewarmDownloads(
    useMemo(
      () =>
        pagedYears
          .flatMap((y) => y.parshiyos.flatMap((p) => p.pdfs.map((r) => r.id)))
          .slice(0, 6),
      [pagedYears],
    ),
  );

  // Search analytics use the committed (loaded) query so result_count always
  // belongs to that query, never to the previous results still on screen.
  const committedQuery = parseArchiveSearch(committedSearch as Record<string, unknown>).q;
  const loggedQuery = useRef<string | null>(null);
  useEffect(() => {
    const q = committedQuery.trim();
    if (!q) return;
    if (loggedQuery.current === q) return;
    loggedQuery.current = q;
    trackSearch(q, totalPdfs);
    trackFp("search", { metadata: { query: q.slice(0, 200), result_count: totalPdfs } });
  }, [committedQuery, totalPdfs]);

  const hasActiveFilters =
    yearFilter !== "all" ||
    parshaFilter !== "all" ||
    query.trim() !== "" ||
    audienceFilter !== "All" ||
    lengthFilter !== "All" ||
    typeFilter !== "All" ||
    pubFilter !== "All";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-14 space-y-5 sm:space-y-8 md:space-y-10">
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-[2rem] leading-[1.05] sm:text-5xl md:text-6xl font-bold tracking-tight text-primary">
              Archive
            </h1>
            <p className="mt-4 font-serif italic text-base sm:text-lg md:text-xl text-accent max-w-2xl mx-auto">
              Past weeks' Divrei Torah, organized by Jewish year and Parshas.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 sm:gap-4 text-accent">
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
              <span className="font-sans text-[11px] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.3em]">
                {archiveTotal} {archiveTotal === 1 ? "Dvar" : "Divrei"} Torah · All years
              </span>
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
            </div>
            <div className="mt-6">
              <Link
                to="/"
                className="text-sm font-medium text-accent hover:text-primary transition-colors"
              >
                ← Back to this week
              </Link>
            </div>
          </div>
        </section>

        {parshaFilter !== "all" && !isYomTovReading(parshaFilter) && (
          <section className="rounded-xl border border-accent/30 bg-card/25 px-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Looking for the permanent parsha page?{" "}
              <Link
                to="/parsha/$slug"
                params={{ slug: readingSlug(parshaFilter) }}
                className="font-semibold text-primary underline decoration-accent/60 underline-offset-4 hover:text-accent"
              >
                Browse all Divrei Torah for {formatReadingLabel(parshaFilter)}
              </Link>
              .
            </p>
          </section>
        )}

        {years.length > 0 && (
          <section className="parchment-frame">
            <div className="parchment-panel">
              <div className="sm:hidden">
                <label htmlFor="archive-mobile-search" className="mb-1.5 block text-xs font-semibold text-primary">Search Divrei Torah</label>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="archive-mobile-search" type="search" value={queryDraft}
                    onChange={(event) => setQueryDraft(event.target.value)}
                    placeholder={PUBLIC_ARCHIVE_SEARCH_PLACEHOLDER}
                    className={`min-h-11 w-full rounded-lg border-2 py-2 pl-9 pr-3 text-sm ${PUBLIC_FILTER_FIELD_TONE}`} />
                </div>
                <button type="button" aria-expanded={mobileFiltersOpen} aria-controls="archive-mobile-filter-options"
                  onClick={() => setMobileFiltersOpen((open) => !open)}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent/50 bg-background px-3 py-2 text-sm font-semibold text-primary hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                  {mobileFiltersOpen ? "Hide Filters" : "Show Filters"}
                  {hasActiveFilters && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs">Active</span>}
                  <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`} />
                </button>
                <p className="mt-2 text-sm text-muted-foreground">
                  {totalPdfs} {totalPdfs === 1 ? "result" : "results"} available
                </p>
                {hasActiveFilters && (
                  <button type="button" onClick={() => {
                    setQueryDraft("");
                    lastPushedQuery.current = "";
                    void navigate({ search: {} as never, resetScroll: false });
                  }} className="mt-1 min-h-11 text-sm font-semibold text-primary underline underline-offset-4">
                    Clear all filters
                  </button>
                )}
              </div>
              <div id="archive-mobile-filter-options" className={`${mobileFiltersOpen ? "block" : "hidden"} sm:block`}>
              <div className="mb-4 flex flex-col items-center gap-2 border-b border-accent/20 pb-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Yamim Noraim
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {["Rosh Hashanah", "Yom Kippur"].map((holiday) => {
                    const active = parshaFilter === holiday;
                    const available = allParshiyos.includes(holiday);
                    return available ? (
                      <button
                        key={holiday}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setParshaFilter(active ? "all" : holiday)}
                        className={`min-h-11 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ${publicFilterTone(active)}`}
                      >
                        {holiday}
                      </button>
                    ) : null;
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:gap-4 sm:grid-cols-[1fr_1fr_2fr] items-end">
                <label className="block text-left">
                  <span className="block font-sans text-[11px] uppercase tracking-[0.2em] text-accent mb-1.5">
                    Jewish Year
                  </span>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className={`min-h-11 w-full rounded-lg border-2 px-3 py-2 font-serif text-sm ${PUBLIC_FILTER_FIELD_TONE}`}
                  >
                    <option value="all">All years</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-left">
                  <span className="block font-sans text-[11px] uppercase tracking-[0.2em] text-accent mb-1.5">
                    Parshas
                  </span>
                  <select
                    value={parshaFilter}
                    onChange={(e) => setParshaFilter(e.target.value)}
                    className={`min-h-11 w-full rounded-lg border-2 px-3 py-2 font-serif text-sm ${PUBLIC_FILTER_FIELD_TONE}`}
                  >
                    <option value="all">All Parshas</option>
                    {allParshiyos.map((p) => (
                      <option key={p} value={p}>
                        {displayReadingName(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hidden text-left sm:block">
                  <span className="block font-sans text-[11px] uppercase tracking-[0.2em] text-accent mb-1.5">
                    Search
                  </span>
                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={queryDraft}
                      onChange={(e) => setQueryDraft(e.target.value)}
                      placeholder={PUBLIC_ARCHIVE_SEARCH_PLACEHOLDER}
                      className={`min-h-11 w-full rounded-lg border-2 pl-9 pr-3 py-2 font-serif text-sm ${PUBLIC_FILTER_FIELD_TONE}`}
                    />
                  </div>
                </label>
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Filter by audience
                </span>
                <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-accent/40 bg-background/70 p-1 shadow-sm">
                  {(["All", "Children", "Families", "Adults"] as const)
                    .map((audience) => ({ audience, count: audienceCounts[audience] }))
                    .filter(({ audience, count }) => audience === "All" || count > 0)
                    .map(({ audience, count }) => {
                      const active = audienceFilter === audience;
                      return (
                        <button
                          key={audience}
                          type="button"
                          aria-pressed={active}
                          aria-label={`Filter by audience: ${audienceLabel(audience)}, ${selectionCountLabel(count)}`}
                          onClick={() => setAudienceFilter(active ? "All" : audience)}
                          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ${
                            publicFilterTone(active, "segmented")
                          }`}
                        >
                          {audienceLabel(audience)}
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums ${
                              PUBLIC_FILTER_COUNT_TONE(active)
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                </div>
                {audienceCounts.All > audienceCounts.Children + audienceCounts.Families + audienceCounts.Adults && <p className="text-xs text-muted-foreground">{`${audienceCounts.All - audienceCounts.Children - audienceCounts.Families - audienceCounts.Adults} selections without a specified audience are included in All.`}</p>}
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Filter by length
                </span>
                <div className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-accent/40 bg-background/70 p-1 shadow-sm">
                  {[
                    ...LENGTH_OPTIONS,
                    ...(lengthFilter === "long" ? [{ key: "long" as const, label: "5+ Pages (legacy)" }] : []),
                  ].map(({ key: value, label }) => {
                    const active = lengthFilter === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setLengthFilter(active ? "All" : value)}
                        className={`min-h-11 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ${
                          publicFilterTone(active, "segmented")
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(typeOptions.length > 0 || publicationOptions.length > 0) && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {typeOptions.length > 0 && (
                    <label className="block text-left">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Content type
                      </span>
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className={`min-h-11 w-full rounded-lg border-2 px-3 py-2 font-serif text-sm ${PUBLIC_FILTER_FIELD_TONE}`}
                      >
                        <option value="All">All content types</option>
                        {typeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {publicationOptions.length > 0 && (
                    <label className="block text-left">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Publication
                      </span>
                      <select
                        value={pubFilter}
                        onChange={(e) => setPubFilter(e.target.value)}
                        className={`min-h-11 w-full rounded-lg border-2 px-3 py-2 font-serif text-sm ${PUBLIC_FILTER_FIELD_TONE}`}
                      >
                        <option value="All">All publications</option>
                        {publicationOptions.map((p) => (
                          <option key={p} value={p}>
                            {publicationLabel(p) ?? p}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {hasActiveFilters && (
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Showing {totalPdfs} {totalPdfs === 1 ? "result" : "results"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setQueryDraft("");
                      lastPushedQuery.current = "";
                      void navigate({ search: {} as never, resetScroll: false });
                    }}
                    className="inline-flex min-h-11 items-center text-accent hover:text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Clear filters
                  </button>
                </div>
              )}
              </div>
            </div>
          </section>
        )}

        <div role="status" aria-live="polite" className={isUpdating ? "flex items-center justify-center" : "sr-only"}>
          {isUpdating ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-background px-3 py-1 text-sm font-semibold text-primary shadow-sm">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Updating results…
            </span>
          ) : (
            <span>{`${totalPdfs} ${totalPdfs === 1 ? "result" : "results"} shown`}</span>
          )}
        </div>

        <div aria-busy={isUpdating}>
        {isUpdating ? (
          <div aria-hidden="true" className="min-h-48 space-y-4 rounded-xl border border-accent/30 bg-card/50 p-4 sm:p-6">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : archiveTotal === 0 ? (
          <section className="parchment-frame">
            <div className="parchment-panel text-center">
              <p className="font-serif text-xl sm:text-2xl text-primary">
                No archived issues yet.
              </p>
              <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
                Past weeks' Divrei Torah will appear here once prior editions exist.
              </p>
            </div>
          </section>
        ) : totalPdfs === 0 ? (
          <section className="parchment-frame">
            <div className="parchment-panel text-center">
              <p className="font-serif text-xl sm:text-2xl text-primary">
                No matches for these filters.
              </p>
              <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
                Try clearing the search or choosing a different Parshas or year.
              </p>
            </div>
          </section>
        ) : (
          <div id="archive-results" className="space-y-5 sm:space-y-8 md:space-y-10">
            {pagedYears.map((y: ArchiveYear) => (
              <section key={y.year} className="parchment-frame">
                <div className="parchment-panel">
                  <div className="flex items-baseline justify-between gap-4 border-b-2 border-accent/30 pb-4 mb-6">
                    <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-primary">
                      {y.year}
                    </h2>
                    {(() => {
                      const pageCount = y.parshiyos.reduce((s: number, p: ArchiveParsha) => s + p.pdfs.length, 0);
                      const pdfCount = y.totalPdfs ?? pageCount;
                      const readingCount = y.totalParshiyos ?? y.parshiyos.length;
                      return (
                        <span className="font-sans text-xs sm:text-sm uppercase tracking-[0.2em] text-accent">
                          {`${readingCount} ${readingCount === 1 ? "Reading" : "Readings"} · ${pdfCount} ${pdfCount === 1 ? "Dvar" : "Divrei"} Torah${y.totalPdfs === undefined ? " on this page" : pageCount !== pdfCount ? ` · ${pageCount} on this page` : ""}`}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="space-y-8">
                    {y.parshiyos.map((p: ArchiveParsha) => (
                      <div key={`${y.year}-${p.parshaKey}`}>
                        <h3 className="font-serif text-xl sm:text-2xl font-semibold text-primary mb-4">
                          {isYomTovReading(p.parshaKey) ? (
                            formatReadingLabel(p.parshaKey)
                          ) : (
                            <Link
                              to="/parsha/$slug"
                              params={{ slug: readingSlug(p.parshaKey) }}
                              className="hover:text-accent hover:underline decoration-accent/60 underline-offset-4"
                            >
                              {formatReadingLabel(p.parshaKey)}
                            </Link>
                          )}
                        </h3>
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                          {p.pdfs.map((r: ArchivePdf) => (
                            <PublicationCardTracker
                              key={r.id}
                              className="rounded-2xl border-2 border-accent/40 bg-background/60 p-4 sm:p-5 hover:border-accent hover:shadow-md transition-[color,background-color,border-color,box-shadow] duration-150 flex flex-col"
                              publication_id={r.id}
                              publication_title={r.title}
                              publication_series={r.publication ?? null}
                              publisher={r.publisher ?? null}
                              parsha={p.parshaKey ?? null}
                            >
                              <div className="flex items-start gap-2.5 sm:gap-3">
                                <PdfCoverThumbnail pdfId={r.id} coverContext="archive" thumbnailUrl={r.thumb_url} smallThumbnailUrl={r.small_thumb_url} title={r.title} publicationName={r.publication} publisher={r.publisher} parsha={p.parshaKey} jewishYear={y.year} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-2">
                                    <h4 className="min-w-0 w-full flex-1 break-words font-serif text-base font-bold leading-snug text-primary sm:text-lg">
                                      <Link
                                        to="/view/$id"
                                        params={{ id: r.id }}
                                        className="hover:text-accent hover:underline transition-colors duration-150"
                                      >
                                        {r.title}
                                      </Link>
                                    </h4>

                                    {r.badge && (
                                      <span className="shrink-0 rounded-full border border-accent bg-accent/20 px-2 py-0.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-primary">
                                        {r.badge}
                                      </span>
                                    )}
                                  </div>
                                  {r.publisher ? (
                                    <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">
                                      By {r.publisher}
                                    </p>
                                  ) : r.publication && publicationLabel(r.publication) !== r.title ? (
                                    <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">
                                      From {publicationLabel(r.publication)}
                                    </p>
                                  ) : null}
                                  <PublicationQuickFacts
                                    audience={audienceLabel(normalizeAudience(r.audience, r.title)) ?? r.audience}
                                    format={resourceType(r)}
                                    length={typeof r.page_count === "number" && r.page_count > 0
                                      ? r.page_count >= 20
                                        ? `Long Study · ${r.page_count} pages`
                                        : `${r.page_count} ${r.page_count === 1 ? "page" : "pages"}`
                                      : null}
                                  />
                                  {(r.subtitle || r.description) && (
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                      {leadWithPublicationTitle(r.title, r.subtitle || r.description)}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4">
                                <DownloadAndPrintButtons
                                  href={`/view/${r.id}/pdf`}
                                  publicationId={r.id}
                                  publicationName={publicationLabel(r.publication) || r.title}
                                  publicationTitle={r.title}
                                  publisher={r.publisher}
                                  publicationSeries={r.publication}
                                  parsha={p.parshaKey}
                                  labelYear={y.year}
                                  className="w-full"
                                />
                                <div className="mt-2 flex justify-center">
                                  <SharePublicationButton
                                    pdfId={r.id}
                                    title={r.title}
                                    parsha={p.parshaKey}
                                  />
                                </div>
                              </div>
                            </PublicationCardTracker>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}

        </div>

        {filteredYears.length > 0 && totalPages > 1 && (
          <nav aria-label="Archive pages" className="flex flex-wrap items-center justify-center gap-3">
            {safePage > 1 && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => setSearch({ page: safePage - 1 })}
                className="inline-flex min-h-11 items-center rounded-full border border-accent/45 bg-background px-4 py-2 text-sm font-semibold text-primary hover:bg-accent/10"
              >
                ← Previous
              </button>
            )}
            <span className="text-sm text-muted-foreground">
              {isUpdating ? `Loading page ${page}…` : `Page ${safePage} of ${totalPages} · ${totalPdfs} results`}
            </span>
            <label className="flex items-center gap-2 text-sm text-primary">Go to page<select aria-label="Go to archive page" disabled={isUpdating} value={safePage} onChange={(event) => setSearch({ page: Number(event.target.value) })} className={`min-h-11 rounded-md border px-2 ${PUBLIC_FILTER_FIELD_TONE}`}>{Array.from({ length: totalPages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
            {safePage < totalPages && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => setSearch({ page: safePage + 1 })}
                className="inline-flex min-h-11 items-center rounded-full border border-accent/45 bg-background px-4 py-2 text-sm font-semibold text-primary hover:bg-accent/10"
              >
                Next →
              </button>
            )}
          </nav>
        )}

        <BackToTop collectionId="archive-results" />
        <SiteFooter />
      </div>
    </div>
  );
}
