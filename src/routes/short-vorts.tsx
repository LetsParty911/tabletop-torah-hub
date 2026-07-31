import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";
import { getParshaOverride } from "@/integrations/supabase/api.functions";
import { VORTS, getVortsForParsha, type Vort } from "@/data/vorts";

type LoaderData = {
  label: string;
  parshaKey: string | null;
  current: Vort[];
};

async function loadVortsWeek(): Promise<LoaderData> {
  let label = "Parshas Hashavua";
  let parshaKey: string | null = null;

  try {
    const o = await getParshaOverride();
    if (o.override && o.isActive) {
      parshaKey = o.override;
      label = o.override.startsWith("Parshas") ? o.override : `Parshas ${o.override}`;
    }
  } catch {
    // ignore
  }

  if (!parshaKey) {
    try {
      const res = await fetch(
        "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on",
      );
      const data = await res.json();
      const items: Array<{ title: string; category: string; subcat?: string; date: string }> =
        data?.items ?? [];
      const parsha = items.find((i) => i.category === "parashat");
      const yomTovOnShabbos = parsha
        ? items.find(
            (i) =>
              i.category === "holiday" &&
              i.subcat === "major" &&
              i.date.slice(0, 10) === parsha.date.slice(0, 10),
          )
        : undefined;
      if (yomTovOnShabbos) {
        parshaKey = hebcalYomTovToKey(yomTovOnShabbos.title) ?? yomTovOnShabbos.title;
        label = parshaKey;
      } else if (parsha) {
        parshaKey = hebcalToParshaKey(parsha.title);
        label = `Parshas ${parshaKey}`;
      }
    } catch (e) {
      console.error("Hebcal load error (vorts)", e);
    }
  }

  return { label, parshaKey, current: getVortsForParsha(parshaKey) };
}

export const Route = createFileRoute("/short-vorts")({
  component: ShortVortsPage,
  loader: () => loadVortsWeek(),
  head: ({ loaderData }) => {
    const title = "Short Vorts — Quick Insights for the Table";
    const description =
      "Bite-sized Torah vorts on Parshas Hashavua — one-minute insights from Rashi, Midrash and Chazal, ready to share at the Shabbos table.";
    const url = "https://torahforthetable.com/short-vorts";
    const image = "https://torahforthetable.com/og-image.png";

    const all = (loaderData?.current?.length ? loaderData.current : VORTS[0]?.vorts ?? []).slice(0, 20);

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
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description,
            url,
            isPartOf: {
              "@type": "WebSite",
              name: "Torah for the Table",
              url: "https://torahforthetable.com",
            },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: all.length,
              itemListElement: all.map((v, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: v.title,
                description: v.text,
              })),
            },
          }),
        },
      ],
    };
  },
});

function VortCard({ vort }: { vort: Vort }) {
  return (
    <article className="parchment-frame">
      <div className="parchment-panel">
        <h3 className="font-serif text-lg font-bold text-primary">{vort.title}</h3>
        <div className="my-3 h-px w-16 bg-accent/60" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-foreground">{vort.text}</p>
        <p className="mt-3 text-xs italic text-muted-foreground">{vort.source}</p>
      </div>
    </article>
  );
}

function ShortVortsPage() {
  const { label, parshaKey, current } = Route.useLoaderData();
  const others = VORTS.filter(
    (p) => p.parshaKey.toLowerCase() !== (parshaKey ?? "").replace(/^parshas\s+/i, "").trim().toLowerCase(),
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <header className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Quick Insights for the Table
          </p>
          <h1 className="mt-4 font-serif text-3xl font-bold text-primary sm:text-4xl">
            Short Vorts on Parshas Hashavua
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            One-minute Torah thoughts you can say over at the Shabbos table — drawn from
            Rashi, Midrash and Chazal. Short enough to remember, sharp enough to start a
            conversation.
          </p>
        </header>

        <section className="mt-10" aria-labelledby="this-week-vorts">
          <h2 id="this-week-vorts" className="font-serif text-2xl font-bold text-primary">
            This Week — {label}
          </h2>
          {current.length > 0 ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {current.map((v: Vort) => (
                <VortCard key={v.id} vort={v} />
              ))}
            </div>
          ) : (
            <div className="parchment-frame mt-5">
              <div className="parchment-panel text-center">
                <p className="text-sm text-muted-foreground">
                  Vorts for {label} are being prepared. In the meantime, browse the vorts below,
                  or download this week's full collection.
                </p>
                <Link
                  to="/"
                  className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Browse this week's collection
                </Link>
              </div>
            </div>
          )}
        </section>

        {others.length > 0 && (
          <section className="mt-14" aria-labelledby="more-vorts">
            <h2 id="more-vorts" className="font-serif text-2xl font-bold text-primary">
              More Short Vorts by Parshas
            </h2>
            <div className="mt-5 space-y-8">
              {others.map((p) => (
                <div key={p.parshaKey}>
                  <h3 className="font-serif text-lg font-semibold text-foreground">
                    Parshas {p.parshaKey}
                  </h3>
                  <div className="mt-3 grid gap-5 sm:grid-cols-2">
                    {p.vorts.map((v: Vort) => (
                      <VortCard key={v.id} vort={v} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-14 text-center">
          <Link
            to="/archive"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Browse the full archive
          </Link>
        </div>
      </div>
    </div>
  );
}
