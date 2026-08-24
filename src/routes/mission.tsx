import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteLogoStacked } from "@/components/SiteLogo";

export const Route = createFileRoute("/mission")({
  component: MissionPage,
  head: () => {
    const title = "Mission & Programs — Torah for the Table";
    const description =
      "Torah For The Table is a 501(c)(3) nonprofit making Torah learning easier to access, print, and share — free resources for children, families, and adults.";
    const url = "https://torahforthetable.com/mission";
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

function MissionPage() {
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
              <SiteLogoStacked className="mx-auto mt-6" />
              <h1 className="mt-4 font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-primary">

                Mission &amp; Programs
              </h1>
              <p className="mt-3 font-serif italic text-base sm:text-lg text-accent">
                A 501(c)(3) nonprofit for Torah learning at the Shabbos table.
              </p>
            </div>

            <div className="mt-10 space-y-8 max-w-2xl mx-auto text-left font-serif text-base sm:text-lg text-foreground leading-relaxed">
              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Our Mission</h2>
                <p className="mt-2">
                  Torah For The Table is a recognized 501(c)(3) nonprofit organization
                  dedicated to making meaningful Torah learning easier to access, print, share,
                  and bring to the Shabbos table.
                </p>
                <p className="mt-3">
                  Our mission is to help individuals and families strengthen their connection to
                  Torah by providing free, well-organized educational materials for children,
                  families, and adults.
                </p>
              </section>

              <div className="gold-divider" aria-hidden>
                <span className="gold-divider-dot" />
              </div>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">What We Do</h2>
                <p className="mt-2">
                  Each week, Torah For The Table selects, organizes, and distributes a collection
                  of Divrei Torah from respected Torah publications and educators. Materials are
                  presented with permission and proper attribution so visitors can easily find and
                  print Torah content before Shabbos.
                </p>
                <p className="mt-3">
                  We also create and publish original educational resources, including:
                </p>
                <ul className="mt-2 list-disc pl-6 space-y-1">
                  <li>Parsha Questions &amp; Answers</li>
                  <li>Kids' Parsha Q&amp;A sheets</li>
                  <li>Short Vorts</li>
                  <li>Family discussion questions</li>
                  <li>Torah summaries and educational guides</li>
                </ul>
                <p className="mt-3">
                  Our website is designed to serve as a free central resource for people seeking
                  quality Torah material for their homes, Shabbos tables, classrooms, and
                  communities.
                </p>
              </section>

              <div className="gold-divider" aria-hidden>
                <span className="gold-divider-dot" />
              </div>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Who We Serve</h2>
                <ul className="mt-2 list-disc pl-6 space-y-1">
                  <li>Individuals preparing for Shabbos</li>
                  <li>Parents and families</li>
                  <li>Children and students</li>
                  <li>Rabbis and educators</li>
                  <li>Synagogues, schools, and community organizations</li>
                  <li>Anyone seeking accessible Torah learning materials</li>
                </ul>
              </section>

              <div className="gold-divider" aria-hidden>
                <span className="gold-divider-dot" />
              </div>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">
                  Our Educational Purpose
                </h2>
                <p className="mt-2">
                  Torah For The Table advances religious and educational learning by making Torah
                  materials more accessible and easier to use. We remove the need to search
                  through many separate websites, emails, and publications by bringing selected
                  resources together in one organized location.
                </p>
                <p className="mt-3">
                  All materials are offered free of charge. Our goal is not commercial profit, but
                  the expansion of Torah learning and meaningful discussion at Shabbos tables
                  throughout the world.
                </p>
              </section>

              <p className="text-muted-foreground text-sm sm:text-base pt-2">
                Learn more{" "}
                <Link to="/about" className="text-accent hover:text-primary underline">
                  about the organization
                </Link>{" "}
                or{" "}
                <Link to="/contact" className="text-accent hover:text-primary underline">
                  get in touch
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
