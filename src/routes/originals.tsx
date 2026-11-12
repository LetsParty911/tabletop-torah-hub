import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { fitPageTitle } from "@/lib/page-title";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { listOriginalEditions } from "@/integrations/supabase/api.functions";
import { recordPdfAction } from "@/components/DownloadToPrintButton";
import { pdfActionHrefs } from "@/lib/collection-status";
import {
  originalsPageDescription,
  visibleOriginalSeries,
  type OriginalEditionCard,
  type OriginalEditionGroup,
} from "@/lib/original-editions";

export const Route = createFileRoute("/originals")({
  component: ResourcesPage,
  loader: () => listOriginalEditions(),
  head: ({ loaderData }) => {
    const title = fitPageTitle("Our Originals", " — In-House Torah Learning Resources");
    const description = originalsPageDescription(visibleOriginalSeries(loaderData?.activeSeriesIds));
    const url = "https://torahforthetable.com/originals";
    const image = "https://torahforthetable.com/og-image.png";
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
    };
  },
});

type SeriesCard = {
  title: string;
  description: string;
  sample: string;
  linkTo: string;
  linkSearch?: Record<string, string>;
  cta: string;
};

// The three weekly series always show (unchanged). A configured additional
// series (The Parsha Detective) appears only once it has a published edition.
function originalSeriesCards(activeSeriesIds: readonly string[] | undefined): SeriesCard[] {
  return visibleOriginalSeries(activeSeriesIds).map((series) => ({
    title: series.title,
    description: series.shortDescription,
    sample: series.expectation,
    linkTo: "/archive",
    linkSearch: { q: series.title },
    cta: `Browse ${series.title} →`,
  }));
}

const FEATURED_SERIES: SeriesCard[] = [
  {
    title: "Mi Ka'amcha Yisroel",
    description:
      "An independent weekly series, shared here with our collection. Each installment uses the parsha to discuss communication and positive speech — how the words we choose shape our homes and relationships.",
    sample: "Not written by Torah For The Table. Shared as part of our weekly collection.",
    linkTo: "/archive",
    linkSearch: { q: "Mi Ka'amcha Yisroel" },
    cta: "Browse Mi Ka'amcha Yisroel →",
  },
];

function SeriesGrid({ items }: { items: SeriesCard[] }) {
  return (
    <div className={`mt-6 grid grid-cols-1 ${items.length === 4 ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-5 max-w-2xl mx-auto`}>
      {items.map((s) => (
        <article key={s.title} className="flex flex-col rounded-xl border border-accent/30 bg-card/40 p-5">
          <h3 className="font-serif text-xl font-bold text-primary">{s.title}</h3>
          <p className="mt-2 font-serif text-sm sm:text-base leading-relaxed text-foreground">{s.description}</p>
          <p className="mt-3 flex-1 rounded-lg border border-accent/20 bg-background/50 px-3 py-2 text-xs sm:text-sm text-muted-foreground">
            {s.sample}
          </p>
          <p className="mt-4 text-sm sm:text-base">
            <Link to={s.linkTo} search={s.linkSearch} className="text-accent underline hover:text-primary">
              {s.cta}
            </Link>
          </p>
        </article>
      ))}
    </div>
  );
}

const RECENT_GROUP_COUNT = 2;

function trackOpen(
  event: React.MouseEvent<HTMLAnchorElement>,
  edition: OriginalEditionCard,
  group: OriginalEditionGroup,
  entryPoint: "button" | "thumbnail",
) {
  recordPdfAction(event, "open_pdf", pdfActionHrefs(edition.id).open, {
    publicationId: edition.id,
    publicationName: edition.seriesTitle,
    publicationTitle: edition.seriesTitle,
    publicationSeries: edition.seriesTitle,
    publisher: "Torah For The Table",
    parsha: group.parshaKey,
    jewishYear: group.jewishYear,
  }, entryPoint);
}

function EditionCover({ edition, group }: { edition: OriginalEditionCard; group: OriginalEditionGroup }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!edition.thumbUrl && !failed;
  return (
    <a
      href={pdfActionHrefs(edition.id).open}
      target="_blank"
      rel="nofollow noopener noreferrer"
      onClick={(event) => trackOpen(event, edition, group, "thumbnail")}
      aria-label={`Open PDF in a new tab: ${edition.seriesTitle}, ${group.label}`}
      className="group block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="aspect-[17/22] w-full overflow-hidden rounded-md border border-accent/40 bg-card shadow-sm transition-colors group-hover:border-accent">
        {showImage ? (
          <img
            src={edition.thumbUrl ?? undefined}
            alt={`First page of ${edition.seriesTitle}, ${group.label}`}
            width={340}
            height={440}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-card to-background px-3 text-center">
            <BookOpen className="h-6 w-6 text-accent" aria-hidden="true" />
            <span className="font-serif text-sm font-bold leading-snug text-primary">{edition.seriesTitle}</span>
            <span className="text-[11px] text-muted-foreground">{group.label}</span>
          </div>
        )}
      </div>
    </a>
  );
}

