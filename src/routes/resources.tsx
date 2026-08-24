import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { VORTS, getVortsForParsha } from "@/data/vorts";
import { resolveHebcalParsha } from "@/lib/hebcal";
import { getParshaOverride } from "@/integrations/supabase/api.functions";
import { toParshaComparableKey } from "@/lib/parsha-normalize";

// Resolves the live parsha the same way the homepage and Short Vorts page do,
// so this preview never shows a future week's content ahead of its release.
async function loadSampleVort(): Promise<{ vorts: typeof VORTS[number]["vorts"]; parshaKey: string }> {
  let parshaKey: string | null = null;

  try {
    const o = await getParshaOverride();
    if (o.override && o.isActive) parshaKey = o.override;
  } catch {
    // ignore
  }

  if (!parshaKey) {
    const resolved = await resolveHebcalParsha();
    parshaKey = resolved.parshaKey;
  }

  const vorts = getVortsForParsha(parshaKey);
  if (vorts.length > 0) return { vorts: vorts.slice(0, 2), parshaKey: parshaKey ?? "" };

  // Live week has no vorts written yet — search backward from the live
  // week's position in the cycle for the most recent one that does. Never
  // fall through to the end of the array, since later entries can be future
  // weeks already authored ahead of their release.
  const liveComparable = parshaKey ? toParshaComparableKey(parshaKey) : null;
  const liveIndex = liveComparable
    ? VORTS.findIndex((p) => toParshaComparableKey(p.parshaKey) === liveComparable)
    : -1;
  const searchFrom = liveIndex >= 0 ? liveIndex - 1 : VORTS.length - 1;
  for (let i = searchFrom; i >= 0; i--) {
    if (VORTS[i].vorts.length > 0) {
      return { vorts: VORTS[i].vorts.slice(0, 2), parshaKey: VORTS[i].parshaKey };
    }
  }
  return { vorts: [], parshaKey: "" };
}

const QA_SAMPLES: Array<{ q: string; a: string; source: string }> = [
  {
    q: "Why does the Torah say “these are the words that Moshe spoke” rather than naming the sins directly?",
    a: "Rashi explains that Moshe hinted at the failures by naming the places where they happened, out of respect for Klal Yisroel.",
    source: "Rashi, Devarim 1:1",
  },
  {
    q: "What does Rashi learn from the words “the small as the great” in judgment?",
    a: "A judge must treat a dispute over a small sum with the same care as one over a large sum, because to the litigant no case is small.",
    source: "Rashi, Devarim 1:17",
  },
  {
    q: "Why is the word “Eichah” used by Moshe, and where else do we hear it?",
    a: "Moshe asks “Eichah esa levadi” — how can I carry you alone. The same word opens Megillas Eichah, connecting the burden of leadership with the mourning of the nation.",
    source: "Devarim 1:12; Midrash Eichah Rabbah",
  },
  {
    q: "Kids’ Corner riddle: I am counted every day for seven weeks, but I am not a coin. What am I?",
    a: "The Omer — we count it each night from Pesach until Shavuos.",
    source: "Vayikra 23:15",
  },
];

