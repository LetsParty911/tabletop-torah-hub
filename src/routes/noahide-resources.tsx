import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";

/**
 * DRAFT page — copy is pending owner and rabbinic approval.
 * `robots: noindex` and the absent sitemap entry keep it out of search
 * until that approval lands; remove both then, not before.
 */
export const Route = createFileRoute("/noahide-resources")({
  component: NoahideResourcesPage,
  head: () => {
    const title = "The Seven Noahide Laws | Resources for Visitors — Torah For The Table";
    const description =
      "A starting place for non-Jewish visitors who want to learn about the Torah's universal guidance for mankind: two external educational resources on the Seven Noahide Laws.";
    const url = "https://torahforthetable.com/noahide-resources";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah For The Table" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

type NoahideResource = {
  wordmark: string;
  domain: string;
  blurb: string;
  href: string;
};

const RESOURCES: NoahideResource[] = [
  {
    wordmark: "Ask Noah International",
    domain: "asknoah.org",
    blurb: "Dedicated guidance and learning about the Seven Noahide Commandments.",
    href: "https://asknoah.org/7-commandments",
  },
  {
    wordmark: "Chabad.org",
    domain: "chabad.org",
    blurb: "An accessible introduction to the Seven Laws of Noah.",
    href: "https://www.chabad.org/library/article_cdo/aid/5559665/jewish/The-Seven-Laws-of-Noah.htm",
  },
];

function ResourceCard({ resource }: { resource: NoahideResource }) {
  return (
    <article className="flex flex-col rounded-xl border border-accent/25 bg-card p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      <h2 className="font-serif text-xl font-bold tracking-tight text-primary sm:text-[1.4rem]">
        {resource.wordmark}
      </h2>
      <span aria-hidden="true" className="mt-2.5 h-px w-10 bg-gold-decorative/70" />
      <p className="mt-3 flex-1 font-serif text-base leading-relaxed text-foreground">
        {resource.blurb}
      </p>
      <p className="mt-4">
        <a
          href={resource.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-serif text-sm font-semibold text-accent underline underline-offset-4 transition-colors hover:text-primary sm:text-base"
        >
          Visit {resource.domain}
          <span className="sr-only"> (opens in a new tab)</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </a>
      </p>
    </article>
  );
}

function NoahideResourcesPage() {
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
              <p className="mt-6 font-serif text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-accent sm:text-xs">
                Resources for Visitors
              </p>
              <h1 className="mt-3 font-serif text-3xl font-bold text-primary sm:text-4xl md:text-5xl">
                The Seven Noahide Laws
              </h1>
              <div className="gold-divider mt-5" aria-hidden>
                <span className="gold-divider-dot" />
              </div>
            </div>

            <p className="mx-auto mt-7 max-w-2xl text-center font-serif text-base leading-relaxed text-foreground sm:text-lg">
              If you are not Jewish and would like to learn about the Torah’s universal guidance
              for mankind, these resources are a place to begin.
            </p>

            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-5 md:grid-cols-2">
              {RESOURCES.map((resource) => (
                <ResourceCard key={resource.domain} resource={resource} />
              ))}
            </div>

            <p className="mx-auto mt-8 max-w-xl border-t border-accent/20 pt-5 text-center text-xs leading-relaxed text-muted-foreground sm:text-sm">
              These are external educational resources. Please consult a qualified rabbi for
              guidance.
            </p>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
