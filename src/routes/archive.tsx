import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { listArchive, type ArchiveYear, type ArchiveParsha, type ArchivePdf } from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";
import { trackSearch } from "@/lib/site-analytics";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { BackToTop } from "@/components/BackToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { buildDownloadFilename } from "@/lib/download-filename";
import { normalizeAudience, type AudienceKey } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { standardizeCopy } from "@/lib/standardize-copy";

type ArchiveSearch = {
  year: string;
  parsha: string;
  audience: "All" | AudienceKey;
  q: string;
};

const AUDIENCE_VALUES = ["All", "Children", "Families", "Adults"] as const;

/** Lenient parsing: any unexpected value falls back to the default. */
function parseArchiveSearch(input: Record<string, unknown>): ArchiveSearch {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const audience = str(input['audience']) as ArchiveSearch["audience"];
  return {
    year: str(input['year']).slice(0, 10) || "all",
    parsha: str(input['parsha']).slice(0, 60) || "all",
    audience: (AUDIENCE_VALUES as readonly string[]).includes(audience) ? audience : "All",
    q: str(input['q']).slice(0, 100),
  };
}

/** Keep default-valued params out of the URL so a clean /archive stays clean. */
function stripDefaults(s: ArchiveSearch) {
  const out: Partial<ArchiveSearch> = {};
  if (s.year !== "all") out.year = s.year;
  if (s.parsha !== "all") out.parsha = s.parsha;
  if (s.audience !== "All") out.audience = s.audience;
  if (s.q) out.q = s.q;
  return out;
}




