import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { listParshaSeoSummaries } from "@/integrations/supabase/parsha-seo.functions";

export const Route = createFileRoute("/divrei-torah-parsha")({
  loader: () => listParshaSeoSummaries(),
  head: () => {
    const title = "Divrei Torah on the Parsha | Weekly Dvar Torah Library | Torah for the Table";
    const description =
      "Browse Divrei Torah on every weekly parsha: short vorts, printable Torah sheets, family-table material, stories, essays and deeper learning.";
    const url = "https://torahforthetable.com/divrei-torah-parsha";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Divrei Torah on the Parsha",
            description,
            url,
            isPartOf: {
              "@type": "WebSite",
              name: "Torah for the Table",
              url: "https://torahforthetable.com",
            },
          }),
        },
      ],
    };
  },
  component: DivreiTorahParshaPage,
});

function DivreiTorahParshaPage() {
  const parshiyos = Route.useLoaderData();
  const available = parshiyos.filter((p) => p.count > 0);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-readable">
            Weekly Torah Library
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-primary sm:text-5xl">
            Divrei Torah on the Parsha
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Find Divrei Torah for the weekly parsha, including short vorts, printable Torah sheets,
            stories, family-table material and longer essays. Each parsha page brings together the
            available selections from current and previous years in one permanent place.
          </p>
        </header>

        <section className="mt-10 rounded-2xl border border-accent/25 bg-card/30 p-5 sm:p-7">
          <h2 className="font-serif text-2xl font-bold text-primary">Browse by Parsha</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose a parsha to see all available Torah for that week. Pages remain available
            year-round, so you can return to the same parsha URL each year.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {parshiyos.map((parsha) => (
              <Link
                key={parsha.slug}
                to="/parsha/$slug"
                params={{ slug: parsha.slug }}
                className="group flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-background/70 p-4 transition-colors hover:border-accent/60 hover:bg-accent/5"
              >
                <div className="min-w-0">
                  <h2 className="font-serif text-lg font-bold text-primary">{parsha.label}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {parsha.count > 0
                      ? `${parsha.count} ${parsha.count === 1 ? "selection" : "selections"}${parsha.years.length ? ` · ${parsha.years.length} ${parsha.years.length === 1 ? "year" : "years"}` : ""}`
                      : "Collection building"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-accent/25 bg-card/25 p-5">
            <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-xl font-bold text-primary">For the Shabbos Table</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The library is organized to help you find something appropriate for children,
              families or adults, whether you want a one-minute vort or a longer piece to learn.
            </p>
          </article>
          <article className="rounded-2xl border border-accent/25 bg-card/25 p-5">
            <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-xl font-bold text-primary">Printable Divrei Torah</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Many selections are available as clean PDFs that can be printed before Shabbos and
              brought directly to the table.
            </p>
          </article>
        </section>

        {available.length > 0 && (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Currently available across {available.length} parsha pages. Additional collections are
            added as the weekly library grows.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
