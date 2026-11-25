import { createFileRoute, Link } from "@tanstack/react-router";
import { READING_LIBRARY_GROUPS, readingLibraryGroup } from "@/lib/reading-library";
import { toParshaComparableKey } from "@/lib/parsha-normalize";
import { resolveHebcalParsha } from "@/lib/hebcal";
import { getParshaOverride } from "@/integrations/supabase/api.functions";
import { BookOpen, ChevronRight } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { fitPageTitle } from "@/lib/page-title";
import { listParshaSeoSummaries } from "@/integrations/supabase/parsha-seo.functions";

export const Route = createFileRoute("/divrei-torah-parsha")({
  loader: async () => {
    const [readings, override, resolved] = await Promise.all([
      listParshaSeoSummaries(),
      getParshaOverride().catch(() => null),
      resolveHebcalParsha().catch(() => null),
    ]);
    return { readings, currentKey: override?.isActive && override.override ? override.override : resolved?.parshaKey ?? null };
  },
  head: () => {
    const title = fitPageTitle("Divrei Torah on the Parsha", " — Weekly Dvar Torah Library");
    const description =
      "Browse Divrei Torah on every weekly parsha: short vorts, printable Torah sheets, family-table material, stories, essays and deeper learning.";
    const url = "https://torahforthetable.com/divrei-torah-parsha";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah For The Table" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Divrei Torah on the Parsha",
            description,
            url,
            isPartOf: {
              "@type": "WebSite",
              name: "Torah For The Table",
              url: "https://torahforthetable.com",
            },
          }),
        },
      ],
    };
  },
  component: DivreiTorahParshaPage,
});

function DivreiTorahParshaPage() {
  const { readings: parshiyos, currentKey } = Route.useLoaderData();
  const available = parshiyos.filter((p) => p.count > 0);
  const current = currentKey ? available.find(p => toParshaComparableKey(p.parsha_key) === toParshaComparableKey(currentKey)) : undefined;
  const totalSelections = available.reduce((sum, reading) => sum + reading.count, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-readable">
            Weekly Torah Library
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-primary sm:text-5xl">
            Divrei Torah on the Parsha
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Find Divrei Torah for the weekly parsha, including short vorts, printable Torah sheets,
            stories, family-table material and longer essays. Each parsha page brings together the
            available selections from current and previous years in one permanent place.
          </p>
        </header>

        <section className="mt-10 rounded-2xl border border-accent/25 bg-card/30 p-5 sm:p-7">
          <h2 className="font-serif text-2xl font-bold text-primary">Browse by Parsha or Yom Tov</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose a reading to explore its published selections across available years. Combined Parshiyos and Yom Tov collections are included.
          </p>

          <div className="mt-5 rounded-xl border border-accent/40 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-readable">This Week</p>
            {current ? <><p className="mt-1 font-serif text-xl font-bold text-primary">{current.label}</p>{current.permanentParsha ? <Link to="/parsha/$slug" params={{ slug: current.slug }} className="mt-2 inline-block underline text-primary">Browse all editions</Link> : <Link to="/archive" search={{ parsha: current.parsha_key }} className="mt-2 inline-block underline text-primary">Browse all editions</Link>}</> : <p className="mt-1 text-sm text-muted-foreground">See the weekly page for current publishing updates.</p>}
            <Link to="/" hash="this-weeks-collection" className="mt-2 block text-sm underline text-primary">This week’s selections and updates</Link>
          </div>
          {READING_LIBRARY_GROUPS.map(group => {
            const entries = available.filter(p => readingLibraryGroup(p.parsha_key) === group.id);
            if (!entries.length && group.id === "other-readings") return null;
            return <section key={group.id} id={group.id} className="mt-6 scroll-mt-24"><h3 className="font-serif text-xl font-bold text-primary">{group.label}</h3>
            {!entries.length && <p className="mt-2 text-sm text-muted-foreground">Selections will appear as the library grows.</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((parsha) => {
              const className = "group flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-background/70 p-4 transition-colors hover:border-accent/60 hover:bg-accent/5";
              const card = <><div className="min-w-0"><h4 className="font-serif text-lg font-bold text-primary">{parsha.label}</h4><p className="mt-1 text-xs text-muted-foreground">{`${parsha.count} ${parsha.count === 1 ? "selection" : "selections"}`}</p></div><ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" /></>;
              return parsha.permanentParsha ? (
                <Link key={parsha.slug} to="/parsha/$slug" params={{ slug: parsha.slug }} className={className}>{card}</Link>
              ) : (
                <Link key={parsha.slug} to="/archive" search={{ parsha: parsha.parsha_key }} className={className}>{card}</Link>
              );
            })}
            </div></section>;
          })}
          <p className="mt-5 text-sm text-muted-foreground">
            Additional parsha pages will appear automatically as material is added to the archive.
          </p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-accent/25 bg-card/25 p-5">
            <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-xl font-bold text-primary">For the Shabbos Table</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The library helps you find something for children, the whole family,
              or deeper learning — whether you want a one-minute vort or a longer piece to learn.
            </p>
          </article>
          <article className="rounded-2xl border border-accent/25 bg-card/25 p-5">
            <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-xl font-bold text-primary">Printable Divrei Torah</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Many selections are available as clean PDFs that can be printed before Shabbos and
              brought directly to the table.
            </p>
          </article>
        </section>

        {available.length > 0 && (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            {`${totalSelections} published selections across ${available.length} reading collections. Additional collections appear as the library grows.`}
          </p>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
