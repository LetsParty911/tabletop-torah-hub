import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { fitPageTitle } from "@/lib/page-title";
import { TFTT_ORIGINAL_SERIES } from "@/lib/tftt-originals";

export const Route = createFileRoute("/originals")({
  component: ResourcesPage,
  head: () => {
    const title = fitPageTitle("Our Originals", " — In-House Torah Learning Resources");
    const description =
      "Three free Torah For The Table original weekly series: Parsha Challenge, Stories for the Shabbos Table, and In the Margins — free for the Shabbos table.";
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

const SERIES: SeriesCard[] = [
  {
    title: TFTT_ORIGINAL_SERIES[0].title,
    description:
      TFTT_ORIGINAL_SERIES[0].shortDescription,
    sample: TFTT_ORIGINAL_SERIES[0].expectation,
    linkTo: "/archive",
    linkSearch: { q: "Parsha Challenge" },
    cta: "Browse Parsha Challenge →",
  },
  {
    title: TFTT_ORIGINAL_SERIES[1].title,
    description:
      TFTT_ORIGINAL_SERIES[1].shortDescription,
    sample: TFTT_ORIGINAL_SERIES[1].expectation,
    linkTo: "/archive",
    linkSearch: { q: "Stories for the Shabbos Table" },
    cta: "Browse Stories for the Shabbos Table →",
  },
  {
    title: TFTT_ORIGINAL_SERIES[2].title,
    description:
      TFTT_ORIGINAL_SERIES[2].shortDescription,
    sample: TFTT_ORIGINAL_SERIES[2].expectation,
    linkTo: "/archive",
    linkSearch: { q: "In the Margins" },
    cta: "Browse In the Margins →",
  },
];

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
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
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

function ResourcesPage() {
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
                the Shabbos table. All materials are provided free of charge in furtherance of
                our religious and educational mission.
              </p>
            </div>

            <h2 className="mt-8 text-center font-serif text-2xl font-bold text-primary">Our Originals</h2>
            <SeriesGrid items={SERIES} />

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
