import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { getParshaSeoPage } from "@/integrations/supabase/parsha-seo.functions";
import { VORTS } from "@/data/vorts";
import { readingSlug } from "@/lib/reading-page";

export const Route = createFileRoute("/parsha/$slug")({
  loader: async ({ params }) => {
    const page = await getParshaSeoPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData, params }) => {
    const label = loaderData?.label ?? "Parsha";
    const count = loaderData?.total_count ?? 0;
    const title = `Divrei Torah on ${label} | Dvar Torah, Short Vorts & Printable PDFs`;
    const description =
      count > 0
        ? `Browse ${count} Divrei Torah on ${label}, including short vorts, printable Torah sheets, family-table material and deeper learning.`
        : `Divrei Torah on ${label}: short vorts, printable Torah sheets, family-table material and deeper learning from Torah for the Table.`;
    const url = `https://torahforthetable.com/parsha/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(count === 0 ? [{ name: "robots", content: "noindex,follow" }] : []),
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
            name: `Divrei Torah on ${label}`,
            description,
            url,
            numberOfItems: count,
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
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-serif text-3xl text-primary">Parsha Not Found</h1>
      <Link to="/divrei-torah-parsha" className="text-accent underline">
        Browse all parshiyos
      </Link>
    </div>
  ),
  component: PermanentParshaPage,
});

function PermanentParshaPage() {
  const page = Route.useLoaderData();
  const vorts =
    VORTS.find((entry) => readingSlug(entry.parshaKey) === page.slug)?.vorts.slice(0, 4) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-11">
        <Link
          to="/divrei-torah-parsha"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          All Parshiyos
        </Link>

        <header className="mt-5 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-readable">
            Permanent Parsha Library
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-primary sm:text-5xl">
            Divrei Torah on {page.label}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
            Browse Divrei Torah for {page.label}, including short vorts, printable Torah sheets,
            stories, family-table material and longer essays. This page gathers the available
            selections from every year in the Torah for the Table archive.
          </p>
        </header>

        {page.years.length > 0 && (
          <section className="mt-9 rounded-2xl border border-accent/25 bg-card/25 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-primary">
              {page.label} Collections by Year
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {page.years.map(({ year, count }) => (
                <Link
                  key={year}
                  to="/parsha/$slug/$year"
                  params={{ slug: page.slug, year: String(year) }}
                  className="rounded-full border border-accent/40 bg-background px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {year} · {count} {count === 1 ? "selection" : "selections"}
                </Link>
              ))}
            </div>
          </section>
        )}

        {vorts.length > 0 && (
          <section className="mt-9">
            <h2 className="font-serif text-2xl font-bold text-primary">Short Vorts on {page.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Quick Torah thoughts that can be shared at the Shabbos table.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {vorts.map((vort) => (
                <article key={vort.id} className="rounded-xl border border-accent/25 bg-card/25 p-5">
                  <h3 className="font-serif text-lg font-bold text-primary">{vort.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">{vort.text}</p>
                  <p className="mt-3 text-xs italic text-muted-foreground">{vort.source}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-serif text-2xl font-bold text-primary">
            Printable Divrei Torah for {page.label}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            These selections are drawn from the Torah for the Table archive. Open any item to preview
            it and, where available, print or download the PDF for your Shabbos table.
          </p>

          {page.resources.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {page.resources.map((resource) => {
                const description = resource.summary_quick || resource.description;
                const meta = [
                  resource.audience,
                  resource.format_type || resource.content_type,
                  resource.page_count
                    ? `${resource.page_count} ${resource.page_count === 1 ? "page" : "pages"}`
                    : null,
                  resource.jewish_year ? String(resource.jewish_year) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <article
                    key={resource.id}
                    className="flex h-full flex-col rounded-xl border border-accent/30 bg-background/65 p-5"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="mt-1 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                      <div>
                        <h3 className="font-serif text-lg font-bold leading-snug text-primary">
                          {resource.title}
                        </h3>
                        {meta && (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {meta}
                          </p>
                        )}
                        {description && (
                          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Link
                      to="/view/$id"
                      params={{ id: resource.id }}
                      className="mt-auto pt-4 text-sm font-semibold text-primary underline decoration-accent/60 underline-offset-4 hover:text-accent"
                    >
                      View this Dvar Torah
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-accent/25 bg-card/25 p-5 text-sm text-muted-foreground">
              This permanent page is ready for future {page.label} material. Published selections
              will appear here automatically as they are added to the archive.
            </div>
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-accent/25 bg-card/25 p-5 sm:p-6">
          <h2 className="font-serif text-xl font-bold text-primary">More Divrei Torah on the Parsha</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Browse the full weekly-parsha directory for short vorts, family material, stories and
            printable Torah sheets on other parshiyos.
          </p>
          <Link
            to="/divrei-torah-parsha"
            className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Browse all Parshiyos
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
