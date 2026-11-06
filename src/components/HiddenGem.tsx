import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HIDDEN_GEMS_NAME, HIDDEN_GEMS_TAGLINE, homepageHiddenGem, type HiddenGem, type HomepageGemContext } from "@/lib/hidden-gems";

export function GematriaMotif({ gem, compact = false }: { gem: HiddenGem; compact?: boolean }) {
  return (
    <div className={`gematria-motif grid grid-cols-1 divide-y divide-accent/25 border-y border-accent/30 sm:grid-cols-3 sm:divide-x sm:divide-y-0 ${compact ? "my-3" : "my-6"}`}>
      {gem.equations.map((equation) => (
        <div key={equation.hebrew} className={`text-center ${compact ? "px-3 py-2" : "px-4 py-4"}`}>
          <p dir="ltr" className={`font-serif font-bold text-primary ${compact ? "text-xl" : "text-3xl"}`}>
            <bdi lang="he" dir="rtl">{equation.hebrew}</bdi>{" = "}{equation.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{equation.label}</p>
        </div>
      ))}
      <div className={`text-center ${compact ? "px-3 py-2" : "px-4 py-4"}`}>
        <p className={`font-serif font-bold text-accent-readable ${compact ? "text-xl" : "text-3xl"}`}>{gem.price} <span className="text-base">shekalim</span></p>
        <p className="mt-1 text-xs text-muted-foreground">Ephron’s price</p>
      </div>
    </div>
  );
}
export function HiddenGemTeaser({ context, initialNow }: { context: HomepageGemContext; initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const gem = homepageHiddenGem(context, new Date(now));
  if (!gem) return null;
  return (
    <section aria-labelledby="hidden-gem-heading" className="rounded-2xl border border-accent/40 bg-card/50 px-5 py-5 shadow-sm sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="hidden-gem-heading" className="font-serif text-xl font-bold text-primary">{HIDDEN_GEMS_NAME}</h2>
        <p className="text-xs text-accent-readable">{gem.subseries} · {gem.parshaLabel}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{HIDDEN_GEMS_TAGLINE}</p>
      <h3 className="mt-3 font-serif text-xl font-bold text-primary">{gem.title}</h3>
      <GematriaMotif gem={gem} compact />
      <div className="flex justify-end"><Button asChild className="min-h-11"><Link to="/hidden-gems/$slug" params={{ slug: gem.slug }}>Read &amp; Print <ArrowRight aria-hidden="true" /></Link></Button></div>
    </section>
  );
}