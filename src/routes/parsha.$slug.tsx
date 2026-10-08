import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { getParshaSeoPage } from "@/integrations/supabase/parsha-seo.functions";
import { VORTS } from "@/data/vorts";
import { readingSlug } from "@/lib/reading-page";
import { PARSHIYOS_54, formatReadingLabel } from "@/lib/parshiyos";

function seferForParsha(parshaKey: string): string {
  const index = PARSHIYOS_54.indexOf(parshaKey);
  if (index <= 11) return "Sefer Bereishis";
  if (index <= 22) return "Sefer Shemos";
  if (index <= 32) return "Sefer Vayikra";
  if (index <= 42) return "Sefer Bamidbar";
  return "Sefer Devarim";
}

export const Route = createFileRoute("/parsha/$slug")({
  loader: async ({ params }) => {
    const page = await getParshaSeoPage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData, params }) => {
    const label = loaderData?.label ?? "Parsha";
    const count = loaderData?.total_count ?? 0;
    const title = `Divrei Torah on ${label} | Dvar Torah, Brief Insights & Printable PDFs`;
    const description =
      count > 0
        ? `Browse ${count} Divrei Torah on ${label}, including short vorts, printable Torah sheets, family-table material and deeper learning.`
        : `Divrei Torah on ${label}: short vorts, printable Torah sheets, family-table material and deeper learning from Torah For The Table.`;
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
        { property: "og:site_name", content: "Torah For The Table" },
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
              name: "Torah For The Table",
              url: "https://torahforthetable.com",
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Divrei Torah",
                item: "https://torahforthetable.com/divrei-torah-parsha",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: loaderData?.parsha_key ? seferForParsha(loaderData.parsha_key) : "Parsha",
                item: "https://torahforthetable.com/divrei-torah-parsha",
              },
              {
                "@type": "ListItem",
                position: 3,
                name: label,
                item: url,
              },
            ],
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
  const currentIndex = PARSHIYOS_54.findIndex((name) => readingSlug(name) === page.slug);
  const previousParsha = currentIndex > 0 ? PARSHIYOS_54[currentIndex - 1] : null;
  const nextParsha =
    currentIndex >= 0 && currentIndex < PARSHIYOS_54.length - 1 ? PARSHIYOS_54[currentIndex + 1] : null;
  const sefer = seferForParsha(page.parsha_key);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-11">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link to="/divrei-torah-parsha" className="hover:text-primary hover:underline">
                Divrei Torah
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/divrei-torah-parsha" className="hover:text-primary hover:underline">
                {sefer}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-primary" aria-current="page">
              {page.label}
            </li>
          </ol>
        </nav>

        <header className="mt-5 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-readable">
            Permanent Parsha Library
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-primary sm:text-5xl">
            Divrei Torah on {page.label}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
            Looking for a Dvar Torah on {page.label}? This permanent library brings together the
            Torah For The Table selections for {page.label} from every available year, including
            quick vorts, material for children and families, stories, printable Torah sheets and
            longer pieces for deeper learning. Choose an individual selection below to read more
            about it before opening or printing the PDF.
          </p>
        </header>

        {page.total_count > 0 && (
          <section className="mt-9 rounded-2xl border border-accent/25 bg-card/25 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-primary">
              {page.label} Divrei Torah at a Glance
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The Torah For The Table archive currently includes {page.total_count}{" "}
              {page.total_count === 1 ? "selection" : "selections"} for {page.label}
              {page.years.length > 0
                ? ` across ${page.years.length} Jewish year${page.years.length === 1 ? "" : "s"}`
                : ""}. Use the year collections below to browse earlier material, or choose an individual Dvar Torah to preview and print.
            </p>
            {(Object.keys(page.audience_counts).length > 0 || Object.keys(page.type_counts).length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(page.audience_counts).map(([label, count]) => (
                  <span key={`audience-${label}`} className="rounded-full border border-accent/30 bg-background px-3 py-1.5 text-xs font-medium text-primary">
                    {label}: {count}
                  </span>
                ))}
                {Object.entries(page.type_counts).map(([label, count]) => (
                  <span key={`type-${label}`} className="rounded-full border border-accent/30 bg-background px-3 py-1.5 text-xs font-medium text-primary">
                    {label}: {count}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

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
            <h2 className="font-serif text-2xl font-bold text-primary">Brief Insights on {page.label}</h2>
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
            These selections are drawn from the Torah For The Table archive. Open any PDF directly in
            your browser to read it, then use the browser menu if you wish to print or save it.
          </p>

          {page.resources.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {page.resources.map((resource) => {
                const description = resource.summary_quick || resource.description;
                const meta = [
                  resource.audience,
                  resource.content_type === "Questions & Answers"
                    ? resource.content_type
                    : resource.format_type || resource.content_type,
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
                          <Link to="/view/$id" params={{ id: resource.id }} className="hover:text-accent hover:underline">
                            {resource.title}
                          </Link>
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
                    <div className="mt-auto pt-4">
                      <DownloadToPrintButton
                        href={`/view/${resource.id}/pdf`}
                        publicationId={resource.id}
                        publicationTitle={resource.title}
                        className="w-full"
                      />
                    </div>
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

        {(previousParsha || nextParsha) && (
          <nav aria-label="Adjacent parshiyos" className="mt-10 grid gap-3 sm:grid-cols-2">
            {previousParsha ? (
              <Link
                to="/parsha/$slug"
                params={{ slug: readingSlug(previousParsha) }}
                className="rounded-xl border border-accent/30 bg-background/65 p-4 transition-colors hover:border-accent/60 hover:bg-accent/5"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous Parsha</span>
                <span className="mt-1 block font-serif text-lg font-bold text-primary">← {formatReadingLabel(previousParsha)}</span>
              </Link>
            ) : <span />}
            {nextParsha && (
              <Link
                to="/parsha/$slug"
                params={{ slug: readingSlug(nextParsha) }}
                className="rounded-xl border border-accent/30 bg-background/65 p-4 text-left transition-colors hover:border-accent/60 hover:bg-accent/5 sm:text-right"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next Parsha</span>
                <span className="mt-1 block font-serif text-lg font-bold text-primary">{formatReadingLabel(nextParsha)} →</span>
              </Link>
            )}
          </nav>
        )}

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