export const Route = createFileRoute("/archive")({
  component: ArchivePage,
  loader: () => listArchive(),
  // Filters live in the URL, but they must not re-run the loader.
  validateSearch: (search: Record<string, unknown>): ArchiveSearch =>
    parseArchiveSearch(search),
  // Default values never appear in the URL, so a clean /archive stays clean.
  search: {
    middlewares: [
      stripSearchParams({ year: "all", parsha: "all", audience: "All", q: "" }),
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
        ? /^(parshas|parashat)\s/i.test(search.parsha)
          ? search.parsha
          : `Parshas ${search.parsha}`
        : null;
    const yearPart = search.year !== "all" ? ` ${search.year}` : "";

    const title = parshaLabel
      ? `${parshaLabel}${yearPart} — Archive | Torah for the Table`
      : "Archive — Torah for the Table";
    const description = parshaLabel
      ? `Printable Divrei Torah for ${parshaLabel}${yearPart} from the Torah for the Table archive — free downloads for children, families, and adults.`
      : "Browse the archive of past weekly Divrei Torah collections for Shabbos and Yom Tov.";

    // Filtered permutations canonicalize to their own parsha/year URL; everything
    // else points at the bare /archive so indexing doesn't fragment.
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
        { property: "og:site_name", content: "Torah for the Table" },
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
              name: "Torah for the Table",
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
  errorComponent: ({ error }) => {
    console.error("Archive load error", error);
    return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="parchment-frame max-w-md w-full">
        <div className="parchment-panel text-center">
          <h1 className="font-serif text-2xl text-primary">Archive unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">Could not load archive right now. Please try again later.</p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/" className="text-primary underline">Go home</Link>
    </div>
  ),
});

function ArchivePage() {
  const { years } = Route.useLoaderData() as { years: ArchiveYear[] };
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const yearFilter = search.year;
  const parshaFilter = search.parsha;
  const audienceFilter = search.audience;
  const query = search.q;

  const setSearch = (patch: Partial<ArchiveSearch>, replace = false) => {
    void navigate({
      search: (prev: Record<string, unknown>) =>
        stripDefaults(parseArchiveSearch({ ...prev, ...patch })) as never,
      replace,
      resetScroll: false,
    });
  };

  const setYearFilter = (year: string) => setSearch({ year });
  const setParshaFilter = (parsha: string) => setSearch({ parsha });
  const setAudienceFilter = (audience: ArchiveSearch["audience"]) => setSearch({ audience });

  // The search box stays instant locally; URL writes are debounced and replace
  // history so typing doesn't create a back-button entry per keystroke.
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


  const allParshiyos = useMemo(() => {
    const set = new Set<string>();
    for (const y of years) for (const p of y.parshiyos) set.add(p.parshaKey);
    return Array.from(set).sort();
  }, [years]);

  const filteredYears = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: ArchiveYear[] = [];
    for (const y of years) {
      if (yearFilter !== "all" && String(y.year) !== yearFilter) continue;
      const parshiyos: ArchiveParsha[] = [];
      for (const p of y.parshiyos) {
        if (parshaFilter !== "all" && p.parshaKey !== parshaFilter) continue;
        let pdfs = q
          ? p.pdfs.filter((r) =>
              [r.title, r.subtitle, r.description]
                .filter(Boolean)
                .some((v) => (v as string).toLowerCase().includes(q)),
            )
          : p.pdfs;
        if (audienceFilter !== "All") {
          pdfs = pdfs.filter(
            (r) => normalizeAudience(r.audience, r.title) === audienceFilter,
          );
        }
        if (pdfs.length) parshiyos.push({ ...p, pdfs });
      }
      if (parshiyos.length) out.push({ ...y, parshiyos });
    }
    return out;
  }, [years, yearFilter, parshaFilter, query, audienceFilter]);

  // Audience counts reflect the other active filters (year, parsha, search).
  const audienceCounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const counts: Record<"All" | AudienceKey, number> = {
      All: 0,
      Children: 0,
      Families: 0,
      Adults: 0,
    };
    for (const y of years) {
      if (yearFilter !== "all" && String(y.year) !== yearFilter) continue;
      for (const p of y.parshiyos) {
        if (parshaFilter !== "all" && p.parshaKey !== parshaFilter) continue;
        for (const r of p.pdfs) {
          if (
            q &&
            ![r.title, r.subtitle, r.description]
              .filter(Boolean)
              .some((v) => (v as string).toLowerCase().includes(q))
          )
            continue;
          counts.All += 1;
          const a = normalizeAudience(r.audience, r.title);
          if (a) counts[a] += 1;
        }
      }
    }
    return counts;
  }, [years, yearFilter, parshaFilter, query]);

  const totalPdfs = filteredYears.reduce(
    (sum: number, y: ArchiveYear) =>
      sum + y.parshiyos.reduce((s: number, p: ArchiveParsha) => s + p.pdfs.length, 0),
    0,
  );

  // Log one search_events row per settled (debounced) search term, with the
  // number of results it returned. Fails silently.
  const loggedQuery = useRef<string | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    if (loggedQuery.current === q) return;
    loggedQuery.current = q;
    trackSearch(q, totalPdfs);
  }, [query, totalPdfs]);


  const hasActiveFilters =
    yearFilter !== "all" ||
    parshaFilter !== "all" ||
    query.trim() !== "" ||
    audienceFilter !== "All";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-14 space-y-5 sm:space-y-8 md:space-y-10">
        {/* Header */}
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
              <span className="font-sans text-[0.6rem] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.3em]">
                {totalPdfs} {totalPdfs === 1 ? "Dvar" : "Divrei"} Torah
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

        {/* Filters */}
        {years.length > 0 && (
          <section className="parchment-frame">
            <div className="parchment-panel">
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-[1fr_1fr_2fr] items-end">
                <label className="block text-left">
                  <span className="block font-sans text-[0.65rem] uppercase tracking-[0.2em] text-accent mb-1.5">
                    Jewish Year
                  </span>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="w-full rounded-lg border-2 border-accent/40 bg-background/60 px-3 py-2 font-serif text-sm text-foreground focus:border-accent focus:outline-none"
                  >
                    <option value="all">All years</option>
                    {years.map((y) => (
                      <option key={y.year} value={String(y.year)}>
                        {y.year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-left">
                  <span className="block font-sans text-[0.65rem] uppercase tracking-[0.2em] text-accent mb-1.5">
                    Parshas
                  </span>
                  <select
                    value={parshaFilter}
                    onChange={(e) => setParshaFilter(e.target.value)}
                    className="w-full rounded-lg border-2 border-accent/40 bg-background/60 px-3 py-2 font-serif text-sm text-foreground focus:border-accent focus:outline-none"
                  >
                    <option value="all">All Parshas</option>
                    {allParshiyos.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-left">
                  <span className="block font-sans text-[0.65rem] uppercase tracking-[0.2em] text-accent mb-1.5">
                    Search
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent/70" />
                    <input
                      type="search"
                      value={queryDraft}
                      onChange={(e) => setQueryDraft(e.target.value)}
                      placeholder="Search publication name or description…"
                      className="w-full rounded-lg border-2 border-accent/40 bg-background/60 pl-9 pr-3 py-2 font-serif text-sm text-foreground focus:border-accent focus:outline-none"
                    />
                  </div>
                </label>
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                          aria-label={`Filter by audience: ${audience}, ${count} ${count === 1 ? "publication" : "publications"}`}
                          onClick={() => setAudienceFilter(active ? "All" : audience)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-200 ${
                            active
                              ? "bg-accent text-accent-foreground shadow-sm"
                              : "text-primary hover:bg-accent/12"
                          }`}
                        >
                          {audience}
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none tabular-nums ${
                              active
                                ? "bg-accent-foreground/20 text-accent-foreground"
                                : "bg-accent/15 text-accent"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

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
                    className="text-accent hover:text-primary underline"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </section>
        )}


        {years.length === 0 ? (
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
        ) : filteredYears.length === 0 ? (
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
            {filteredYears.map((y: ArchiveYear) => (

              <section key={y.year} className="parchment-frame">
                <div className="parchment-panel">
                  <div className="flex items-baseline justify-between gap-4 border-b-2 border-accent/30 pb-4 mb-6">
                    <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-primary">
                      {y.year}
                    </h2>
                    {(() => {
                      const pdfCount = y.parshiyos.reduce((s: number, p: ArchiveParsha) => s + p.pdfs.length, 0);
                      return (
                        <span className="font-sans text-xs sm:text-sm uppercase tracking-[0.2em] text-accent">
                          {y.parshiyos.length} {y.parshiyos.length === 1 ? "Parshas" : "Parshas"} · {pdfCount} {pdfCount === 1 ? "Dvar" : "Divrei"} Torah
                        </span>
                      );
                    })()}
                  </div>
                  <div className="space-y-8">
                    {y.parshiyos.map((p: ArchiveParsha) => (
                      <div key={`${y.year}-${p.parshaKey}`}>
                        <h3 className="font-serif text-xl sm:text-2xl font-semibold text-primary mb-4">
                          Parshas {p.parshaKey}
                        </h3>
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                          {p.pdfs.map((r: ArchivePdf) => (
                            <article
                              key={r.id}
                              className="rounded-2xl border-2 border-accent/40 bg-background/60 p-4 sm:p-5 hover:border-accent hover:shadow-md transition-[color,background-color,border-color,box-shadow] duration-150 flex flex-col"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-accent/15 text-primary shrink-0">
                                  <FileText className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="font-serif text-base sm:text-lg font-bold text-primary line-clamp-2 leading-snug">
                                      {r.title}
                                    </h4>
                                    {r.badge && (
                                      <span className="shrink-0 rounded-full border border-accent bg-accent/20 px-2 py-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-primary">
                                        {r.badge}
                                      </span>
                                    )}
                                  </div>
                                  {r.publisher && (
                                    <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">
                                      By {r.publisher}
                                    </p>
                                  )}
                                  {r.subtitle && (
                                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                      {standardizeCopy(r.subtitle)}
                                    </p>
                                  )}
                                  {r.description && (
                                    <p className="mt-2 text-sm text-foreground/85 leading-snug">
                                      {standardizeCopy(r.description)}
                                    </p>
                                  )}
                                  {(r.audience || r.format_type || typeof r.page_count === "number") && (
                                    <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                      {[
                                        r.audience,
                                        formatTypeLabel(r.format_type),
                                        typeof r.page_count === "number"
                                          ? `${r.page_count} ${r.page_count === 1 ? "page" : "pages"}`
                                          : null,
                                      ].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4">
                                <DownloadToPrintButton
                                  href={`/view/${r.id}/download`}
                                  publicationId={r.id}
                                  publicationTitle={r.title}
                                  filename={buildDownloadFilename(
                                    p.parshaKey,
                                    (r as { publication?: string | null }).publication || r.title,
                                  )}

                                  onClick={() => {
                                    trackEvent("pdf_download", {
                                      file_id: r.id,
                                      file_title: r.title,
                                      source_name: r.title,
                                      parsha: p.parshaKey,
                                      jewish_year: y.year,
                                    });
                                    if (typeof window !== "undefined") {
                                      window.dispatchEvent(new CustomEvent("tftt:download-clicked"));
                                    }
                                  }}
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
                            </article>
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

        <SiteFooter />
      </div>
      <BackToTop collectionId="archive-results" />
    </div>
  );
}
