import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ArrowLeft } from "lucide-react";
import { listPublicationPages, type PublicationPageSummary } from "@/integrations/supabase/publication-pages.functions";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { leadWithPublicationTitle } from "@/lib/publication-description";
import { SiteFooter } from "@/components/SiteFooter";
import { TFTT_ORIGINAL_SERIES, tfttOriginalSeriesById } from "@/lib/tftt-originals";

export const Route = createFileRoute("/publications")({
  loader: () => listPublicationPages(),
  head: () => {
    const title = "Browse Torah Publications | Torah For The Table";
    const description =
      "Browse recurring Torah publications curated by Torah For The Table and find current and earlier editions in one place.";
    const url = "https://torahforthetable.com/publications";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: "Browse Torah Publications" },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah For The Table" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PublicationsPage,
});

function PublicationsPage() {
  const { publications } = Route.useLoaderData();
  const originalPublications = TFTT_ORIGINAL_SERIES.flatMap((series) =>
    publications.filter((publication) => publication.id === series.id),
  );
  const otherPublications = publications.filter((publication) => !tfttOriginalSeriesById(publication.id));

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          to="/archive"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Archive
        </Link>

        <section className="parchment-frame mt-5">
          <div className="parchment-panel text-center">
            <p className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-readable">
              Browse by source
            </p>
            <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-bold text-primary">
              Publications
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-muted-foreground">
              Find a publication you already enjoy, then see all of its available editions in one place.
            </p>
          </div>
        </section>

        {originalPublications.length > 0 && (
          <section className="mt-8" aria-labelledby="original-series-heading">
            <h2 id="original-series-heading" className="font-serif text-2xl font-bold text-primary">Our Original Weekly Series</h2>
            <p className="mt-1 text-sm text-muted-foreground">Three original publications prepared for the Shabbos table, free to read or print.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {renderPublicationCards(originalPublications)}
            </div>
          </section>
        )}
        <section className="mt-8" aria-labelledby="other-publications-heading">
          <h2 id="other-publications-heading" className="font-serif text-2xl font-bold text-primary">More Torah Publications</h2>
          <p className="mt-1 text-sm text-muted-foreground">Browse other available publications and their earlier editions.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {renderPublicationCards(otherPublications)}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function renderPublicationCards(publications: PublicationPageSummary[]) {
  return publications.map((publication) => {
            const original = tfttOriginalSeriesById(publication.id);
            const meta = [
              publication.default_audience
                ? audienceLabel(normalizeAudience(publication.default_audience, publication.name)) ??
                  publication.default_audience
                : null,
              formatTypeLabel(publication.default_format_type),
              `${publication.edition_count} ${publication.edition_count === 1 ? "edition" : "editions"}`,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Link
                key={publication.id}
                to="/publication/$slug"
                params={{ slug: publication.slug }}
                className="group rounded-xl border border-accent/30 bg-background/60 p-4 sm:p-5 transition-colors hover:border-accent/70 hover:bg-card/40"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-lg sm:text-xl font-bold text-primary group-hover:text-accent group-hover:underline">
                      {publication.name}
                    </h2>
                    {publication.publisher && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Published by {publication.publisher}</p>
                    )}
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta}
                    </p>
                    {(original || publication.default_description) && (
                      <p className={`mt-2 text-sm leading-relaxed text-muted-foreground ${original ? "" : "line-clamp-3"}`}>
                        {original?.shortDescription ?? leadWithPublicationTitle(publication.name, publication.default_description)}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          });
}
