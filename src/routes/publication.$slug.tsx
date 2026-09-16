import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BookOpen, ArrowLeft } from "lucide-react";
import { getPublicationPage } from "@/integrations/supabase/publication-pages.functions";
import { formatReadingLabel } from "@/lib/parshiyos";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { standardizeCopy } from "@/lib/standardize-copy";
import { buildDownloadFilename } from "@/lib/download-filename";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/publication/$slug")({
  loader: async ({ params }) => {
    const result = await getPublicationPage({ data: { slug: params.slug } });
    if (!result.publication) throw notFound();
    return result;
  },
  head: ({ loaderData, params }) => {
    const publication = loaderData?.publication;
    const name = publication?.name ?? "Publication";
    const description =
      publication?.default_description?.trim() ||
      `Browse current and earlier editions of ${name} on Torah for the Table.`;
    const url = `https://torahforthetable.com/publication/${params.slug}`;
    const title = `${name} — Weekly Editions | Torah for the Table`;
    const image = `https://torahforthetable.com/og/image.png?title=${encodeURIComponent(name)}`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: name },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: name },
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
            name,
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
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-serif text-3xl text-primary">Publication Not Found</h1>
      <p className="text-muted-foreground">This publication page is unavailable.</p>
      <Link to="/archive" className="text-accent underline">
        Browse the Archive
      </Link>
    </div>
  ),
  component: PublicationPage,
});

function PublicationPage() {
  const { publication, editions } = Route.useLoaderData();
  const latest = editions[0] ?? null;
  const earlier = editions.slice(1);
  const defaultMeta = [
    publication.default_audience
      ? audienceLabel(normalizeAudience(publication.default_audience, publication.name)) ??
        publication.default_audience
      : null,
    formatTypeLabel(publication.default_format_type),
  ]
    .filter(Boolean)
    .join(" · ");

  const editionMeta = (edition: (typeof editions)[number]) =>
    [
      edition.audience
        ? audienceLabel(normalizeAudience(edition.audience, edition.title)) ?? edition.audience
        : null,
      formatTypeLabel(edition.format_type),
      typeof edition.page_count === "number"
        ? `${edition.page_count} ${edition.page_count === 1 ? "page" : "pages"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const EditionCard = ({ edition, prominent = false }: { edition: (typeof editions)[number]; prominent?: boolean }) => {
    const reading = formatReadingLabel(edition.parsha_key);
    const label = edition.jewish_year ? `${reading} ${edition.jewish_year}` : reading;
    const meta = editionMeta(edition);
    const description = standardizeCopy(edition.description || edition.subtitle);

    return (
      <article
        className={`rounded-xl border bg-background/65 p-4 sm:p-5 ${
          prominent ? "border-accent/60 shadow-sm" : "border-accent/30"
        }`}
      >
        <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-readable">
          {label}
        </p>
        <h3 className="mt-1 font-serif text-lg sm:text-xl font-bold text-primary leading-snug">
          <Link to="/view/$id" params={{ id: edition.id }} className="hover:text-accent hover:underline">
            {edition.title === publication.name ? publication.name : edition.title}
          </Link>
        </h3>
        {meta && <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{meta}</p>}
        {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            to="/view/$id"
            params={{ id: edition.id }}
            className="inline-flex items-center justify-center rounded-full border border-accent/50 px-4 py-2.5 font-serif font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View & Preview
          </Link>
          <DownloadToPrintButton
            href={`/view/${edition.id}/download`}
            publicationId={edition.id}
            publicationName={publication.name}
            publicationTitle={edition.title}
            publisher={publication.publisher}
            publicationSeries={publication.name}
            parsha={edition.parsha_key}
            filename={buildDownloadFilename(edition.parsha_key, publication.name)}
            className="w-full px-4 py-2.5"
          />
        </div>
      </article>
    );
  };

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
          <div className="parchment-panel">
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-readable">
                  Publication
                </p>
                <h1 className="mt-1 font-serif text-3xl sm:text-4xl font-bold text-primary leading-tight">
                  {publication.name}
                </h1>
                {publication.publisher && (
                  <p className="mt-1 text-sm text-muted-foreground">Published by {publication.publisher}</p>
                )}
                {defaultMeta && (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {defaultMeta}
                  </p>
                )}
                {publication.default_description && (
                  <p className="mt-4 max-w-3xl font-serif text-base sm:text-lg leading-relaxed text-primary/85">
                    {publication.default_description}
                  </p>
                )}
                <p className="mt-4 text-sm text-muted-foreground">
                  {editions.length} {editions.length === 1 ? "edition" : "editions"} currently in the Torah For The Table archive.
                </p>
              </div>
            </div>
          </div>
        </section>

        {latest && (
          <section className="mt-7">
            <p className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent-readable">
              Latest available
            </p>
            <div className="mt-2">
              <EditionCard edition={latest} prominent />
            </div>
          </section>
        )}

        {earlier.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-primary">Earlier editions</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {earlier.map((edition) => (
                <EditionCard key={edition.id} edition={edition} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
