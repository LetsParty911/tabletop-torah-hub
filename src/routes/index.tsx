import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isPostShabbosWindow } from "@/lib/post-shabbos";
import { FileText, Share2 } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ThursdayProgressMeter } from "@/components/ThursdayProgressMeter";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { PublicationCardTracker } from "@/components/PublicationCardTracker";
import { trackFp } from "@/lib/first-party-analytics";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { SITE_URL } from "@/lib/site-url";
import { withUtm } from "@/lib/utm";

import { BackToTop } from "@/components/BackToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { buildDownloadFilename } from "@/lib/download-filename";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { standardizeCopy } from "@/lib/standardize-copy";
import { publicationLabel } from "@/lib/badges";

import {
  resolveHebcalParsha,
  resolveReadingForDate,
  nextParshaAfter,
  isPastReading,
} from "@/lib/hebcal";
import { formatReadingLabel } from "@/lib/parshiyos";
import {
  listHomepageWeek,
  getParshaOverride,
  getActiveSubscriberCount,
} from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";
import { WeeklyEmailSignup } from "@/components/WeeklyEmailSignup";
import { usePrewarmDownloads } from "@/hooks/use-prewarm-downloads";
import { TableChooser } from "@/components/TableChooser";
import { MobileCollectionControlsBar } from "@/components/MobileCollectionControlsBar";
import { CHOOSERS, chooseReason, pickRecommendations, type ChooserKey } from "@/lib/table-chooser";

type Resource = {
  id: string;
  title: string;
  publisher: string | null;
  subtitle: string | null;
  url: string;
  summary_quick: string | null;
  content_type: string | null;
  summary_audio_path: string | null;
  primary_category: string | null;
  publication: string | null;
  tags: string[];
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  badge: string | null;
  featured_slot: string | null;
};

type LoaderData = {
  label: string;
  parshaKey: string | null;
  resources: Resource[];
  isFallback: boolean;
  fallbackParshaLabel: string | null;
  fallbackParshaKey: string | null;
  subscriberCount: number | null;
  readingDate: string | null;
  upcomingAfterYomTovKey: string | null;
};

async function loadCurrentWeek(): Promise<LoaderData> {
  const subscriberCountPromise = getActiveSubscriberCount().catch((e) => {
    console.error("Failed to load subscriber count", e);
    return { count: 0 };
  });

  let label = "Parshas Hashavua";
  let parshaKey: string | null = null;
  let readingDate: string | null = null;

  try {
    const o = await getParshaOverride();
    if (o.override && o.isActive) {
      parshaKey = o.override;
      label = formatReadingLabel(o.override);
    }
  } catch {
    // ignore
  }

  if (!parshaKey) {
    const resolved = await resolveHebcalParsha();
    parshaKey = resolved.parshaKey;
    label = resolved.label;
    readingDate = resolved.readingDate;
  }

  let resources: Resource[] = [];
  let isFallback = false;
  let fallbackParshaLabel: string | null = null;
  let fallbackParshaKey: string | null = null;
  try {
    const r = await listHomepageWeek({ data: { parshaKey } });
    resources = r.resources;
    isFallback = r.isFallback;
    if (r.isFallback && r.fallbackParshaKey) {
      fallbackParshaKey = r.fallbackParshaKey;
      fallbackParshaLabel = formatReadingLabel(r.fallbackParshaKey);
    }
  } catch (e) {
    console.error("Failed to load PDFs", e);
  }

  let subscriberCount: number | null = null;
  const { count } = await subscriberCountPromise;
  if (count >= 25) subscriberCount = count;

  const displayedKey = isFallback && fallbackParshaKey ? fallbackParshaKey : parshaKey;
  let upcomingAfterYomTovKey: string | null = null;
  const staticNext = isFallback
    ? (parshaKey ?? nextParshaAfter(displayedKey))
    : nextParshaAfter(displayedKey);
  if (!staticNext && readingDate) {
    const nextShabbos = new Date(`${readingDate}T12:00:00Z`);
    nextShabbos.setUTCDate(nextShabbos.getUTCDate() + 7);
    const next = await resolveReadingForDate(nextShabbos.toISOString().slice(0, 10));
    upcomingAfterYomTovKey = next?.parshaKey ?? null;
  }

  return {
    label,
    parshaKey,
    resources,
    isFallback,
    fallbackParshaLabel,
    fallbackParshaKey,
    subscriberCount,
    readingDate,
    upcomingAfterYomTovKey,
  };
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
      <Link to="/" className="text-primary underline">
        Back to home
      </Link>
    </div>
  ),
  head: () => {
    const title = "Curated Divrei Torah for Your Shabbos Table | Torah For The Table";
    const description =
      "Carefully selected Divrei Torah for children, families and adults — easy to find, print and bring to your Shabbos or Yom Tov table.";
    const url = "https://torahforthetable.com/";
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
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
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
            "@type": "Organization",
            name: "Torah for the Table",
            url: "https://torahforthetable.com",
            logo: "https://torahforthetable.com/favicon.png",
            image,
            description,
            email: "hello@torahforthetable.com",
            sameAs: ["https://torahforthetable.com"],
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Torah for the Table",
            url: "https://torahforthetable.com",
            description,
          }),
        },
      ],
    };
  },
});

