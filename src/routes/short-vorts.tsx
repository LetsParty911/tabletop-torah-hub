import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { WeeklyEmailSignup } from "@/components/WeeklyEmailSignup";
import { SiteFooter } from "@/components/SiteFooter";
import { resolveHebcalParsha } from "@/lib/hebcal";
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
    const resolved = await resolveHebcalParsha();
    parshaKey = resolved.parshaKey;
    label = resolved.label;
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

function ParshaSection({
  id,
  heading,
  vorts,
  defaultOpen,
}: {
  id: string;
  heading: string;
  vorts: Vort[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-card/40">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-4 text-left transition-colors hover:bg-accent/10"
        >
          <span className="font-serif text-lg font-bold text-primary sm:text-xl">
            {heading}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {vorts.length} {vorts.length === 1 ? "vort" : "vorts"}
            </span>
            <ChevronDown
              className={`h-5 w-5 text-accent transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </button>
      </h2>
      {open && (
        <div id={`${id}-panel`} className="px-4 pb-5">
          {vorts.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {vorts.map((v) => (
                <VortCard key={v.id} vort={v} />
              ))}
            </div>
          ) : (
            <div className="parchment-frame">
              <div className="parchment-panel text-center">
                <p className="text-sm text-muted-foreground">
                  Vorts for {heading} are being prepared. In the meantime, browse the earlier
                  weeks below, or download this week's full collection.
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
        </div>
      )}
    </section>
  );
}

function sectionId(key: string): string {
  return `vorts-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function ShortVortsPage() {
  const { label, parshaKey, current } = Route.useLoaderData();
  const normalizedCurrent = (parshaKey ?? "")
    .replace(/^parshas\s+/i, "")
    .trim()
    .toLowerCase();
  const others = VORTS.filter((p) => p.parshaKey.toLowerCase() !== normalizedCurrent);

  const sections = [
    { key: "current", heading: `This Week — ${label}`, vorts: current, defaultOpen: true },
    ...others.map((p) => ({
      key: p.parshaKey,
      heading: `Parshas ${p.parshaKey}`,
      vorts: p.vorts,
      defaultOpen: false,
    })),
  ].map((s) => ({ ...s, id: sectionId(s.key) }));

  const jumpTo = (id: string) => {
    if (!id || typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

        <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <label
            htmlFor="parsha-jump"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Jump to Parshas
          </label>
          <select
            id="parsha-jump"
            defaultValue=""
            onChange={(e) => jumpTo(e.target.value)}
            className="w-full max-w-xs rounded-full border-2 border-accent/50 bg-background px-4 py-2 font-serif text-sm text-foreground transition-colors focus:border-primary focus:outline-none"
          >
            <option value="">Select a Parshas…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.heading}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-8 space-y-4">
          {sections.map((s) => (
            <ParshaSection
              key={s.id}
              id={s.id}
              heading={s.heading}
              vorts={s.vorts}
              defaultOpen={s.defaultOpen}
            />
          ))}
        </div>

        <div className="mt-14">
          <WeeklyEmailSignup sourceId="short-vorts" />
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/archive"
            search={{ year: "all", parsha: "all", audience: "All", q: "" }}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Browse the full archive
          </Link>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}
