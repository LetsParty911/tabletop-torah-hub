import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ArrowLeft } from "lucide-react";
import { listPublicationPages } from "@/integrations/supabase/publication-pages.functions";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/publications")({
  loader: () => listPublicationPages(),
  head: () => {
    const title = "Browse Torah Publications | Torah for the Table";
    const description =
      "Browse recurring Torah publications curated by Torah for the Table and find current and earlier editions in one place.";
    const url = "https://torahforthetable.com/publications";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: "Browse Torah Publications" },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PublicationsPage,
});

function PublicationsPage() {
  const { publications } = Route.useLoaderData();

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

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {publications.map((publication) => {
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
                    {publication.default_description && (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {publication.default_description}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
