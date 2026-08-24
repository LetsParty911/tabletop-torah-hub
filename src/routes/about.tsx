import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteLogoStacked } from "@/components/SiteLogo";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => {
    const title = "About — Torah for the Table";
    const description =
      "Torah for the Table is a 501(c)(3) nonprofit gathering weekly Divrei Torah for the Shabbos table — free resources for children, families, and adults.";
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
              <SiteLogoStacked className="mx-auto mt-6" />
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
                parsha and Yom Tov, alongside a growing archive of earlier weeks. Our mission
                is to help individuals and families strengthen their connection to Torah by
                making meaningful learning easier to access, print, and bring to the Shabbos
                table — for children, families, and adults alike.
              </p>
            </div>

            <div className="mt-10 pt-8 border-t-2 border-accent/30 space-y-8 max-w-2xl mx-auto text-left">
              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Nonprofit Status</h2>
                <p className="mt-2 font-serif text-base text-foreground leading-relaxed">
                  Torah For The Table is a New Jersey nonprofit corporation recognized by the
                  Internal Revenue Service as tax-exempt under Section 501(c)(3). The
                  organization was established to promote Torah learning by publishing and
                  distributing free religious and educational materials through its website and
                  other outreach programs.
                </p>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Leadership</h2>
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 font-serif text-base text-foreground">
                  <li>
                    <span className="font-semibold text-primary">Daniel Kaplan</span> — President
                  </li>
                  <li>
                    <span className="font-semibold text-primary">Simcha Kaplan</span> — Vice President
                  </li>
                  <li>
                    <span className="font-semibold text-primary">Dovid Nisson Shonek</span> — Secretary
                  </li>
                  <li>
                    <span className="font-semibold text-primary">Yosef Chaim Borenstein</span> — Treasurer
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Our Activities</h2>
                <ul className="mt-2 list-disc pl-6 space-y-1 font-serif text-base text-foreground leading-relaxed">
                  <li>Publishes free weekly Torah resources</li>
                  <li>Organizes Divrei Torah from multiple respected sources</li>
                  <li>Creates original educational materials, including Parsha Questions &amp; Answers, Stories for the Shabbos Table, Short Vorts, and family discussion questions</li>
                  <li>Provides content for children, families, and adults</li>
                  <li>Helps visitors easily download and print materials before Shabbos</li>
                  <li>Supports Torah learning in homes, schools, synagogues, and communities</li>
                </ul>
                <p className="mt-3 font-serif text-base text-foreground leading-relaxed">
                  Materials from outside publishers are displayed with permission and proper
                  attribution.
                </p>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Who We Serve</h2>
                <ul className="mt-2 list-disc pl-6 space-y-1 font-serif text-base text-foreground leading-relaxed">
                  <li>Individuals preparing for Shabbos</li>
                  <li>Parents and families</li>
                  <li>Children and students</li>
                  <li>Rabbis and educators</li>
                  <li>Synagogues, schools, and community organizations</li>
                  <li>Anyone seeking accessible Torah learning materials</li>
                </ul>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Contact</h2>
                <div className="mt-2 font-serif text-base text-foreground leading-relaxed space-y-1">
                  <p>Torah For The Table</p>
                  <p>New Jersey, United States</p>
                  <p>
                    Email:{" "}
                    <a
                      href="mailto:hello@torahforthetable.com"
                      className="text-accent hover:text-primary underline"
                    >
                      hello@torahforthetable.com
                    </a>
                  </p>
                  <p>Website: TorahForTheTable.com</p>
                </div>
                <p className="mt-3 font-serif text-base text-foreground leading-relaxed">
                  Torah For The Table does not charge visitors to access its educational
                  materials. Its activities are operated for religious, charitable, and
                  educational purposes.
                </p>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">A Nonprofit Project</h2>
                <p className="mt-2 font-serif text-base text-foreground leading-relaxed">
                  Torah for the Table is a nonprofit Torah-distribution project. Third-party
                  publications remain the property of their respective publishers and are
                  displayed with permission and proper attribution. Every PDF is offered free
                  of charge for the sake of Harbatzas HaTorah.
                </p>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Copyright &amp; Attribution</h2>
                <p className="mt-2 font-serif text-base text-foreground leading-relaxed">
                  All Divrei Torah, illustrations, and formatting shown on this site remain the
                  intellectual property of their original authors and publishers. Torah for the
                  Table does not claim ownership over any third-party publication. Each file is
                  posted in its original form; where a publisher's name or contact appears in the
                  PDF, that attribution is authoritative.
                </p>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Privacy Policy</h2>
                <div className="mt-2 font-serif text-base text-foreground leading-relaxed space-y-3">
                  <p>
                    We collect only what is needed to run the site: an email address when you
                    voluntarily join the weekly notification list, and standard anonymized
                    analytics (page views, downloads) via Google Tag Manager. We do not sell,
                    rent, or share your email address.
                  </p>
                  <p>
                    Emails are used solely to send the weekly notification when new Divrei Torah
                    are posted. You can unsubscribe at any time using the link in any email or
                    by contacting us.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Publication Submissions</h2>
                <p className="mt-2 font-serif text-base text-foreground leading-relaxed">
                  Publishers and authors who would like their weekly Divrei Torah included are
                  warmly welcomed. Please send a sample PDF, your publication name, and your
                  distribution schedule (weekly / seasonal / occasional) through the{" "}
                  <Link to="/contact" className="text-accent hover:text-primary underline">
                    contact page
                  </Link>
                  . Submissions are reviewed for Torah content, source clarity, and print-ready
                  formatting before inclusion.
                </p>
              </section>

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Corrections &amp; Removal Requests</h2>
                <p className="mt-2 font-serif text-base text-foreground leading-relaxed">
                  If you are the publisher or author of a PDF hosted here and would like a
                  correction, updated version, or removal, please reach out through the{" "}
                  <Link to="/contact" className="text-accent hover:text-primary underline">
                    contact page
                  </Link>{" "}
                  and reference the parsha and publication name. Verified requests are honored
                  promptly — usually within a few days.
                </p>
              </section>

              <p className="text-muted-foreground text-sm sm:text-base pt-2">
                Have a Dvar Torah to share, a correction, or a suggestion?{" "}
                <Link to="/contact" className="text-accent hover:text-primary underline">
                  Get in touch
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
