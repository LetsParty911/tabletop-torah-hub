import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Download, Eye, Printer, X } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { CategoryBadge } from "@/components/CategoryBadge";
import { hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";
import {
  listPublishedPdfs,
  getParshaOverride,
  subscribeEmail,
} from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";
import { ListenToSummaryButton } from "@/components/ListenToSummaryButton";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  categoryLabel,
  tagLabel,
} from "@/lib/badges";

type Resource = {
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  summary_quick: string | null;
  content_type: string | null;
  summary_audio_path: string | null;
  primary_category: string | null;
  tags: string[];
};

type LoaderData = {
  label: string;
  parshaKey: string | null;
  resources: Resource[];
};

async function loadCurrentWeek(): Promise<LoaderData> {
  let label = "Parshas Hashavua";
  let parshaKey: string | null = null;

  // 1. Manual override
  try {
    const o = await getParshaOverride();
    if (o.override && o.isActive) {
      parshaKey = o.override;
      label = o.override.startsWith("Parshas") ? o.override : `Parshas ${o.override}`;
      const knownYomTov = ["Rosh Hashanah", "Yom Kippur", "Sukkos", "Shemini Atzeres", "Simchas Torah", "Pesach", "Shavuos"];
      if (knownYomTov.includes(o.override)) label = o.override;
    }
  } catch {
    // ignore
  }

  // 2. Hebcal fallback
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
        label = parshaKey;
      } else if (parsha) {
        parshaKey = hebcalToParshaKey(parsha.title);
        label = `Parshas ${parshaKey}`;
      }
    } catch (e) {
      console.error("Hebcal load error", e);
    }
  }

  // 3. PDFs
  let resources: Resource[] = [];
  if (parshaKey) {
    try {
      const r = await listPublishedPdfs({ data: { parshaKey } });
      resources = r.resources;
    } catch (e) {
      console.error("Failed to load PDFs", e);
    }
  }

  return { label, parshaKey, resources };
}

