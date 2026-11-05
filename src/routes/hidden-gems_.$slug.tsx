import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Printer, ExternalLink } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { GematriaMotif } from "@/components/HiddenGem";
import { HIDDEN_GEMS_NAME, HIDDEN_GEMS_TAGLINE, hiddenGemBySlug } from "@/lib/hidden-gems";

export const Route = createFileRoute("/hidden-gems_/$slug")({
  loader: ({ params }) => {
    const gem = hiddenGemBySlug(params.slug);
    if (!gem) throw notFound();
    return gem;
  },
  component: HiddenGemReader,
  head: ({ loaderData: gem }) => ({
    meta: [
      { title: gem ? `${gem.title} | Torah For The Table` : "Gem unavailable | Torah For The Table" },
      { name: "description", content: gem?.opening ?? "This Hidden Gems edition is unavailable." },
      { property: "og:title", content: gem ? `${gem.title} | Torah For The Table` : "Gem unavailable | Torah For The Table" },
      { property: "og:description", content: gem?.opening ?? "This Hidden Gems edition is unavailable." },
      { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
      ...(!gem ? [{ name: "robots", content: "noindex" }] : []),
    ],
    links: gem ? [{ rel: "canonical", href: `https://torahforthetable.com/hidden-gems/${gem.slug}` }] : [],
  }),
});
function HiddenGemReader() {
  const gem = Route.useLoaderData();
  return (
    <div className="hidden-gem-page min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="gem-screen-controls mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild className="min-h-11 w-full sm:w-auto">
            <Link to="/" hash="this-weeks-collection"><ArrowLeft aria-hidden="true" /> Back to This Week’s Selections</Link>
          </Button>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <Button asChild variant="link" className="min-h-11 px-0">
              <Link to="/hidden-gems">All Hidden Gems</Link>
            </Button>
            <Button onClick={() => window.print()} className="min-h-11"><Printer aria-hidden="true" /> Print</Button>
          </div>
        </div>
        <article className="hidden-gem-print">
          <header className="border-b border-accent/30 pb-5 text-center">
            <p className="text-sm font-semibold text-accent-readable">Torah For The Table · {HIDDEN_GEMS_NAME}</p>
            <p className="mt-1 text-xs text-muted-foreground">{HIDDEN_GEMS_TAGLINE}</p>
            <p className="mt-4 text-sm text-accent-readable">{gem.subseries}</p>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-tight text-primary sm:text-4xl">{gem.title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{gem.subheading}</p>
          </header>
          <div className="gem-body mt-5 space-y-4 text-base leading-relaxed text-foreground">
            <p>{gem.opening}</p>
            <p>Ephron’s name is normally spelled <bdi lang="he" dir="rtl">עפרון</bdi>. In Bereishis 23:16, the Torah omits the letter <bdi lang="he" dir="rtl">ו</bdi>, spelling it <bdi lang="he" dir="rtl">עפרן</bdi>.</p>
          </div>
          <GematriaMotif gem={gem} />
          <p className="text-center text-sm font-semibold text-accent-readable">{gem.priceLine}</p>
          <p className="gem-explanation mt-5 text-base leading-relaxed text-foreground">{gem.explanation}</p>
          <section aria-labelledby="gem-reflection-heading" className="gem-reflection mt-6 border-l-2 border-accent/60 pl-5">
            <h2 id="gem-reflection-heading" className="text-sm font-semibold text-accent-readable">A Shabbos-table reflection from Torah For The Table</h2>
            <p className="mt-2 font-serif text-xl leading-relaxed text-primary">{gem.reflection}</p>
          </section>
          <section aria-label="Baal HaTurim source" className="gem-source mt-6 border-t border-accent/30 pt-4">
            <p lang="he" dir="rtl" className="gem-hebrew text-right font-serif text-lg text-primary">{gem.sourceLine}</p>
            <blockquote lang="he" dir="rtl" className="gem-hebrew mt-2 text-right font-serif text-lg leading-relaxed text-foreground">{gem.sourceText}</blockquote>
            <a href={gem.sourceUrl} target="_blank" rel="noopener noreferrer" className="gem-screen-controls mt-3 inline-flex items-center gap-1 text-sm text-accent-readable underline hover:text-primary">Baal HaTurim, Bereishis 23:16 <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
          </section>
          <p className="mt-5 text-center text-xs text-muted-foreground">torahforthetable.com/hidden-gems</p>
        </article>
        <nav aria-label="Continue browsing" className="gem-screen-controls mt-8 flex flex-col items-stretch justify-center gap-3 border-t border-accent/30 pt-5 sm:flex-row sm:items-center">
          <Button asChild className="min-h-11 w-full sm:w-auto">
            <Link to="/" hash="this-weeks-collection"><ArrowLeft aria-hidden="true" /> Back to This Week’s Selections</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
            <Link to="/hidden-gems">All Hidden Gems</Link>
          </Button>
        </nav>
      </div>
      <SiteFooter />
    </div>
  );
}