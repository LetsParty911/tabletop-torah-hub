import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

const PRIVACY_EMAIL = "hello@torahforthetable.com";
const ENTITY_NAME = "Torah For The Table Inc.";
const LAST_UPDATED = "August 4, 2026";

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
      "What Torah for the Table collects, why, and how to unsubscribe or request deletion. No advertising, no selling of your information.";
    const url = "https://torahforthetable.com/privacy";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
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
                Torah for the Table is a free service. We do not sell
                advertising, we do not sell or rent your information, and we
                collect as little as we can while still keeping the site working
                and knowing whether it is useful. This policy explains exactly
                what we collect and why.
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
                      subscribed. We use it for one thing: sending you a message
                      when the new weekly collection is ready. We do not use it
                      for anything else, and we do not share it with other
                      organizations. Every email we send includes an unsubscribe
                      link. That link is unique to you and removes you from the
                      list immediately, without needing to log in or contact us.
                      You can also write to us and we will remove you.
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
                      publication it was and roughly where in the world the
                      request came from — city, region, country, and time zone,
                      as reported by our hosting provider. We want to be
                      specific about what this is not: we do not store your IP
                      address, your device information, your name, or your email
                      address alongside these records, and they are not linked
                      to your subscription if you have one. We cannot tell from
                      this data which downloads were yours. We use it to
                      understand which publications are worth continuing to
                      include and roughly where the site is being used.
                    </p>
                  </Sub>

                  <Sub heading="4. Site analytics">
                    <p>
                      We use Google Tag Manager and Google Analytics to
                      understand general usage — which pages are visited, which
                      publications are downloaded or printed, and whether the
                      signup forms are working. These record page addresses and
                      the type of action taken. Google may set cookies in your
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
                      . We do not run analytics on the site's administrative
                      pages.
                    </p>
                  </Sub>

                  <Sub heading="5. Information stored in your own browser">
                    <p>
                      The site stores a small number of values in your browser's
                      local and session storage. These are not tracking
                      identifiers and are never sent to us. They exist so that
                      the email popup does not reappear after you have dismissed
                      it or already signed up, and so the site can work offline
                      and load faster as an installed app. You can clear these
                      at any time through your browser settings.
                    </p>
                  </Sub>
                </div>
              </Section>

              <Section heading="What we do not do">
                <ul className="list-disc space-y-1 pl-6">
                  <li>We do not sell, rent, or trade your information.</li>
                  <li>We do not display advertising.</li>
                  <li>
                    We do not use your information to build a profile of you.
                  </li>
                  <li>We do not require an account to use the site.</li>
                </ul>
              </Section>

              <Section heading="Who else touches this data">
                <p>
                  We use a small number of service providers to run the site.
                  They process data only to provide their service to us:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li>Cloudflare — hosting and content delivery</li>
                  <li>
                    Supabase — database storage for subscriptions and download
                    records
                  </li>
                  <li>Google — Tag Manager and Analytics</li>
                  <li>Resend — sending the weekly email</li>
                </ul>
                <p>
                  We may also disclose information if we are legally required to
                  do so.
                </p>
              </Section>

              <Section heading="How long we keep it">
                <p>
                  We keep your email address until you unsubscribe or ask us to
                  remove it. Contact form messages are kept as long as needed to
                  handle your inquiry. Download records are kept indefinitely in
                  aggregate form, since they contain no information identifying
                  you.
                </p>
              </Section>

              <Section heading="Children">
                <p>
                  The site includes material intended for children to read, and
                  we are glad when families use it together. The site itself is
                  meant to be used by adults, and we do not knowingly collect
                  personal information from children under 13. If you believe a
                  child has given us their email address, write to us and we
                  will delete it.
                </p>
              </Section>

              <Section heading="Your choices and rights">
                <p>
                  Whatever your location, you may unsubscribe at any time using
                  the link in any email we send, ask us what information we hold
                  about you, and ask us to correct or delete it. Depending on
                  where you live, you may have additional rights under laws such
                  as the GDPR or the CCPA. We aim to honor these requests for
                  everyone, not only where required. Write to {mailLink} and we
                  will respond.
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