export const Route = createFileRoute("/")({
  component: Index,
  loader: () => loadCurrentWeek(),
  errorComponent: ({ error }) => {
    console.error("Home load error", error);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="parchment-frame max-w-md w-full">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-2xl text-primary">Something went wrong</h1>
            <p className="mt-3 text-sm text-muted-foreground">Please refresh the page.</p>
          </div>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/archive" className="text-primary underline">Browse archive</Link>
    </div>
  ),
  head: () => {
    const title = "Torah for the Table | Weekly Divrei Torah for Shabbos & Yom Tov";
    const description =
      "A weekly collection of Divrei Torah for Shabbos and Yom Tov — thoughtfully gathered in one quiet, uncluttered place for the Shabbos table.";
    const url = "https://torahforthetable.com/";
    const image =
      "https://torahforthetable.com/og-image.png";
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

function Index() {
  const { label: currentLabel, parshaKey: currentParshaKey, resources } =
    Route.useLoaderData() as LoaderData;
  const [email, setEmail] = useState("");
  const [signupMsg, setSignupMsg] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const toggleCategory = (key: string) => {
    setActiveCategory((cur) => (cur === key ? null : key));
  };
  const toggleTag = (key: string) => {
    setActiveTags((cur) =>
      cur.includes(key) ? cur.filter((t) => t !== key) : [...cur, key],
    );
  };
  const clearFilters = () => {
    setActiveCategory(null);
    setActiveTags([]);
  };

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      if (activeCategory && r.primary_category !== activeCategory) return false;
      if (activeTags.length > 0) {
        for (const tag of activeTags) {
          if (!r.tags?.includes(tag)) return false;
        }
      }
      return true;
    });
  }, [resources, activeCategory, activeTags]);

  const hasActiveFilters = activeCategory !== null || activeTags.length > 0;



  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);

    try {
      const r = await subscribeEmail({ data: { email } });
      if (r.ok) {
        if (r.welcomeEmailSent) {
          setSignupMsg(
            "You're all set — welcome email sent. You'll get updates when new Divrei Torah are uploaded.",
          );
        } else if (r.alreadySubscribed) {
          setSignupMsg(
            "You're already subscribed — you'll get updates when new Divrei Torah are uploaded.",
          );
        } else {
          setSignupMsg(
            "You're subscribed, but the welcome email could not be sent right now.",
          );
        }
        setEmail("");
        trackEvent("newsletter_signup", {
          form_name: "weekly_torah_notifications",
        });
      } else {
        setSignupMsg(r.error ?? "Something went wrong. Please try again.");
      }
    } catch (error) {
      console.error("[newsletter-signup] error", error);
      setSignupMsg("Something went wrong. Please try again.");
    }
  };

  const pdfParams = (r: Resource) => ({
    file_id: r.id,
    file_title: r.title,
    source_name: r.title,
    parsha: currentParshaKey ?? undefined,
  });

  const contentTypeLabel = (type: string | null): string | null => {
    const map: Record<string, string> = {
      A: "Essay",
      B: "Story",
      C: "Stories",
      D: "Insights",
      E: "Reference",
      F: "Mixed Collection",
    };
    return type && map[type] ? map[type] : null;
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
              A weekly collection of Divrei Torah for the Shabbos table.
            </p>
            <div className="mt-6 sm:mt-10 flex items-center justify-center gap-3 sm:gap-4 text-accent">
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
              <span className="font-sans text-[0.6rem] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.3em]">
                This Week
              </span>
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
            </div>
            {false ? (
              <div className="mt-2 sm:mt-3 flex justify-center">
                <div className="h-8 sm:h-10 md:h-12 w-56 sm:w-72 md:w-96 rounded-md bg-primary/10 animate-pulse" aria-label="Loading this week's parsha" />
              </div>
            ) : (
              <p className="mt-2 sm:mt-3 font-serif text-xl sm:text-2xl md:text-4xl text-primary whitespace-nowrap">
                {currentLabel}
              </p>
            )}
            {true && resources.length > 0 && (
              <div className="mt-5 sm:mt-6">
                <a
                  href="#this-weeks-collection"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("this-weeks-collection")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-primary transition-colors"
                >
                  Jump to This Week’s Collection ↓
                </a>
              </div>
            )}
          </div>
        </section>

        <div className="gold-divider" aria-hidden><span className="gold-divider-dot" /></div>

        {/* Email signup */}
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl font-bold text-primary">
              Weekly Torah Notifications
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg max-w-xl mx-auto">
              One short email each week when new Divrei Torah are uploaded.
            </p>
            <form
              onSubmit={handleSignup}
              className="mt-6 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
            >
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
                className="rounded-full bg-primary px-8 py-3.5 font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-md"
              >
                Join the List
              </button>
            </form>
            {signupMsg && (
              <p className="mt-4 text-sm text-accent">{signupMsg}</p>
            )}
          </div>
        </section>

        <div className="gold-divider" aria-hidden><span className="gold-divider-dot" /></div>

        {/* Resource collection */}
        <section id="this-weeks-collection" className="parchment-frame scroll-mt-8">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl font-bold text-primary text-center">
              This Week's Collection
            </h2>
            {true && resources.length > 0 && (
              <p className="mt-2 text-center font-serif italic text-sm sm:text-base text-accent">
                {resources.length} {resources.length === 1 ? "Devar" : "Divrei"} Torah this week
              </p>
            )}
            {true && resources.length === 0 ? (
              <p className="mt-8 text-center text-muted-foreground max-w-md mx-auto">
                New Divrei Torah for {currentLabel} go up Thursday. Check back soon!
              </p>

            ) : (
              <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2">
                {resources.map((r) => {
                  const hasSummary = !!r.summary_quick && r.summary_quick.trim().length > 0;
                  const badgeLabel = contentTypeLabel(r.content_type);
                  return (
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
                          {hasSummary && badgeLabel && (
                            <span className="mt-2 inline-flex items-center rounded-full bg-[#D4D9C8] px-2.5 py-0.5 text-[0.65rem] sm:text-xs font-sans font-medium uppercase tracking-wider text-[#4E5643]">
                              {badgeLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {hasSummary && (
                        <>
                          <div className="mt-3 border-t border-accent/20" />
                          <p className="mt-3 font-sans text-xs sm:text-sm text-muted-foreground leading-relaxed">
                            {r.summary_quick}
                          </p>
                          {r.summary_audio_path && (
                            <ListenToSummaryButton audioPath={r.summary_audio_path} />
                          )}
                        </>
                      )}
                      <div className="mt-auto pt-4 flex flex-col lg:flex-row gap-2.5 lg:gap-2">
                      <Link
                        to="/view/$id"
                        params={{ id: r.id }}
                        onClick={() => trackEvent("pdf_view", pdfParams(r))}
                        className="w-full lg:flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-primary/70 px-3 py-2.5 lg:py-2 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                      >
                        <Eye className="h-4 w-4" /> View
                      </Link>
                      <a
                        href={`/view/${r.id}/download`}
                        onClick={() => trackEvent("pdf_download", pdfParams(r))}
                        className="w-full lg:flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-3 py-2.5 lg:py-2 text-sm font-medium text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <Download className="h-4 w-4" /> Download
                      </a>
                      <a
                        href={`/view/${r.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackEvent("pdf_print", pdfParams(r))}
                        className="w-full lg:flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-accent/70 px-3 py-2.5 lg:py-2 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <Printer className="h-4 w-4" /> Print PDF
                      </a>
                    </div>
                  </article>
                );})}
              </div>
            )}
            {true && resources.length > 0 && (
              <div className="mt-6 sm:mt-8 text-center">
                <Link
                  to="/archive"
                  className="inline-flex items-center gap-1.5 font-serif italic text-sm sm:text-base text-accent hover:text-primary transition-colors"
                >
                  Browse Archive →
                </Link>
              </div>
            )}
          </div>
        </section>

        <div className="gold-divider" aria-hidden><span className="gold-divider-dot" /></div>

        {/* Memorial */}
        <section className="parchment-frame">
          <div
            className="parchment-panel text-center bg-card shadow-sm"
            dir="rtl"
            style={{ borderTop: "1px solid var(--gold-decorative)" }}
          >
            <div className="flex items-center justify-center gap-3 text-accent">
              <span aria-hidden className="h-px w-8 sm:w-12 bg-accent/60" />
              <span className="font-sans text-[0.6rem] sm:text-xs uppercase tracking-[0.3em]" dir="ltr">
                Dedication
              </span>
              <span aria-hidden className="h-px w-8 sm:w-12 bg-accent/60" />
            </div>
            <h2
              className="mt-4 font-serif font-semibold text-primary"
              style={{ fontSize: "1.25rem", letterSpacing: "0.04em" }}
            >
              לעילוי נשמת
            </h2>
            <div
              className="mt-5 space-y-2 font-serif"
              style={{
                fontSize: "1.05rem",
                fontWeight: 500,
                letterSpacing: "0.015em",
                color: "color-mix(in oklab, var(--primary) 85%, transparent)",
              }}
            >
              <p>קאפל דוב בן יצחק אייזיק ז"ל</p>
              <p>אסתר בת אליהו ע"ה</p>
              <p>גבריאל בן שלום ז"ל</p>
              <p>שמעון בן גבריאל ז"ל</p>
              <p>מסעוד בן שימחה ז"ל</p>
              <p>שרה סעדה בת אסתר ע"ה</p>
            </div>
          </div>
        </section>

        <footer className="text-center text-sm text-muted-foreground py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/about" className="hover:text-primary transition-colors">
            About
          </Link>
          <span aria-hidden>·</span>
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
