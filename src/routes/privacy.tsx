import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

const PRIVACY_EMAIL = "hello@torahforthetable.com";
const LAST_UPDATED = "September 22, 2026";

const mailLink = (
  <a
    href={`mailto:${PRIVACY_EMAIL}`}
    className="text-accent underline hover:text-primary transition-colors"
  >
    {PRIVACY_EMAIL}
  </a>
);

const googlePrivacyLink = (
  <a
    href="https://business.safety.google/privacy/"
    target="_blank"
    rel="noopener noreferrer"
    className="text-accent underline hover:text-primary transition-colors"
  >
    https://business.safety.google/privacy/
  </a>
);

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => {
    const title = "Privacy Policy — Torah for the Table";
    const description = "What information Torah for the Table collects and how it is used.";
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

            <div className="mt-8 space-y-6 font-serif text-base sm:text-lg text-foreground leading-relaxed max-w-2xl mx-auto text-left">
              <p>
                Torah for the Table collects information you choose to provide, such as an email
                address or contact message, and technical and usage information generated when you
                use the site.
              </p>

              <p>
                We use cookies and similar technologies, including first-party analytics and Google
                Analytics, to understand site use, maintain security, and improve the site. Analytics
                may include device and network information, approximate location, referral
                information, site activity, and pseudonymous identifiers. Google explains how it
                processes information from sites that use its services at {googlePrivacyLink}.
              </p>

              <p>
                We may disclose information to service providers that support hosting, analytics,
                security, data storage, and email delivery.
              </p>

              <p>
                You may unsubscribe from emails using the unsubscribe link. Where applicable, you
                may request access to, correction of, or deletion of personal information, or appeal
                a privacy-request decision, by emailing {mailLink}.
              </p>

              <p>
                Material changes to this policy will be posted on this page with a new effective
                date.
              </p>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
