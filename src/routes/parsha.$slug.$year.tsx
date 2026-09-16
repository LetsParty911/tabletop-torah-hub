import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getReadingCollection } from "@/integrations/supabase/reading-pages.functions";
import { ReadingCollectionView } from "@/components/ReadingCollectionView";

export const Route = createFileRoute("/parsha/$slug/$year")({
  loader: async ({ params }) => {
    const year = Number(params.year);
    if (!Number.isInteger(year)) throw notFound();
    const result = await getReadingCollection({
      data: { kind: "parsha", slug: params.slug, year },
    });
    if (!result.collection) throw notFound();
    return result;
  },
  head: ({ loaderData, params }) => {
    const collection = loaderData?.collection;
    const label = collection?.label ?? "Parsha";
    const year = collection?.jewish_year ?? params.year;
    const count = collection?.count ?? 0;
    const title = `${label} ${year}: Divrei Torah for Children, Families & Adults | Torah For The Table`;
    const description = `${count} carefully selected Divrei Torah for ${label} ${year} — including choices for children, families, quick reads and deeper learning.`;
    const url = `https://torahforthetable.com/parsha/${params.slug}/${params.year}`;
    const image = `https://torahforthetable.com/og/image.png?parsha=${encodeURIComponent(label)}&count=${count}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: `${label} ${year} Divrei Torah` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${label} ${year} Divrei Torah` },
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
            name: `${label} ${year} Divrei Torah`,
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
      <h1 className="font-serif text-3xl text-primary">Parsha Collection Not Found</h1>
      <p className="text-muted-foreground">This collection is not available in the archive.</p>
      <Link to="/archive" className="text-accent underline">Browse the Archive</Link>
    </div>
  ),
  component: ParshaCollectionPage,
});

function ParshaCollectionPage() {
  const { collection, resources } = Route.useLoaderData();
  return <ReadingCollectionView collection={collection} resources={resources} />;
}
