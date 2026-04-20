import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Download, Eye, Printer } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";
import {
  listPublishedPdfs,
  getParshaOverride,
  subscribeEmail,
} from "@/integrations/supabase/api.functions";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Torah for the Table — Weekly Torah Resources" },
      {
        name: "description",
        content:
          "Weekly Torah resources for a more meaningful Shabbos and Yom Tov table. Curated PDFs in one place.",
      },
      { property: "og:title", content: "Torah for the Table" },
      {
        property: "og:description",
        content: "Weekly Torah PDFs curated for Shabbos and Yom Tov.",
      },
    ],
  }),
});

type Resource = {
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
};

function Index() {
  const [email, setEmail] = useState("");
  const [signupMsg, setSignupMsg] = useState<string | null>(null);
  const [currentLabel, setCurrentLabel] = useState<string>("Loading…");
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let displayLabel = "Parshas Hashavua";
      let parshaKey: string | null = null;

      // 1. Check manual override first
      try {
        const o = await getParshaOverride();
        if (o.override) {
          parshaKey = o.override;
          displayLabel = o.override.startsWith("Parshas") ? o.override : `Parshas ${o.override}`;
          // For yom tovim stored without "Parshas" prefix:
          const knownYomTov = ["Rosh Hashanah", "Yom Kippur", "Sukkos", "Shemini Atzeres", "Simchas Torah", "Pesach", "Shavuos"];
          if (knownYomTov.includes(o.override)) displayLabel = o.override;
        }
      } catch {
        // ignore
      }

      // 2. Otherwise, Hebcal
      if (!parshaKey) {
        try {
          const res = await fetch(
            "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on",
          );
          const data = await res.json();
          const items: Array<{
            title: string;
            category: string;
            subcat?: string;
            date: string;
          }> = data?.items ?? [];

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
            const ytKey = hebcalYomTovToKey(yomTovOnShabbos.title);
            parshaKey = ytKey ?? yomTovOnShabbos.title;
            displayLabel = parshaKey;
          } else if (parsha) {
            parshaKey = hebcalToParshaKey(parsha.title);
            displayLabel = `Parshas ${parshaKey}`;
          }
        } catch {
          // fall through
        }
      }

      // 3. Fetch PDFs for parsha key
      let fetchedResources: Resource[] = [];
      if (parshaKey) {
        try {
          const r = await listPublishedPdfs({ data: { parshaKey } });
          fetchedResources = r.resources;
        } catch (e) {
          console.error("Failed to load PDFs", e);
        }
      }

      if (!cancelled) {
        setCurrentLabel(displayLabel);
        setResources(fetchedResources);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);
    try {
      const r = await subscribeEmail({ data: { email } });
      if (r.ok) {
        setSignupMsg("You’re all set — we’ll email you when new Divrei Torah are uploaded and ready to view or download.");
        setEmail("");
      } else {
        setSignupMsg(r.error ?? "Something went wrong.");
      }
    } catch {
      setSignupMsg("Something went wrong.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBanner />
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-14 space-y-5 sm:space-y-8 md:space-y-10">
        {/* Hero */}
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-[2.25rem] leading-[1.05] sm:text-5xl md:text-7xl font-bold tracking-tight text-primary">
              Torah for the Table
            </h1>
            <p className="mt-4 sm:mt-6 font-serif italic text-base sm:text-xl md:text-2xl text-accent max-w-2xl mx-auto">
              Weekly Divrei Torah for a more meaningful Shabbos and Yom Tov table.
            </p>
            <div className="mt-6 sm:mt-10 flex items-center justify-center gap-3 sm:gap-4 text-accent">
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
              <span className="font-sans text-[0.6rem] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.3em]">
                This Week
              </span>
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
            </div>
            <p className="mt-2 sm:mt-3 font-serif text-xl sm:text-2xl md:text-4xl text-primary whitespace-nowrap">
              {currentLabel}
            </p>
            <div className="mt-5 sm:mt-6">
              <Link
                to="/archive"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-primary transition-colors"
              >
                Browse Archive →
              </Link>
            </div>
          </div>
        </section>

        {/* Email signup */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <div className="h-1 w-12 bg-accent rounded-full mb-6" />
            <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl font-bold text-primary">
              Be Notified When This Week’s Divrei Torah Are Ready
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              Receive a weekly email when the latest Divrei Torah for Shabbos and Yom Tov are uploaded and available to view or download on the site.
            </p>
            <form onSubmit={handleSignup} className="mt-6 flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="flex-1 rounded-full border-2 border-accent/60 bg-background px-5 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
              <button
                type="submit"
                className="rounded-full bg-primary px-7 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-md"
              >
                Notify Me
              </button>
            </form>
            <p className="mt-3 text-center text-xs text-muted-foreground/80">
              We’ll only email when new Divrei Torah are posted. No spam.
            </p>
            {signupMsg && <p className="mt-3 text-sm text-accent">{signupMsg}</p>}
          </div>
        </section>

        {/* Resource collection */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl font-bold text-primary text-center">
              This Week's Collection
            </h2>
            <p className="mt-2 text-center font-serif italic text-sm sm:text-base text-accent">
              {loading
                ? "Loading…"
                : `${resources.length} ${resources.length === 1 ? "Devar" : "Divrei"} Torah this week`}
            </p>
            {!loading && resources.length === 0 ? (
              <p className="mt-8 text-center text-muted-foreground">
                No resources published yet for {currentLabel}. Check back soon.
              </p>
            ) : (
              <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2">
                {resources.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-2xl border-2 border-accent/40 bg-background/60 p-4 sm:p-5 hover:border-accent transition-colors flex flex-col"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-accent/15 text-primary shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-serif text-base sm:text-xl font-semibold text-primary line-clamp-2 leading-snug min-h-[2.6em] sm:min-h-[2.5em]">
                          {r.title}
                        </h3>
                        {r.subtitle && (
                          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                            {r.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row gap-2.5 sm:gap-2">
                      <Link
                        to="/view/$id"
                        params={{ id: r.id }}
                        className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-primary/70 px-4 py-2.5 sm:py-2 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                      >
                        <Eye className="h-4 w-4" /> View
                      </Link>
                      <a
                        href={`/view/${r.id}/download`}
                        className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2.5 sm:py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <Download className="h-4 w-4" /> Download
                      </a>
                      <a
                        href={`/view/${r.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-accent/70 px-4 py-2.5 sm:py-2 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <Printer className="h-4 w-4" /> Print PDF
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Memorial */}
        <section className="parchment-frame">
          <div className="parchment-panel text-center" dir="rtl">
            <h2 className="font-serif text-3xl md:text-4xl font-semibold text-primary">
              לעילוי נשמת
            </h2>
            <div className="mt-5 space-y-2 font-serif text-lg md:text-xl text-foreground">
              <p>קאפל דוב בן יצחק אייזיק ז"ל</p>
              <p>אסתר בת אליהו ע"ה</p>
              <p>גבריאל בן שלום ז"ל</p>
              <p>שמעון בן גבריאל ז"ל</p>
            </div>
          </div>
        </section>

        <footer className="text-center text-sm text-muted-foreground py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/archive" className="hover:text-primary transition-colors">
            Browse Archive
          </Link>
          <span aria-hidden>·</span>
          <Link to="/contact" className="hover:text-primary transition-colors">
            Contact
          </Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Torah for the Table</span>
        </footer>
      </div>
    </div>
  );
}
