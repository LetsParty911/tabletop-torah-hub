import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/resources")({
  component: ResourcesPage,
  head: () => {
    const title = "Torah for the Table Originals — In-House Torah Learning Resources";
    const description =
      "Original educational material created in-house for the Shabbos table: Short Vorts, Stories for the Shabbos Table, Mi Ka'amcha Yisroel, and Parsha Questions & Answers — all free of charge.";
    const url = "https://torahforthetable.com/resources";
    const image = "https://torahforthetable.com/og-image.png";
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
    };
  },
});

type SeriesCard = {
  title: string;
  description: string;
  linkTo: string;
  linkSearch?: Record<string, string>;
  cta: string;
};

const SERIES: SeriesCard[] = [
  {
    title: "Short Vorts",
    description:
      "Brief, focused divrei Torah written in-house each week. Each vort is drawn from a classical source — Rashi, Midrash, or Chazal — and rewritten in a few sentences so it can be said over at the table without preparation.",
    linkTo: "/short-vorts",
    cta: "Read this week's Short Vorts →",
  },
  {
    title: "Stories for the Shabbos Table",
    description:
      "Source-based stories from Chazal and Tanach, retold for the table. Each story opens with the original Hebrew source and its translation, followed by a plain-English retelling and a “For the Table” discussion question that draws everyone into the conversation.",
    linkTo: "/archive",
    linkSearch: { q: "Stories for the Shabbos Table" },
    cta: "Browse Stories for the Shabbos Table →",
  },
  {
    title: "Mi Ka'amcha Yisroel",
    description:
      "A weekly piece that uses parashah insights to discuss communication and positive speech. Each installment takes a moment from the parsha where words shape an outcome — a blessing, a rebuke, a report — and draws out a practical point about how we speak to family, friends, and neighbors.",
    linkTo: "/archive",
    linkSearch: { q: "Mi Ka'amcha Yisroel" },
    cta: "Browse Mi Ka'amcha Yisroel →",
  },
  {
    title: "Parsha Questions & Answers",
    description:
      "Source-based questions and answers on the parsha each week, written for learning together at the table. Every set is accompanied by a Kids' Corner page with riddles and picture puzzles so younger children have their own way in.",
    linkTo: "/archive",
    linkSearch: { q: "Parsha Questions" },
    cta: "Browse Parsha Questions & Answers →",
  },
];

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
                Torah for the Table Originals
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

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
              {SERIES.map((s) => (
                <article
                  key={s.title}
                  className="flex flex-col rounded-xl border border-accent/30 bg-card/40 p-5"
                >
                  <h2 className="font-serif text-xl font-bold text-primary">{s.title}</h2>
                  <p className="mt-2 flex-1 font-serif text-sm sm:text-base leading-relaxed text-foreground">
                    {s.description}
                  </p>
                  <p className="mt-4 text-sm sm:text-base">
                    <Link
                      to={s.linkTo}
                      search={s.linkSearch}
                      className="text-accent underline hover:text-primary"
                    >
                      {s.cta}
                    </Link>
                  </p>
                </article>
              ))}
            </div>

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
