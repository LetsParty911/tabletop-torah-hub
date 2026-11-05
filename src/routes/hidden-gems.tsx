import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { GematriaMotif } from "@/components/HiddenGem";
import { HIDDEN_GEMS_NAME, HIDDEN_GEMS_TAGLINE, hiddenGemEditions } from "@/lib/hidden-gems";

export const Route = createFileRoute("/hidden-gems")({
  component: HiddenGemsArchive,
  head: () => ({
    meta: [
      { title: "Hidden Gems of the Parsha | Torah For The Table" },
      { name: "description", content: HIDDEN_GEMS_TAGLINE },
      { property: "og:title", content: "Hidden Gems of the Parsha | Torah For The Table" },
      { property: "og:description", content: HIDDEN_GEMS_TAGLINE },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://torahforthetable.com/hidden-gems" }],
  }),
});
function HiddenGemsArchive() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6">
          <Button asChild className="min-h-11 w-full sm:w-auto">
            <Link to="/" hash="this-weeks-collection"><ArrowLeft aria-hidden="true" /> Back to This Week’s Selections</Link>
          </Button>
        </div>
        <p className="text-sm text-accent-readable">Torah For The Table</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-primary sm:text-4xl">{HIDDEN_GEMS_NAME}</h1>
        <p className="mt-3 text-base text-muted-foreground">{HIDDEN_GEMS_TAGLINE}</p>
        {hiddenGemEditions.map((gem) => (
          <article key={gem.slug} className="mt-8 rounded-lg border border-accent/30 bg-card/50 p-5 sm:p-6">
            <p className="text-sm text-accent-readable">{gem.subseries} · {gem.parshaLabel}</p>
            <h2 className="mt-2 font-serif text-2xl font-bold text-primary">{gem.title}</h2>
            <p className="mt-3 text-sm text-foreground">{gem.opening}</p>
            <GematriaMotif gem={gem} compact />
            <Button asChild className="min-h-11"><Link to="/hidden-gems/$slug" params={{ slug: gem.slug }}>Read &amp; Print <ArrowRight aria-hidden="true" /></Link></Button>
          </article>
        ))}
        <div className="mt-8 flex justify-center sm:justify-start">
          <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
            <Link to="/" hash="this-weeks-collection"><ArrowLeft aria-hidden="true" /> Back to This Week’s Selections</Link>
          </Button>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}