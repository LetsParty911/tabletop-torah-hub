import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

const PRIVACY_EMAIL = "hello@torahforthetable.com";
const ENTITY_NAME = "Torah For The Table";
const LAST_UPDATED = "September 6, 2026";

const mailLink = (
  <a
    href={`mailto:${PRIVACY_EMAIL}`}
    className="text-accent underline hover:text-primary transition-colors"
  >
    {PRIVACY_EMAIL}
  </a>
);

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => {
    const title = "Privacy Policy — Torah for the Table";
    const description =
      "What information Torah for the Table collects and how it is used.";
    const url = "https://torahforthetable.com/privacy";
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

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl font-bold text-primary">{heading}</h2>
      {children}
    </section>
  );
}

function Sub({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-serif text-lg font-semibold text-primary">
        {heading}
      </h3>
      {children}
    </section>
  );
}

function PrivacyPage() {
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
                Privacy Policy
              </h1>
              <p className="mt-3 font-serif italic text-base text-accent">
                Last updated: {LAST_UPDATED}
              </p>
            </div>

            <div className="mt-8 space-y-8 font-serif text-base sm:text-lg text-foreground leading-relaxed max-w-2xl mx-auto text-left">
              <p>
                This policy describes the information Torah for the Table
                collects and how it is used.
              </p>

              <Section heading="Who we are">
                <p>
                  Torah for the Table is operated by {ENTITY_NAME}, a nonprofit
                  corporation organized in New Jersey and recognized by the IRS
                  as a tax-exempt organization under Section 501(c)(3). You can
                  reach us about anything in this policy at {mailLink}.
                </p>
              </Section>

              <Section heading="What we collect">
                <div className="space-y-6">
                  <Sub heading="1. Your email address, if you give it to us">
                    <p>
                      If you sign up for the weekly reminder — either from the
                      signup box on the site or the popup that appears after a
                      download — we store your email address and the date you
                      subscribed. We use it to send you a message when the new
                      weekly collection is ready. Every email we send includes
                      an unsubscribe link.
                    </p>
                  </Sub>

                  <Sub heading="2. Messages you send us">
                    <p>
                      If you use the contact form, we receive whatever you type
                      into it, including the contact details you provide, so
                      that we can respond.
                    </p>
                  </Sub>

                  <Sub heading="3. Download records">
                    <p>
                      When someone downloads a publication, we record which
                      publication it was and the city, region, country, and
                      time zone of the request, as reported by our hosting
                      provider.
                    </p>
                  </Sub>

                  <Sub heading="4. Site analytics">
                    <p>
                      We use Google Tag Manager and Google Analytics to measure
                      site usage, including which pages are visited, which
                      publications are downloaded or printed, and interactions
                      with the signup forms. Google may set cookies in your
                      browser as part of this. Google's handling of that data is
                      governed by its own privacy policy at{" "}
                      <a
                        href="https://policies.google.com/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline hover:text-primary transition-colors"
                      >
                        policies.google.com/privacy
                      </a>
                      . Analytics are not run on the site's administrative
                      pages.
                    </p>
                  </Sub>

                  <Sub heading="5. Information stored in your own browser">
                    <p>
                      The site stores a small number of values in your browser's
                      local and session storage, used for features such as
                      remembering that the email popup was dismissed and
                      enabling offline access and faster loading. You can clear
                      these at any time through your browser settings.
                    </p>
                  </Sub>
                </div>
              </Section>

              <Section heading="Service providers">
                <p>
                  We use the following service providers to operate the site:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li>Lovable — website hosting and content delivery</li>
                  <li>
                    Supabase — database storage for subscriptions and download
                    records
                  </li>
                  <li>Google — Tag Manager and Analytics</li>
                </ul>
                <p>
                  We may also disclose information if we are legally required to
                  do so.
                </p>
              </Section>

              <Section heading="Data retention">
                <p>
                  Email addresses are kept until the subscriber unsubscribes or
                  requests removal. Contact form messages are kept as long as
                  needed to handle the inquiry. Download records are kept
                  indefinitely.
                </p>
              </Section>

              <Section heading="Children">
                <p>
                  The site includes material intended for children to read, and
                  the site itself is meant to be used by adults. We do not
                  knowingly collect personal information from children under 13.
                  If you believe a child has given us their email address, write
                  to us and we will delete it.
                </p>
              </Section>

              <Section heading="Your choices">
                <p>
                  You may unsubscribe at any time using the link in any email we
                  send. You may also contact us to ask what information we hold
                  about you, or to request that it be corrected or deleted, at{" "}
                  {mailLink}.
                </p>
              </Section>

              <Section heading="Changes to this policy">
                <p>
                  If we change how we handle information, we will update this
                  page and change the date at the top.
                </p>
              </Section>

              <Section heading="Contact">
                <p>
                  {mailLink}
                  <br />
                  {ENTITY_NAME}
                </p>
              </Section>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