const FEATURED_SLOTS = [
  { key: "children", label: "Best for Children" },
  { key: "family", label: "Best for the Family Table" },
  { key: "quickest", label: "Quickest Read" },
  { key: "deeper", label: "Deeper Learning" },
] as const;

function Index() {
  // Read loader data through a single object binding. An aliased destructure of
  // `resources` was implicated in a production ReferenceError, so the value is
  // read explicitly where it is used instead.
  const loaderData = Route.useLoaderData() as LoaderData;
  const currentLabel = loaderData.label;
  const currentParshaKey = loaderData.parshaKey;
  const isFallback = loaderData.isFallback;
  const fallbackParshaLabel = loaderData.fallbackParshaLabel;
  const fallbackParshaKey = loaderData.fallbackParshaKey;
  const readingDate = loaderData.readingDate;
  const upcomingAfterYomTovKey = loaderData.upcomingAfterYomTovKey;

  const displayedLabel = isFallback && fallbackParshaLabel ? fallbackParshaLabel : currentLabel;
  const displayedParshaKey = isFallback && fallbackParshaKey ? fallbackParshaKey : currentParshaKey;
  const normalizedCurrentKey = (currentParshaKey ?? currentLabel)
    .replace(/^Parshas\s+/i, "")
    .trim()
    .toLowerCase();
  const heroDateLine = readingDate
    ? new Date(`${readingDate}T12:00:00Z`)
        .toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          weekday: "long",
          month: "long",
          day: "numeric",
        })
        .replace(/^Saturday,/, "Shabbos,")
    : null;
  const normalizedCollectionKey = (displayedParshaKey ?? displayedLabel)
    .replace(/^Parshas\s+/i, "")
    .trim()
    .toLowerCase();
  const isYomTovCollection = [
    "rosh hashanah",
    "yom kippur",
    "sukkos",
    "shemini atzeres",
    "simchas torah",
    "pesach",
    "shavuos",
  ].includes(normalizedCollectionKey);
  const isCurrentYomKippur = normalizedCollectionKey === "yom kippur";
  const isSukkosSeason = normalizedCurrentKey === "sukkos";
  const sukkosSeasonTitle = "Torah for Sukkos, Shemini Atzeres & Simchas Torah";
  const upcomingParsha = isFallback
    ? (currentParshaKey ?? nextParshaAfter(displayedParshaKey) ?? upcomingAfterYomTovKey)
    : (nextParshaAfter(displayedParshaKey) ?? upcomingAfterYomTovKey);

  // Keep the current collection fresh after hydration. The homepage is time-sensitive,
  // and a platform/CDN can occasionally serve older SSR HTML even after the database
  // has newer published PDFs. A client-side server-function refresh ensures readers
  // see the current published collection without requiring a hard refresh.
  const [resources, setResources] = useState<Resource[]>(loaderData.resources ?? []);
  useEffect(() => {
    let cancelled = false;
    const refreshCurrentCollection = async () => {
      try {
        const latest = await listHomepageWeek({ data: { parshaKey: currentParshaKey } });
        if (!cancelled) setResources(latest.resources as Resource[]);
      } catch (error) {
        console.error("Failed to refresh current collection", error);
      }
    };
    void refreshCurrentCollection();
    return () => {
      cancelled = true;
    };
  }, [currentParshaKey]);

  const [postShabbos, setPostShabbos] = useState(false);
  useEffect(() => {
    const showingLastShabbos = isFallback || isPastReading(readingDate);
    setPostShabbos(showingLastShabbos && resources.length > 0 && isPostShabbosWindow());
  }, [isFallback, resources.length, readingDate]);

  const [audienceFilter, setAudienceFilter] = useState<"All" | "Children" | "Families" | "Adults">("All");
  const [lengthFilter, setLengthFilter] = useState<"All" | "short" | "long">("All");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // When a guided-chooser category is active the page enters focused mode and
  // the full weekly collection (plus its filter controls) is hidden.
  const [activeChooser, setActiveChooser] = useState<string | null>(null);
  const [selectedChooser, setSelectedChooser] = useState<ChooserKey | null>(null);

  const sortedResources = resources;
  usePrewarmDownloads(sortedResources.map((r) => r.id));


  const matchesAudience = (r: Resource, value = audienceFilter) =>
    value === "All" || normalizeAudience(r.audience, r.title) === value;
  const matchesLength = (r: Resource, value = lengthFilter) =>
    value === "All"
      ? true
      : typeof r.page_count === "number"
        ? value === "short"
          ? r.page_count < 5
          : r.page_count >= 5
        : false;
  const resourceContentType = (r: Resource) =>
    formatTypeLabel(r.format_type) ?? formatTypeLabel(r.content_type);
  const matchesContentType = (r: Resource, value = contentTypeFilter) =>
    value === "All" || resourceContentType(r) === value;

  const lengthScoped = sortedResources.filter((r) => matchesAudience(r) && matchesContentType(r));
  const contentTypeScoped = sortedResources.filter((r) => matchesAudience(r) && matchesLength(r));

  const contentTypeOptions = Array.from(
    new Set(sortedResources.map((r) => resourceContentType(r)).filter((v): v is string => !!v)),
  ).sort((a, b) => a.localeCompare(b));

  const filteredResources = sortedResources.filter(
    (r) => matchesAudience(r) && matchesLength(r) && matchesContentType(r),
  );

  const lengthHasChoice =
    sortedResources.some((r) => typeof r.page_count === "number" && r.page_count < 5) &&
    sortedResources.some((r) => typeof r.page_count === "number" && r.page_count >= 5);
  const contentTypeHasChoice = contentTypeOptions.length > 1;
  const activeFilterCount =
    Number(audienceFilter !== "All") + Number(lengthFilter !== "All") + Number(contentTypeFilter !== "All");

  const featuredPicks = FEATURED_SLOTS.map((slot) => ({
    ...slot,
    resource: resources.find((r) => (r.featured_slot ?? "").trim().toLowerCase() === slot.key),
  })).filter((p) => !!p.resource);
  const quickChoices = (["quick", "family", "kids", "story"] as const).map((key) => {
    const chooser = CHOOSERS.find((option) => option.key === key);
    const labels: Record<(typeof key), string> = {
      quick: "Quick Vorts",
      family: "Family Table",
      kids: "Children",
      story: "Stories",
    };
    return { key, label: labels[key], trackingLabel: chooser?.label ?? labels[key] };
  });
  const preferredStartHere = resources.find((resource) => {
    const title = resource.title.toLowerCase();
    return title.includes("sukkos") && /short\s+vort/.test(title);
  });
  const startHereResource = preferredStartHere ?? pickRecommendations(resources, "quick", 1)[0] ?? null;

  const pdfParams = (r: Resource) => ({
    file_id: r.id,
    file_title: r.title,
    source_name: r.title,
    parsha: displayedParshaKey ?? undefined,
  });

  const pageCountLabel = (r: Resource) => {
    if (typeof r.page_count !== "number") return null;
    const pages = `${r.page_count} ${r.page_count === 1 ? "page" : "pages"}`;
    return r.page_count >= 20 ? `Long Study · ${pages}` : pages;
  };

  const shareLink = withUtm(`${SITE_URL}/`, {
    source: "whatsapp",
    medium: "share",
    campaign: "weekly-share",
  });
  const shareText = `${resources.length} free, handpicked Divrei Torah for ${displayedLabel} — ready to download and print: ${shareLink}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const ShareButton = ({ className }: { className?: string }) => (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        trackEvent("share_whatsapp", {
          parsha: displayedParshaKey ?? displayedLabel,
          count: resources.length,
        })
      }
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-accent bg-transparent px-5 py-2.5 font-serif font-semibold text-primary hover:bg-accent hover:text-accent-foreground transition-colors ${className ?? ""}`}
    >
      <Share2 className="h-4 w-4" />
      Share {displayedLabel} Divrei Torah
    </a>
  );

  const upcomingLabel =
    upcomingParsha && upcomingParsha !== displayedParshaKey ? formatReadingLabel(upcomingParsha) : null;

  const isHaazinuWeek = normalizedCurrentKey === "ha'azinu";
  const haazinuQaTitle = "Parsha Questions & Answers – Haazinu";
  const displayTitle = (r: Resource) =>
    isHaazinuWeek && r.title === "Parsha Questions & Answers" ? haazinuQaTitle : r.title;
  const displayPublicationName = (r: Resource) =>
    isHaazinuWeek && r.title === "Parsha Questions & Answers"
      ? haazinuQaTitle
      : publicationLabel(r.publication || r.title) || r.title;

  const clearFilters = () => {
    setAudienceFilter("All");
    setLengthFilter("All");
    setContentTypeFilter("All");
  };

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBanner />
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-7 md:px-8 md:py-10 space-y-4 sm:space-y-6 md:space-y-8">
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <p className="hidden font-sans text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-accent-readable sm:block sm:text-xs">
              {isCurrentYomKippur ? "Yom Kippur Resources" : "Weekly Divrei Torah"}
            </p>
            <h1 className="mt-2 font-serif text-[1.6rem] leading-[1.1] font-bold tracking-tight text-primary sm:text-4xl md:text-5xl">
              <span>
                {isCurrentYomKippur
                  ? "Yom Kippur"
                  : isSukkosSeason
                    ? sukkosSeasonTitle
                    : isFallback
                      ? currentLabel
                      : postShabbos
                        ? `Divrei Torah for ${displayedLabel}`
                        : `Free Divrei Torah for Your ${isYomTovCollection ? "Yom Tov" : "Shabbos"} Table`}
              </span>
            </h1>
            <p className="mx-auto mt-2 max-w-md font-serif text-sm leading-relaxed text-primary sm:hidden">
              Choose a Dvar Torah for your table — free, and ready to print.
            </p>
            {!isFallback && (
              <p className="mt-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-accent-readable sm:hidden">
                {resources.length} {resources.length === 1 ? "selection" : "selections"} for {displayedLabel}
              </p>
            )}
            {heroDateLine && (
              <p className="mt-2 hidden font-sans text-xs font-semibold uppercase tracking-[0.14em] text-accent-readable sm:block sm:text-sm">
                {heroDateLine}
              </p>
            )}
            {isFallback && !isCurrentYomKippur && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-4 py-1.5 font-sans text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent-readable sm:text-xs">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                Collection in progress
              </p>
            )}
            <p className="mx-auto mt-3 hidden max-w-2xl font-serif text-base leading-relaxed text-primary sm:block sm:text-lg md:text-xl">
              {isCurrentYomKippur ? (
                <>
                  <span className="block font-semibold">Yom Kippur Divrei Torah and preparation.</span>
                  <span className="mt-1 block">Explore this week&apos;s Yom Kippur selections.</span>
                </>
              ) : isFallback ? (
                <>
                  This week&apos;s selections aren&apos;t live yet. More Divrei Torah will be added
                  Thursday evening.
                </>
              ) : (
                <>
                  <span className="font-semibold">
                    {resources.length} {resources.length === 1 ? "selection" : "selections"}
                  </span>{" "}
                  {postShabbos ? "still available to download below" : `for ${displayedLabel}`}
                </>
              )}
            </p>

            {isFallback && !isCurrentYomKippur ? (
              <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="#weekly-email-signup"
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById("weekly-email-signup");
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    el?.querySelector<HTMLInputElement>('input[type="email"]')?.focus({
                      preventScroll: true,
                    });
                  }}
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-7 py-3 font-serif font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto"
                >
                  Email me this week&apos;s collection
                </a>
                <a
                  href="#this-weeks-collection"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("this-weeks-collection")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex w-full items-center justify-center rounded-full border border-accent bg-transparent px-7 py-3 font-serif font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto"
                >
                  Browse {displayedLabel} collection
                </a>
              </div>
            ) : (
              <div className="mt-5 hidden justify-center sm:flex">
                <a
                  href="#this-weeks-collection"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("shabbos-table-chooser")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-7 py-3 font-serif font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto"
                >
                  {isCurrentYomKippur ? "Find a Yom Kippur Dvar Torah" : "Help me choose a Dvar Torah"}
                </a>
              </div>
            )}
            {resources.length > 0 && !isCurrentYomKippur && (
              !isFallback && (
                <p className="mt-3 hidden text-center font-sans text-sm text-muted-foreground sm:block sm:text-base">
                  Your Sukkos collection is ready. New Divrei Torah are added every Thursday evening.
                </p>
              )
            )}
          </div>
        </section>

        {resources.length > 0 && (
          <section aria-labelledby="mobile-quick-choices" className="sm:hidden">
            <h2 id="mobile-quick-choices" className="sr-only">Choose what fits your table</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickChoices.map((choice) => {
                const active = selectedChooser === choice.key;
                return (
                  <button
                    key={choice.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      const next = active ? null : choice.key;
                      setSelectedChooser(next);
                      if (next) {
                        trackFp("chooser_select", {
                          metadata: { chooser: next, label: choice.trackingLabel },
                        });
                        window.requestAnimationFrame(() => {
                          document.getElementById("shabbos-table-chooser")?.scrollIntoView({
                            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                              ? "auto"
                              : "smooth",
                            block: "start",
                          });
                        });
                      }
                    }}
                    className={`min-w-0 rounded-lg border px-3 py-2.5 font-serif text-sm font-semibold transition-colors ${
                      active
                        ? "border-accent bg-accent/15 text-primary shadow-sm"
                        : "border-accent/40 bg-background/70 text-primary hover:bg-accent/10"
                    }`}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            {startHereResource && (
              <Link
                to="/view/$id"
                params={{ id: startHereResource.id }}
                onClick={() =>
                  trackFp("recommendation_click", {
                    publication_id: startHereResource.id,
                    publication_title: startHereResource.title,
                    publication_series: startHereResource.publication,
                    publisher: startHereResource.publisher,
                    parsha: displayedParshaKey,
                    metadata: { chooser: "start_here" },
                  })
                }
                className="mt-2.5 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 font-serif text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Not sure what to choose? Start here.
              </Link>
            )}
          </section>
        )}

        <ThursdayProgressMeter
          heading={isFallback ? currentLabel : upcomingLabel ? `Upcoming: ${upcomingLabel}` : "Upcoming Divrei Torah"}
          badgeLabel={isFallback ? "This Shabbos" : "Upcoming"}
          message="New Divrei Torah will be added then."
          completeHref="#this-weeks-collection"
          completeCtaLabel={isFallback ? `See ${currentLabel} PDFs` : upcomingLabel ? `Browse ${upcomingLabel}` : "Browse the new collection"}
          ariaLabel={(fillStep) =>
            `${isFallback ? `${currentLabel} upload` : upcomingLabel ? `${upcomingLabel} upload` : "Upcoming Divrei Torah upload"} progress: ${fillStep}% complete`
          }
        />

        {isFallback && !isCurrentYomKippur && (
          <div className="mx-auto max-w-2xl rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-center">
            <p className="font-serif text-sm text-primary sm:text-base">
              <span className="font-semibold">{displayedLabel} collection still available</span> — {resources.length} {resources.length === 1 ? "selection" : "selections"}.
            </p>
          </div>
        )}

        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 items-center gap-3 rounded-xl border border-accent/40 bg-card/40 px-4 py-4 text-center sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5 sm:text-left">
          <div className="min-w-0">
            <p className="font-serif text-lg font-bold text-primary sm:text-xl">
              Get new Divrei Torah every Thursday
            </p>
            <p className="mt-0.5 font-sans text-sm text-muted-foreground">
              Be the first to know when a new collection is live.
            </p>
          </div>
          <a
            href="#weekly-email-signup"
            onClick={(event) => {
              event.preventDefault();
              const signup = document.getElementById("weekly-email-signup");
              signup?.scrollIntoView({ behavior: "smooth", block: "center" });
              window.setTimeout(() => {
                signup?.querySelector<HTMLInputElement>('input[type="email"]')?.focus({
                  preventScroll: true,
                });
              }, 500);
            }}
            className="inline-flex w-full shrink-0 items-center justify-center rounded-full bg-primary px-6 py-2.5 font-serif text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto"
          >
            Subscribe
          </a>
        </div>

        <section id="this-weeks-collection" className="scroll-mt-8">
          <div className="px-1 sm:px-2">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
              {isCurrentYomKippur
                ? "Yom Kippur Divrei Torah and preparation"
                : isFallback
                  ? `${displayedLabel} Collection — Still Available`
                  : "This Week's Collection"}
            </h2>

            <TableChooser
              resources={sortedResources}
              parshaKey={displayedParshaKey}
              displayTitle={(r) => displayTitle(r as Resource)}
              displayPublicationName={(r) => displayPublicationName(r as Resource)}
              selected={selectedChooser}
              onSelectedChange={setSelectedChooser}
              onActiveChooserChange={setActiveChooser}
            />

            {!activeChooser && (
            <>
            {featuredPicks.length > 0 && (
              <>
                <section className="parchment-frame">
                  <div className="parchment-panel">
                    <p className="text-center font-sans text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-readable sm:text-xs">
                      <span aria-hidden="true">★</span> Featured
                    </p>
                    <h2 className="mt-1 font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
                      This Week's Recommended Picks
                    </h2>
                    <div className="mt-5 grid gap-4 grid-cols-1 sm:grid-cols-2">
                      {featuredPicks.map(({ key, label, resource }) => {
                        const r = resource!;
                        return (
                          <PublicationCardTracker
                            key={key}
                            className="h-full rounded-xl border border-accent/50 bg-background/70 p-4 sm:p-5 flex flex-col"
                            publication_id={r.id}
                            publication_title={r.title}
                            publication_series={r.publication ?? null}
                            publisher={r.publisher ?? null}
                            parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey ?? null}
                          >
                            <span className="self-start rounded-full bg-accent px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-accent-foreground">
                              {label}
                            </span>
                            <h3 className="mt-3 font-serif text-base sm:text-xl font-bold text-primary leading-snug">
                              <Link to="/view/$id" params={{ id: r.id }} className="hover:text-accent hover:underline transition-colors duration-150">
                                {displayTitle(r)}
                              </Link>
                            </h3>
                            {r.publisher && <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">By {r.publisher}</p>}
                            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-3">{standardizeCopy(r.subtitle || chooseReason(r))}</p>
                            {pageCountLabel(r) && (
                              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {pageCountLabel(r)}
                              </p>
                            )}
                            <div className="mt-auto pt-4">
                              <DownloadToPrintButton
                                href={`/view/${r.id}/download`}
                                publicationId={r.id}
                                publicationName={displayPublicationName(r)}
                                publicationTitle={r.title}
                                publisher={r.publisher}
                                publicationSeries={r.publication}
                                parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                                filename={buildDownloadFilename(
                                  (r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey,
                                  r.publication || r.title,
                                )}
                                onClick={() => {
                                  trackEvent("pdf_download", pdfParams(r));
                                  if (typeof window !== "undefined") {
                                    window.dispatchEvent(new CustomEvent("tftt:download-clicked"));
                                  }
                                }}
                                className="w-full px-3 py-2.5 lg:py-2"
                              />
                               <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                                 <SharePublicationButton
                                   pdfId={r.id}
                                   title={r.title}
                                   parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                                 />
                               </div>
                            </div>
                          </PublicationCardTracker>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <div className="gold-divider" aria-hidden>
                  <span className="gold-divider-dot" />
                </div>
              </>
            )}

            {resources.length === 0 ? (
              <p className="mt-6 text-center text-muted-foreground max-w-md mx-auto">
                New Divrei Torah for {currentLabel} go up Thursday. Check back soon!
              </p>
            ) : (
              <>
                <MobileCollectionControlsBar
                  anchorId="filters"
                  count={resources.length}
                  activeFilterCount={activeFilterCount}
                  onOpenFilters={() => setFiltersOpen(true)}
                />
                <div id="filters" className="mt-5 sticky top-14 sm:top-20 z-30 -mx-3 bg-background/95 px-3 py-3 backdrop-blur border-y border-accent/20 sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-sm scroll-mt-24">
                  <div className="flex items-center justify-between gap-3 sm:hidden">
                    <button
                      type="button"
                      aria-expanded={filtersOpen}
                      onClick={() => setFiltersOpen((open) => !open)}
                      className="flex-1 rounded-full border border-accent/45 bg-background px-4 py-2 text-left font-serif text-sm font-semibold text-primary shadow-sm"
                    >
                      Filter {resources.length} selections{activeFilterCount > 0 ? ` · ${activeFilterCount} active` : ""}
                    </button>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-xs font-serif text-accent-readable hover:text-primary hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>


                  <div className={`${filtersOpen ? "block" : "hidden"} mt-3 space-y-3 sm:mt-0 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4 sm:space-y-0`}>
                    {activeFilterCount > 0 && (
                      <div className="hidden justify-end sm:col-span-3 sm:flex">
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-xs font-serif text-accent-readable hover:text-primary hover:underline transition-colors"
                        >
                          Clear filters
                        </button>
                      </div>
                    )}

                    {sortedResources.length > 0 && (
                      <div>
                        <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By audience</span>
                        <div className="mt-1.5 flex flex-wrap justify-start gap-2">
                          {(["All", "Children", "Families", "Adults"] as const)
                            .map((audience) => {
                              const active = audienceFilter === audience;
                              return (
                                <button
                                  key={audience}
                                  type="button"
                                  aria-pressed={active}
                                  aria-label={`Filter by audience: ${audienceLabel(audience)}`}
                                  onClick={() => {
                                    const next = active ? "All" : audience;
                                    setAudienceFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "audience", value: next } });
                                  }}
                                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer ${
                                    active
                                      ? "border-accent bg-accent text-accent-foreground shadow-sm"
                                      : "border-accent/45 bg-background/70 text-primary hover:border-accent hover:bg-accent/10"
                                  }`}
                                >
                                  {audienceLabel(audience)}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {lengthHasChoice && (
                      <div>
                        <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By length</span>
                        <div className="mt-1.5 flex flex-wrap justify-start gap-2">
                          {(() => {
                            const shortCount = lengthScoped.filter(
                              (r) => typeof r.page_count === "number" && r.page_count < 5,
                            ).length;
                            const longCount = lengthScoped.filter(
                              (r) => typeof r.page_count === "number" && r.page_count >= 5,
                            ).length;
                            const options = [
                              { key: "All" as const, label: "All", count: lengthScoped.length },
                              { key: "short" as const, label: "Under 5 Pages", count: shortCount },
                              { key: "long" as const, label: "5+ Pages", count: longCount },
                            ].filter((o) => o.key === "All" || o.count > 0);
                            return options.map((o) => {
                              const active = lengthFilter === o.key;
                              return (
                                <button
                                  key={o.key}
                                  type="button"
                                  aria-pressed={active}
                                  aria-label={`Filter by length: ${o.label}`}
                                  onClick={() => {
                                    const next = active ? "All" : o.key;
                                    setLengthFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "length", value: next } });
                                  }}
                                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer ${
                                    active
                                      ? "border-accent bg-accent text-accent-foreground shadow-sm"
                                      : "border-accent/45 bg-background/70 text-primary hover:border-accent hover:bg-accent/10"
                                  }`}
                                >
                                  {o.label}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {contentTypeHasChoice && (
                      <div>
                        <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By content type</span>
                        <div className="mt-1.5 flex flex-wrap justify-start gap-2">
                          {[
                            { key: "All", label: "All", count: contentTypeScoped.length },
                            ...contentTypeOptions.map((t) => ({
                              key: t,
                              label: t,
                              count: contentTypeScoped.filter((r) => resourceContentType(r) === t).length,
                            })),
                          ]
                            .filter((o) => o.key === "All" || o.count > 0)
                            .map((o) => {
                              const active = contentTypeFilter === o.key;
                              return (
                                <button
                                  key={o.key}
                                  type="button"
                                  aria-pressed={active}
                                  aria-label={`Filter by content type: ${o.label}`}
                                  onClick={() => {
                                    const next = active ? "All" : o.key;
                                    setContentTypeFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "content_type", value: next } });
                                  }}
                                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer ${
                                    active
                                      ? "border-accent bg-accent text-accent-foreground shadow-sm"
                                      : "border-accent/45 bg-background/70 text-primary hover:border-accent hover:bg-accent/10"
                                  }`}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 sm:mt-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                  {filteredResources.map((r) => (
                    <PublicationCardTracker
                      key={r.id}
                      className="h-full rounded-xl border border-accent/35 bg-background/55 p-4 sm:p-5 hover:border-accent/70 hover:shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 flex flex-col"
                      publication_id={r.id}
                      publication_title={r.title}
                      publication_series={r.publication ?? null}
                      publisher={r.publisher ?? null}
                      parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey ?? null}
                    >
                      <div className="flex flex-1 items-start gap-3">
                        <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg bg-accent/12 text-primary shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-serif text-base sm:text-xl font-bold text-primary line-clamp-2 leading-snug min-h-[2.6em] sm:min-h-[2.5em]">
                              <Link to="/view/$id" params={{ id: r.id }} className="hover:text-accent hover:underline transition-colors duration-150">
                                {displayTitle(r)}
                              </Link>
                            </h3>
                            {r.badge && (
                              <span className="shrink-0 rounded-full border border-accent bg-accent/20 px-2 py-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-primary">
                                {r.badge}
                              </span>
                            )}
                          </div>
                          {r.publisher && <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">By {r.publisher}</p>}
                          {(() => {
                            const summary = r.summary_quick || r.subtitle;
                            return summary ? (
                              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-3">{standardizeCopy(summary)}</p>
                            ) : null;
                          })()}
                          {(r.audience || r.format_type || typeof r.page_count === "number") && (
                            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {[
                                audienceLabel(normalizeAudience(r.audience, displayTitle(r))) ?? r.audience,
                                formatTypeLabel(r.format_type),
                                pageCountLabel(r),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-auto pt-4">
                        <DownloadToPrintButton
                          href={`/view/${r.id}/download`}
                          publicationId={r.id}
                          publicationName={displayPublicationName(r)}
                          publicationTitle={r.title}
                          publisher={r.publisher}
                          publicationSeries={r.publication}
                          parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                          filename={buildDownloadFilename(
                            (r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey,
                            r.publication || r.title,
                          )}
                          onClick={() => {
                            trackEvent("pdf_download", pdfParams(r));
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(new CustomEvent("tftt:download-clicked"));
                            }
                          }}
                          className="w-full px-3 py-2.5 lg:py-2"
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                          <SharePublicationButton
                            pdfId={r.id}
                            title={r.title}
                            parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                          />
                        </div>
                      </div>
                    </PublicationCardTracker>
                  ))}
                </div>

                {filteredResources.length === 0 && (
                  <p className="mt-8 text-center text-muted-foreground max-w-md mx-auto">
                    {audienceFilter !== "All" && activeFilterCount === 1
                      ? `No selections for ${audienceLabel(audienceFilter)} in this collection yet — choose another audience or All.`
                      : "No Divrei Torah match this combination of filters — try clearing one."}
                  </p>
                )}
              </>
            )}
            </>
            )}

          </div>
        </section>

        <WeeklyEmailSignup
          sourceId="homepage"
          heading="GET EACH NEW COLLECTION EVERY THURSDAY"
        />

        {resources.length > 0 && !isCurrentYomKippur && (
          <div className="flex justify-center">
            <ShareButton className="w-full sm:w-auto" />
          </div>
        )}

        <div className="gold-divider" aria-hidden>
          <span className="gold-divider-dot" />
        </div>

        <section className="parchment-frame max-w-2xl mx-auto">
          <div
            className="parchment-panel text-center bg-card shadow-sm"
            dir="rtl"
            style={{ borderTop: "1px solid var(--gold-decorative)" }}
          >
            <div className="flex items-center justify-center gap-3 text-accent">
              <span aria-hidden className="h-px w-8 sm:w-12 bg-accent/60" />
              <span className="font-sans text-[0.6rem] sm:text-xs uppercase tracking-[0.3em]" dir="ltr">Dedication</span>
              <span aria-hidden className="h-px w-8 sm:w-12 bg-accent/60" />
            </div>
            <h2 dir="rtl" lang="he" className="mt-5 font-serif font-semibold text-primary" style={{ fontSize: "1.25rem", letterSpacing: "0.04em" }}>
              לעילוי נשמת
            </h2>
            <div
              dir="rtl"
              lang="he"
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

        <SiteFooter />
      </div>
      <BackToTop collectionId="this-weeks-collection" />
    </div>
  );
}