export const Route = createFileRoute("/resources")({
  component: ResourcesPage,
  loader: () => loadSampleVort(),
  head: () => {
    const title = "Original Torah Learning Resources — Torah for the Table";
    const description =
      "Original educational material created in-house for the Shabbos table: Short Vorts, source-based Torah stories, and Parsha questions and answers for children — all free of charge.";
    const url = "https://torahforthetable.com/resources";
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

function Divider() {
  return (
    <div className="gold-divider" aria-hidden>
      <span className="gold-divider-dot" />
    </div>
  );
}

function ResourcesPage() {
  const { vorts: SAMPLE_VORTS, parshaKey: SAMPLE_VORTS_PARSHA } = Route.useLoaderData();
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
                Original Torah Learning Resources
              </h1>
            </div>

            <div className="mt-8 space-y-8 max-w-2xl mx-auto text-left font-serif text-base sm:text-lg text-foreground leading-relaxed">
              <p>
                Torah For The Table does more than collect and share Torah publications each
                week. Our team creates original educational material designed specifically for
                the Shabbos table — including Short Vorts, source-based stories, and Parsha
                questions and answers for children. All materials are provided free of charge in
                furtherance of our religious and educational mission.
              </p>

              <Divider />

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">Short Vorts</h2>
                <p className="mt-2">
                  Brief, focused divrei Torah written in-house each week. Each vort is drawn from
                  a classical source — Rashi, Midrash, or Chazal — and rewritten in a few
                  sentences so it can be said over at the table without preparation.
                </p>
                {SAMPLE_VORTS.length > 0 && (
                  <div className="mt-5 space-y-4">
                    {SAMPLE_VORTS.map((v) => (
                      <article
                        key={v.id}
                        className="rounded-xl border border-accent/30 bg-card/40 p-4 sm:p-5"
                      >
                        <h3 className="font-serif text-lg font-bold text-primary">{v.title}</h3>
                        <p className="mt-2 text-base leading-relaxed text-foreground">{v.text}</p>
                        <p className="mt-2 text-sm italic text-muted-foreground">
                          {v.source}
                          {SAMPLE_VORTS_PARSHA ? ` · Parshas ${SAMPLE_VORTS_PARSHA}` : ""}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-base">
                  <Link to="/short-vorts" className="text-accent underline hover:text-primary">
                    Read all Short Vorts →
                  </Link>
                </p>
              </section>

              <Divider />

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">
                  Shabbos Table Torah Stories
                </h2>
                <p className="mt-2">
                  Source-based stories from Chazal and Tanach, retold for the table. Each story
                  opens with the original Hebrew pasuk or maamar Chazal and its translation,
                  followed by a retelling in plain English and a “For the Table” discussion
                  question meant to draw everyone into the conversation.
                </p>

                <article className="mt-5 rounded-xl border border-accent/30 bg-card/40 p-4 sm:p-5">
                  <h3 className="font-serif text-lg font-bold text-primary">
                    R’ Chanina ben Dosa and the Vinegar That Burned
                  </h3>

                  <p
                    lang="he"
                    dir="rtl"
                    className="mt-3 font-serif text-lg leading-loose text-foreground"
                  >
                    מִי שֶׁאָמַר לְשֶׁמֶן וְיִדְלוֹק, הוּא יֹאמַר לַחוֹמֶץ וְיִדְלוֹק
                  </p>
                  <p className="mt-2 text-sm italic text-muted-foreground">
                    “The One who told oil to burn will tell vinegar to burn.” — Taanis 25a
                  </p>

                  <p className="mt-4 text-base leading-relaxed">
                    R’ Chanina ben Dosa lived in deep poverty, yet his home was known for its
                    quiet faith. One Erev Shabbos his daughter came to him distressed: she had
                    mistakenly filled the Shabbos lamps with vinegar instead of oil, and there was
                    nothing left to replace it. The lights would go out, and the house would sit
                    dark through Shabbos.
                  </p>
                  <p className="mt-3 text-base leading-relaxed">
                    Her father answered her without alarm: “The One who told oil to burn will tell
                    vinegar to burn.” The lamps were lit, and Chazal tell us they burned all
                    through Shabbos — long enough that the flame was still used for the Havdalah
                    candle at the end of the day.
                  </p>
                  <p className="mt-3 text-base leading-relaxed">
                    The point of the story is not the miracle itself. It is that R’ Chanina saw no
                    difference between oil and vinegar: neither one burns on its own. What we call
                    ordinary is simply the miracle we have grown used to.
                  </p>

                  <div className="mt-4 rounded-lg border border-accent/40 bg-accent/10 p-3 sm:p-4">
                    <p className="font-serif text-sm font-bold uppercase tracking-wide text-primary">
                      For the Table
                    </p>
                    <p className="mt-1 text-base leading-relaxed">
                      What is something in our week that we treat as ordinary but is really a gift
                      we could not produce ourselves?
                    </p>
                  </div>
                </article>
              </section>

              <Divider />

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">
                  Mi Ka’amcha Yisroel
                </h2>
                <p className="mt-2">
                  A weekly piece that uses parashah insights to discuss communication and positive
                  speech. Each installment takes a moment from the parsha where words shape an
                  outcome — a blessing, a rebuke, a report — and draws out a practical point about
                  how we speak to family, friends, and neighbors.
                </p>
              </section>

              <Divider />

              <section>
                <h2 className="font-serif text-2xl font-bold text-primary">
                  Parsha Questions &amp; Answers
                </h2>
                <p className="mt-2">
                  Twenty source-based questions and answers on the parsha each week, written for
                  learning together at the table. Every set is accompanied by a Kids’ Corner page
                  with riddles and picture puzzles so younger children have their own way in.
                </p>
                <dl className="mt-5 space-y-4">
                  {QA_SAMPLES.map((item) => (
                    <div
                      key={item.q}
                      className="rounded-xl border border-accent/30 bg-card/40 p-4 sm:p-5"
                    >
                      <dt className="font-serif text-base font-bold text-primary sm:text-lg">
                        {item.q}
                      </dt>
                      <dd className="mt-2 text-base leading-relaxed text-foreground">
                        {item.a}
                        <span className="mt-2 block text-sm italic text-muted-foreground">
                          {item.source}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <Divider />

              <p className="text-center">
                Looking for the full weekly collection?{" "}
                <Link to="/archive" className="text-accent underline hover:text-primary">
                  Browse the archive of past weeks →
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
