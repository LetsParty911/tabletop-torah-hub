import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => {
    const title = "About | Torah for the Table";
    const description =
      "Learn about Torah for the Table — a weekly collection of Divrei Torah gathered for the Shabbos table.";
    const url = "https://torahforthetable.com/about";
    const image =
      "https://torahforthetable.com/og-image.png";
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

function AboutPage() {
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
                About
              </h1>
              <p className="mt-3 font-serif italic text-base sm:text-lg text-accent">
                A weekly collection for the Shabbos table.
              </p>
            </div>

            <div className="mt-8 space-y-5 font-serif text-base sm:text-lg text-foreground leading-relaxed max-w-2xl mx-auto">
              <p>
                <span className="font-semibold text-primary">Torah for the Table</span> gathers
                weekly Divrei Torah for Shabbos and Yom Tov in one quiet, uncluttered place —
                so you can come to the table with something meaningful to share.
              </p>
              <p>
                Each week features a curated selection of downloadable PDFs, organized by
                parsha and Yom Tov, alongside a growing archive of earlier weeks. The goal
                is simple: to make it easier to have a Dvar Torah ready for the table each week.
              </p>
              <p className="text-muted-foreground text-sm sm:text-base">
                Have a Dvar Torah to share, a correction, or a suggestion?{" "}
                <Link to="/contact" className="text-accent hover:text-primary underline">
                  Get in touch
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <footer className="text-center text-sm text-muted-foreground py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <span aria-hidden>·</span>
          <Link to="/archive" className="hover:text-primary transition-colors">Archive</Link>
          <span aria-hidden>·</span>
          <Link to="/publications" className="hover:text-primary transition-colors">Meet the Publications</Link>
          <span aria-hidden>·</span>
          <Link to="/contact" className="hover:text-primary transition-colors">Contact</Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Torah for the Table</span>
        </footer>
      </div>
    </div>
  );
}