function EditionGroup({ group }: { group: OriginalEditionGroup }) {
  const headingId = `editions-${group.key.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h3 id={headingId} className="font-serif text-lg sm:text-xl font-bold text-primary border-b border-accent/30 pb-1">
        {group.label}
      </h3>
      <ul className={`mt-4 grid grid-cols-2 gap-4 ${group.editions.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {group.editions.map((edition) => (
          <li key={edition.id} className="flex min-w-0 flex-col rounded-xl border border-accent/30 bg-background/60 p-3">
            <EditionCover edition={edition} group={group} />
            <p className="mt-3 font-serif text-sm sm:text-base font-bold leading-snug text-primary">{edition.seriesTitle}</p>
            <p className="mt-0.5 flex-1 text-xs text-muted-foreground">{group.label}</p>
            <a
              href={pdfActionHrefs(edition.id).open}
              target="_blank"
              rel="nofollow noopener noreferrer"
              onClick={(event) => trackOpen(event, edition, group, "button")}
              aria-label={`Read Now in a new tab: ${edition.seriesTitle}, ${group.label}`}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Read Now</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OriginalEditions({ groups, seriesCount }: { groups: OriginalEditionGroup[]; seriesCount: number }) {
  const [showEarlier, setShowEarlier] = useState(false);
  if (groups.length === 0) return null;
  const recent = groups.slice(0, RECENT_GROUP_COUNT);
  const earlier = groups.slice(RECENT_GROUP_COUNT);
  return (
    <div className="mt-8 max-w-2xl mx-auto">
      <h2 className="text-center font-serif text-2xl font-bold text-primary">Our Original Editions</h2>
      <p className="mt-2 text-center font-serif text-sm sm:text-base text-muted-foreground">
        {seriesCount > 3
          ? "The latest issues of our original series, ready to read or print."
          : "The latest issues of our three weekly series, ready to read or print."}
      </p>
      {recent.map((group) => <EditionGroup key={group.key} group={group} />)}
      {earlier.length > 0 && (
        <div className="mt-6 text-center">
          <h2 className="font-serif text-xl font-bold text-primary">Browse earlier editions</h2>
          {showEarlier && earlier.map((group) => <EditionGroup key={group.key} group={group} />)}
          <button
            type="button"
            onClick={() => setShowEarlier((v) => !v)}
            aria-expanded={showEarlier}
            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-accent/50 bg-background px-4 py-2 text-sm font-semibold text-primary hover:bg-accent/10"
          >
            {showEarlier ? "Hide earlier issues" : `Show earlier issues (${earlier.length} more weeks)`}
          </button>
        </div>
      )}
    </div>
  );
}

function ResourcesPage() {
  const { groups, activeSeriesIds } = Route.useLoaderData();
  const seriesCards = originalSeriesCards(activeSeriesIds);
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-14 space-y-6 sm:space-y-8">
        <section className="parchment-frame">
          <div className="parchment-panel">
            <div className="text-center">
              <Link
                to="/"
                className="inline-block text-sm text-accent hover:text-primary transition-colors"
              >
                ← Back to Home
              </Link>
              <h1 className="mt-4 font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-primary">
                Our Originals
              </h1>
              <p className="mt-3 font-serif italic text-base sm:text-lg text-accent">
                In-house Torah learning material, made for the Shabbos table.
              </p>
            </div>

            <div className="mt-8 max-w-2xl mx-auto text-left font-serif text-base sm:text-lg text-foreground leading-relaxed">
              <p>
                Torah For The Table does more than collect and share Torah publications each
                week. Our team creates original educational material designed specifically for
                the Shabbos table. These series are part of our religious and educational mission.
              </p>
            </div>

            <OriginalEditions groups={groups} seriesCount={seriesCards.length} />

            <h2 className="mt-10 text-center font-serif text-2xl font-bold text-primary">Our Originals</h2>
            <SeriesGrid items={seriesCards} />

            <h2 className="mt-10 text-center font-serif text-2xl font-bold text-primary">Featured Independent Series</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center font-serif text-sm sm:text-base text-muted-foreground">
              Series by other authors that we're glad to share. They are not written by Torah For The Table.
            </p>
            <SeriesGrid items={FEATURED_SERIES} />

            <p className="mt-8 max-w-2xl mx-auto text-center font-serif text-base sm:text-lg text-foreground">
              Looking for the full weekly collection?{" "}
              <Link to="/archive" className="text-accent underline hover:text-primary">
                Browse the archive of past weeks →
              </Link>
            </p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
