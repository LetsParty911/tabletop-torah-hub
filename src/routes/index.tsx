import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { isPostShabbosWindow } from "@/lib/post-shabbos";
import { weeklyReleaseAt } from "@/lib/weekly-release";
import { BookOpen, FileText, SlidersHorizontal } from "lucide-react";
import { ThursdayProgressMeter } from "@/components/ThursdayProgressMeter";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { UpdateCountdown } from "@/components/UpdateCountdown";
import { DownloadAndPrintButtons } from "@/components/DownloadAndPrintButtons";
import { recordPdfAction } from "@/components/DownloadToPrintButton";
import { pdfActionHrefs } from "@/lib/collection-status";
import { PublicationCardTracker } from "@/components/PublicationCardTracker";
import { PublicationQuickFacts } from "@/components/PublicationQuickFacts";
import { trackFp } from "@/lib/first-party-analytics";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { SITE_URL } from "@/lib/site-url";
import { HomepageShare } from "@/components/HomepageShare";

import { BackToTop } from "@/components/BackToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { HiddenGemTeaser } from "@/components/HiddenGem";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { displayContentType, hasDisplayedCollectionChanged, isProgressForReading, isCollectionComplete } from "@/lib/collection-status";
import { tfttOriginalSeriesById } from "@/lib/tftt-originals";
import { canShowOriginalsLaunch, NEW_ORIGINAL_SERIES, ORIGINAL_PROMOTION_SERIES, resolveListingCover, promotionSeriesById } from "@/lib/originals-promotion";
import { OriginalBundleChooser } from "@/components/OriginalBundleChooser";
import { currentOriginalBundles } from "@/lib/original-bundles";
import { weeklyCardBadges } from "@/lib/weekly-card-badges";
import { publicationLabel } from "@/lib/badges";
import { publicationFilterName } from "@/lib/publication-filter";
import { Button } from "@/components/ui/button";
import { SmallPdfImage } from "@/components/SmallPdfImage";
import { LENGTH_OPTIONS, matchesPageLength, type LengthFilter } from "@/lib/length-filter";
import { isWeeklyCollectionHash, scrollToWeeklyCollection, WEEKLY_COLLECTION_REQUEST } from "@/lib/weekly-navigation";
import { publicFilterTone, PUBLIC_FILTER_FIELD_TONE } from "@/lib/public-filter-styles";
import { PdfCoverThumbnail } from "@/components/PdfCoverThumbnail";
import { trackHomepageJourneyStart, useHomepageSectionImpression } from "@/hooks/use-homepage-section-impression";

import {
  resolveHebcalParsha,
  resolveReadingForDate,
  nextParshaAfter,
  isPastReading,
} from "@/lib/hebcal";
import { formatReadingLabel } from "@/lib/parshiyos";
import { isYomTovReading, readingSlug } from "@/lib/reading-page";
import {
  listHomepageWeek,
  getParshaOverride,
  getActiveSubscriberCount,
  getAnnouncementBanner,
  getThursdayProgress,
  type AnnouncementBanner as AnnouncementBannerData,
} from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";
import { WeeklyEmailSignup } from "@/components/WeeklyEmailSignup";
import { usePrewarmDownloads } from "@/hooks/use-prewarm-downloads";
import { TableChooser } from "@/components/TableChooser";
import { pickStarterSelections, type ChooserKey } from "@/lib/table-chooser";

type Resource = {
  id: string;
  parsha_key: string | null;
  jewish_year?: number | null;
  title: string;
  publisher: string | null;
  subtitle: string | null;
  url: string;
  summary_quick: string | null;
  content_type: string | null;
  summary_audio_path: string | null;
  primary_category: string | null;
  publication: string | null;
  publication_name?: string | null;
  publication_id?: string | null;
  tags: string[];
  description: string | null;
  audience: string | null;
  format_type: string | null;
  page_count: number | null;
  badge: string | null;
  featured_slot: string | null;
  thumb_url?: string | null;
  small_thumb_url?: string | null;
};

// Listing cover (permanent series artwork or first-page PDF preview); tracked PDF-open link.
/** Visible "New" pill whose accessible text reads "(New series)" after the title. */
function StarterThumb({ src, smallSrc, alt, title, href, onOpen, compactOnMobile = false, seriesCover = false }: {
  src: string;
  smallSrc?: string | null;
  alt: string;
  title: string;
  href: string;
  onOpen: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  compactOnMobile?: boolean;
  seriesCover?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const sizeClass = seriesCover
    ? (compactOnMobile ? "h-[100px] w-20 sm:h-[140px] sm:w-28" : "h-[140px] w-28")
    : (compactOnMobile ? "h-[104px] w-20 sm:h-[145px] sm:w-28" : "h-[145px] w-28");
  if (failed) {
    return (
      <div role="img" aria-label={`Cover unavailable for ${title}`} className={`flex shrink-0 items-center justify-center rounded-lg bg-accent/12 text-primary ${sizeClass}`}>
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      aria-label={`Open PDF in a new tab: ${title}`}
      title={`Open PDF: ${title}`}
      onClick={onOpen}
      className={`block shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${sizeClass}`}
    >
      <SmallPdfImage
        key={src}
        src={src}
        verifiedSmallSrc={smallSrc}
        alt={alt}
        width={112}
        height={seriesCover ? 140 : 145}
        loading="lazy"
        decoding="async"
        onUnavailable={() => setFailed(true)}
        className={`rounded-sm border border-accent/40 bg-card object-contain shadow-sm hover:border-accent ${sizeClass}`}
      />
    </a>
  );
}

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
  announcement: AnnouncementBannerData;
  progressFillStep?: number | null;
  progressEta?: string | null;
  renderedAt?: number;
};

async function loadCurrentWeek(): Promise<LoaderData> {
  const announcementPromise = getAnnouncementBanner().catch(() => ({ enabled: false, text: null, linkUrl: null, linkLabel: null }));
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

  const resolved = await resolveHebcalParsha();
  readingDate = resolved.readingDate;
  if (!parshaKey) {
    parshaKey = resolved.parshaKey;
    label = resolved.label;
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

  const announcement = await announcementPromise;
  let progressFillStep: number | null = null;
  let progressEta: string | null = null;
  try {
    const progress = await getThursdayProgress();
    progressFillStep = progress.fillStep;
    progressEta = progress.eta;
  } catch {
    progressFillStep = null;
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
    announcement,
    progressFillStep,
    progressEta,
    renderedAt: Date.now(),
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
    const title = "Torah For The Table | Printable Weekly Divrei Torah";
    const description =
      "Seven original weekly Torah series and printable Divrei Torah from respected publishers, for children, families and deeper learning at the Shabbos table.";
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
        { property: "og:site_name", content: "Torah For The Table" },
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
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://torahforthetable.com/#organization",
                name: "Torah For The Table",
                legalName: "Torah For The Table Inc.",
                url: "https://torahforthetable.com/",
                logo: {
                  "@type": "ImageObject",
                  url: "https://torahforthetable.com/favicon-180x180.png",
                  width: 180,
                  height: 180,
                },
                image,
                description:
                  "A nonprofit digital platform sharing printable Divrei Torah for the weekly parsha and Yom Tov for children, families, and those seeking deeper Torah learning.",
                email: "hello@torahforthetable.com",
              },
              {
                "@type": "WebSite",
                "@id": "https://torahforthetable.com/#website",
                url: "https://torahforthetable.com/",
                name: "Torah For The Table",
                alternateName: "torahforthetable.com",
                publisher: {
                  "@id": "https://torahforthetable.com/#organization",
                },
              },
            ],
          }),
        },
      ],
    };
  },
});

// Only show a table thought when an approved entry matches the active parsha.
const TABLE_THOUGHTS: Record<string, { quote: string; sourceHebrew: string }> = {
  "chayei sarah": {
    quote: "Eliezer asked for a drink. Rivkah offered to water his camels, too. Sometimes, what we do beyond what’s asked changes everything.",
    sourceHebrew: "על פי בראשית כ״ד, י״ז–כ׳",
  },
  toldos: {
    quote: "When one well closes, keep digging. Your Rechovos may be just one more well away.",
    sourceHebrew: "על פי בראשית כ״ו, י״ח–כ״ב",
  },
};

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

  const displayedLabel = isFallback && fallbackParshaLabel ? fallbackParshaLabel : currentLabel;
  const displayedParshaKey = isFallback && fallbackParshaKey ? fallbackParshaKey : currentParshaKey;
  const heroDateLine = readingDate
    ? new Date(`${readingDate}T12:00:00Z`)
        .toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
        .replace(/^Saturday,/, "Shabbos,")
    : null;
  // The current reading controls the homepage context even when the PDF list
  // contains an earlier, clearly labeled published collection.
  const normalizedCollectionKey = (currentParshaKey ?? currentLabel)
    .replace(/^Parshas\s+/i, "")
    .trim()
    .toLowerCase();
  const tableThought = TABLE_THOUGHTS[normalizedCollectionKey];
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
  const isSukkosSeason = ["sukkos", "shemini atzeres", "simchas torah"].includes(normalizedCollectionKey);
  const sukkosSeasonTitle = "Divrei Torah for Sukkos, Shmini Atzeres & Simchas Torah";

  // Keep the current collection fresh after hydration. The homepage is time-sensitive,
  // and a platform/CDN can occasionally serve older SSR HTML even after the database
  // has newer published PDFs. A client-side server-function refresh ensures readers
  // see the current published collection without requiring a hard refresh.
  const [resources, setResources] = useState<Resource[]>(loaderData.resources ?? []);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    const refreshCurrentCollection = async () => {
      try {
        // Re-resolve the current reading first: if the server-rendered key is
        // stale (e.g. across a Shabbos rollover), reload the whole route.
        let freshKey: string | null = null;
        try {
          const o = await getParshaOverride();
          if (o.override && o.isActive) freshKey = o.override;
        } catch {
          // ignore
        }
        if (!freshKey) freshKey = (await resolveHebcalParsha()).parshaKey;
        if (cancelled) return;
        if (freshKey && freshKey !== currentParshaKey) {
          await router.invalidate();
          return;
        }
        const latest = await listHomepageWeek({ data: { parshaKey: currentParshaKey } });
        if (cancelled) return;
        if (hasDisplayedCollectionChanged(
          { isFallback, fallbackParshaKey },
          { isFallback: latest.isFallback, fallbackParshaKey: latest.fallbackParshaKey },
        )) {
          // Keep the heading, share link, and PDFs aligned across publication rollovers.
          await router.invalidate();
          return;
        }
        setResources(latest.resources as Resource[]);
      } catch (error) {
        console.error("Failed to refresh current collection", error);
      }
    };
    void refreshCurrentCollection();
    // Recheck real publications/reading while the page remains open; no synthetic events.
    let refreshing = false;
    const interval = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      try { await refreshCurrentCollection(); } finally { refreshing = false; }
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentParshaKey, isFallback, fallbackParshaKey, router]);
  useEffect(() => {
    setResources(loaderData.resources ?? []);
  }, [loaderData.resources]);

  // Refresh cached server-rendered progress after hydration so a completed
  // collection cannot retain a stale “more coming” status.
  const [progressFillStep, setProgressFillStep] = useState<number | null>(
    loaderData.progressFillStep ?? null,
  );
  const [progressEta, setProgressEta] = useState<string | null>(loaderData.progressEta ?? null);
  useEffect(() => {
    setProgressFillStep(loaderData.progressFillStep ?? null);
    setProgressEta(loaderData.progressEta ?? null);
  }, [loaderData.progressFillStep, loaderData.progressEta]);
  useEffect(() => {
    let cancelled = false;
    void getThursdayProgress()
      .then((progress) => {
        if (!cancelled) { setProgressFillStep(progress.fillStep); setProgressEta(progress.eta); }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const progressForCurrentReading = isProgressForReading(progressEta, readingDate);
  const currentPublishedCount = isFallback ? 0 : resources.length;
  const collectionComplete = isCollectionComplete(
    progressForCurrentReading ? progressFillStep : null,
    isFallback,
    resources.length,
  );
  const [postShabbos, setPostShabbos] = useState(false);
  useEffect(() => {
    const showingLastShabbos = isFallback || isPastReading(readingDate);
    setPostShabbos(showingLastShabbos && resources.length > 0 && isPostShabbosWindow());
  }, [isFallback, resources.length, readingDate]);

  const [audienceFilter, setAudienceFilter] = useState<"All" | "Children" | "Families" | "Adults">("All");
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("All");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("All");
  const [publicationFilter, setPublicationFilter] = useState<string>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAllResources, setShowAllResources] = useState(false);
  const [collectionScrollRequest, setCollectionScrollRequest] = useState(0);
  const locationHref = useRouterState({ select: (s) => s.location.href });
  const collectionHash = useRouterState({ select: (s) => s.location.hash });
  // When a guided-chooser category is active the page enters focused mode and
  // the full weekly collection (plus its filter controls) is hidden.
  const [activeChooser, setActiveChooser] = useState<string | null>(null);
  const [selectedChooser, setSelectedChooser] = useState<ChooserKey | null>(null);
  const [showRecommendationChooser, setShowRecommendationChooser] = useState(false);

  const sortedResources = resources;
  // Start-here showcase: only this week's published TFTT originals (matched by
  // canonical publication_id). Never last week's fallback PDFs, never a
  // third-party substitute for an absent series.
  const starterSelections = isFallback ? [] : pickStarterSelections(sortedResources);
  const starterCardCount = starterSelections.length;
  const originalBundles = currentOriginalBundles(sortedResources, currentParshaKey, isFallback);
  // Show all this week's publications by default; Browse All is a shortcut, not a gate.
  const showCompleteCollection = resources.length > 0 || isWeeklyCollectionHash(collectionHash) || showAllResources || isCurrentYomKippur;
  // Section views are passive; they do not establish human engagement.
  const originalsRef = useHomepageSectionImpression<HTMLElement>("originals", !isCurrentYomKippur);
  const weeklyHeadingRef = useHomepageSectionImpression<HTMLHeadingElement>("weekly_collection", resources.length > 0 && showCompleteCollection);
  useEffect(() => {
    if (resources.length > 0) trackHomepageJourneyStart(starterCardCount > 0 && !isCurrentYomKippur);
  }, [resources.length > 0, starterCardCount > 0, isCurrentYomKippur]);

  usePrewarmDownloads(sortedResources.map((r) => r.id));


  const matchesAudience = (r: Resource, value = audienceFilter) =>
    value === "All" || normalizeAudience(r.audience, r.title, r.publication_id) === value;
  const matchesLength = (r: Resource, value = lengthFilter) => matchesPageLength(r.page_count, value);
  const resourceContentType = (r: Resource) =>
    displayContentType(r.content_type, r.format_type, formatTypeLabel);
  const matchesContentType = (r: Resource, value = contentTypeFilter) =>
    value === "All" || resourceContentType(r) === value;
  const matchesPublication = (r: Resource, value = publicationFilter) =>
    value === "All" || publicationFilterName(r) === value;
  const publicationOptions = Array.from(new Set(sortedResources.map(publicationFilterName).filter((v): v is string => Boolean(v)))).sort((a,b)=>a.localeCompare(b));

  const lengthScoped = sortedResources.filter((r) => matchesAudience(r) && matchesContentType(r) && matchesPublication(r));
  const contentTypeScoped = sortedResources.filter((r) => matchesAudience(r) && matchesLength(r) && matchesPublication(r));

  const contentTypeOptions = Array.from(
    new Set(sortedResources.map((r) => resourceContentType(r)).filter((v): v is string => !!v)),
  ).sort((a, b) => a.localeCompare(b));

  const filteredResources = sortedResources.filter(
    (r) => matchesAudience(r) && matchesLength(r) && matchesContentType(r) && matchesPublication(r),
  );

  const lengthHasChoice = LENGTH_OPTIONS.filter((option) => option.key !== "All" &&
    sortedResources.some((r) => matchesPageLength(r.page_count, option.key))).length > 1;
  const contentTypeHasChoice = contentTypeOptions.length > 1;

  // Keep filter state valid when the weekly collection refreshes after hydration.
  // A stale selection can otherwise hide every card while its option disappears.
  useEffect(() => {
    if (
      audienceFilter !== "All" &&
      !sortedResources.some((r) => normalizeAudience(r.audience, r.title, r.publication_id) === audienceFilter)
    ) {
      setAudienceFilter("All");
    }

    if (lengthFilter !== "All") {
      const hasSelectedLength = sortedResources.some((r) => matchesPageLength(r.page_count, lengthFilter));
      if (!hasSelectedLength) setLengthFilter("All");
    }

    if (
      contentTypeFilter !== "All" &&
      !contentTypeOptions.includes(contentTypeFilter)
    ) {
      setContentTypeFilter("All");
    }
    if (publicationFilter !== "All" && !publicationOptions.includes(publicationFilter)) {
      setPublicationFilter("All");
    }

  }, [
    sortedResources,
    audienceFilter,
    lengthFilter,
    contentTypeFilter,
    contentTypeOptions,
    publicationFilter,
  ]);

  const activeFilterCount = Number(audienceFilter !== "All") + Number(lengthFilter !== "All") + Number(contentTypeFilter !== "All") + Number(publicationFilter !== "All");

  const pageCountLabel = (r: Resource) => {
    if (typeof r.page_count !== "number") return null;
    const pages = `${r.page_count} ${r.page_count === 1 ? "page" : "pages"}`;
    return r.page_count >= 20 ? `Long Study · ${pages}` : pages;
  };

  const isHaazinuWeek = normalizedCollectionKey === "ha'azinu";
  const haazinuQaTitle = "Parsha Questions & Answers – Haazinu";
  const duplicateTitleCounts = resources.reduce((counts, resource) => {
    counts.set(resource.title, (counts.get(resource.title) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const holidayQualifier = (r: Resource) => {
    if (!isSukkosSeason || (duplicateTitleCounts.get(r.title) ?? 0) < 2) return null;
    const key = (r.parsha_key ?? "").toLowerCase();
    if (key === "sukkos") return "Sukkos";
    if (key === "shemini atzeres" || key === "simchas torah") return "Shmini Atzeres & Simchas Torah";
    return r.parsha_key;
  };
  const displayTitle = (r: Resource) => {
    const series = promotionSeriesById(r.publication_id);
    const base = series?.key === "ramban"
      ? r.title.replace(/^Parsha Pearls(?:\s+(?:from|on)\s+the\s+Ramban)?\b/i, series.title)
      : series?.key === "qa"
        ? r.title.replace(/^Parsha Challenge/i, series.title)
        : isHaazinuWeek && r.title === "Parsha Questions & Answers" ? haazinuQaTitle : r.title;
    const qualifier = holidayQualifier(r);
    return qualifier ? `${base} — ${qualifier}` : base;
  };
  const displayPublicationName = (r: Resource) =>
    promotionSeriesById(r.publication_id)?.title ??
      (isHaazinuWeek && r.title === "Parsha Questions & Answers"
        ? haazinuQaTitle
        : publicationLabel(r.publication || r.title) || r.title);

  const isTfttOriginal = (r: Resource) => Boolean(tfttOriginalSeriesById(r.publication_id));
  // Preserve the recommendation order in guided mode; otherwise partition
  // the already-filtered list by verified publication ownership, exactly once.
  const weeklyResourceGroups = isCurrentYomKippur
    ? [{ key: "all", heading: null, items: filteredResources }]
    : [
        { key: "originals", heading: "Our Original Publications", items: filteredResources.filter(isTfttOriginal) },
        { key: "additional", heading: "More Divrei Torah for Your Table", items: filteredResources.filter((r) => !isTfttOriginal(r)) },
      ].filter((group) => group.items.length > 0);
  // The seven originals keep their series artwork in every homepage listing,
  // including the previous-collection fallback and issues without PDF previews.
  const originalCover = (r: Resource, compactOnMobile = false) => {
    const cover = resolveListingCover(r.publication_id, r.thumb_url, r.small_thumb_url);
    const isMiKaamcha = r.publication_id === "bd544c49-a810-478d-bf5c-38b94a81bc31";
    const src = isMiKaamcha && cover.src ? "/publication-covers/mi-kaamcha-yisroel-logo-v1.webp" : cover.src;
    if (!src) return null;
    const href = pdfActionHrefs(r.id).open;
    return (
      <StarterThumb
        key={src}
        compactOnMobile={compactOnMobile}
        seriesCover={Boolean(cover.series)}
        smallSrc={isMiKaamcha ? null : cover.smallSrc}
        src={src}
        alt={cover.series ? `${cover.series.title} permanent cover` : isMiKaamcha ? "Mi Ka'amcha Yisroel permanent cover" : `Cover for ${displayTitle(r)} for ${r.parsha_key ?? displayedParshaKey ?? "this week"}`}
        title={displayTitle(r)}
        href={href}
        onOpen={(event) => recordPdfAction(event, "open_pdf", href, {
          publicationId: r.id,
          publicationName: displayPublicationName(r),
          publicationTitle: displayTitle(r),
          publicationSeries: r.publication,
          publisher: r.publisher,
          parsha: r.parsha_key ?? displayedParshaKey,
          jewishYear: r.jewish_year ?? null,
        }, "thumbnail")}
      />
    );
  };
  // Only canonical current-week originals belong in the starter row.

  const clearFilters = () => {
    setSelectedChooser(null);
    setAudienceFilter("All");
    setLengthFilter("All");
    setContentTypeFilter("All");
    setPublicationFilter("All");
  };

  const browseAllSelections = () => {
    clearFilters();
    setActiveChooser(null);
    setShowRecommendationChooser(false);
    setShowAllResources(true);
    setCollectionScrollRequest((n) => n + 1);
  };
  useEffect(() => {
    if (!isWeeklyCollectionHash(collectionHash)) return;
    clearFilters();
    setActiveChooser(null);
    setShowRecommendationChooser(false);
    setShowAllResources(true);
    setCollectionScrollRequest((n) => n + 1);
  }, [locationHref]);
  useEffect(() => {
    document.addEventListener(WEEKLY_COLLECTION_REQUEST, browseAllSelections);
    return () => document.removeEventListener(WEEKLY_COLLECTION_REQUEST, browseAllSelections);
  }, []);
  useEffect(() => {
    if (collectionScrollRequest > 0 && showCompleteCollection) scrollToWeeklyCollection();
  }, [collectionScrollRequest, showCompleteCollection]);

  const showMoreComingNotice =
    !isFallback &&
    !postShabbos &&
    !isYomTovCollection &&
    !collectionComplete &&
    (weeklyReleaseAt(readingDate)?.getTime() ?? 0) > (loaderData.renderedAt ?? Date.now());

  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBanner initialBanner={Route.useLoaderData().announcement} />
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-4 sm:py-4 md:px-8 md:py-5 space-y-3 sm:space-y-4 md:space-y-5">
        <section className="border-b border-accent/30">
          <div className="px-2 pb-2 pt-1 text-center sm:px-4 sm:pb-3 sm:pt-1">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-readable sm:text-xs">
              {isCurrentYomKippur ? "Yom Kippur Resources" : "This Week's Parsha"}
            </p>
            <h1 className="mt-1 text-balance font-serif text-xl font-bold leading-tight text-primary sm:text-3xl">
              {isCurrentYomKippur
                ? "Yom Kippur Divrei Torah"
                : isSukkosSeason
                  ? sukkosSeasonTitle
                  : isFallback
                    ? `${currentLabel} — This Week's Parsha`
                    : <><span className="block sm:inline">{currentLabel}</span><span className="hidden sm:inline"> — </span><span className="block text-base sm:inline sm:text-inherit">Weekly Divrei Torah</span></>}
            </h1>
            {!isCurrentYomKippur && (
              <p className="mx-auto mt-1 max-w-xl text-sm font-medium leading-snug text-primary sm:text-base">
                Printable Divrei Torah, stories and questions for your Shabbos table.
              </p>
            )}
            {(isFallback || postShabbos || resources.length === 0) && (
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {isFallback
                  ? "This week's Divrei Torah are being prepared. New selections every Thursday."
                  : postShabbos
                    ? "These Torah sheets remain available to read or print."
                    : "New Divrei Torah will appear here as soon as they are published."}
              </p>
            )}
            {heroDateLine && (
              <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">{heroDateLine}</p>
            )}
            {showMoreComingNotice && (
              <p aria-label="Upcoming Divrei Torah" className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                More Divrei Torah through <strong className="whitespace-nowrap font-semibold text-primary">Thursday, 8 PM ET</strong>
              </p>
            )}
            {resources.length > 0 && (
              <div className="mt-2 sm:mt-3">
                <Button onClick={browseAllSelections} className="h-auto min-h-11 max-w-full whitespace-normal rounded-full px-5 py-2.5 font-serif text-base font-semibold">
                  {isFallback
                    ? `Browse Earlier Collection: ${displayedLabel}`
                    : isCurrentYomKippur
                      ? "Browse Yom Kippur Printables"
                      : "Browse This Week's Printables"}
                </Button>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {resources.length} {resources.length === 1 ? "selection" : "selections"} available {isFallback ? "in the earlier collection" : "this week"}
                </p>
              </div>
            )}
            <nav aria-label="Other Torah collections" className="mt-1 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4">
              <Link to="/divrei-torah-parsha" className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline decoration-accent/60 underline-offset-4 sm:text-sm">Browse Earlier Parshas</Link>
            </nav>
          </div>
        </section>
        {(isFallback || resources.length === 0) && (
          <UpdateCountdown
            compact
            contentLive={false}
            liveParshaLabel={currentLabel}
            readingDate={readingDate}
            availableCount={0}
            collectionComplete={false}
            initialNow={loaderData.renderedAt}
          />
        )}

        {!isCurrentYomKippur && (
          <section
            ref={originalsRef}
            id="our-originals"
            tabIndex={-1}
            aria-labelledby="starter-selections-heading"
            className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-[#b99a5b] bg-[#fbefda] px-4 py-4 text-center text-[#17304d] shadow-sm sm:px-6 sm:py-5"
          >
            <div className="mx-auto flex max-w-2xl items-center justify-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#b99a5b]/70 text-[#8d6b30]" aria-hidden="true">
                <BookOpen className="h-4 w-4" />
              </span>
              <h2 id="starter-selections-heading" className="font-serif text-xl font-bold leading-tight text-[#17304d] sm:text-3xl">Choose Your Shabbos Bundle</h2>
            </div>
            <p className="mx-auto mt-2 max-w-xl font-serif text-sm italic leading-relaxed text-[#17304d]">
              Choose an audience bundle, or open any publication on its own.
            </p>
            <OriginalBundleChooser
              bundles={originalBundles}
              collectionLabel={currentLabel}
              parshaKey={currentParshaKey}
            />
            <Link
              to="/originals"
              className="mt-3 inline-flex min-h-11 items-center justify-center px-3 font-serif text-sm font-semibold text-[#17304d] underline decoration-[#b99a5b] underline-offset-4 hover:text-[#284b73] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17304d]"
            >
              Explore Our Original Series
            </Link>
            {!isFallback && canShowOriginalsLaunch(resources.flatMap((resource) => resource.publication_id ? [resource.publication_id] : [])) && (
              <aside aria-label="New original series" className="mx-auto mt-4 max-w-xl border-t border-[#d9b875]/40 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8d6b30]">Introducing Three New Weekly Series</p>
                <p className="mt-1 font-serif text-lg font-bold">More Torah. More Discovery.</p>
                <p className="mt-1 text-sm text-[#17304d]">{NEW_ORIGINAL_SERIES.map((series) => series.title).join(" · ")}</p>
              </aside>
            )}
          </section>
        )}

        {(resources.length === 0 || showCompleteCollection) && (
        <section id="this-weeks-collection" tabIndex={-1} className="scroll-mt-24">
          <div className="px-1 sm:px-2">
            <h2 ref={weeklyHeadingRef} className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-primary text-center">
              {isFallback
                ? `Previous Collection — ${displayedLabel}`
                : isCurrentYomKippur
                  ? "Yom Kippur Divrei Torah and preparation"
                  : "Available This Week"}
            </h2>
            {(isFallback || !isCurrentYomKippur) && (
              <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
                {isFallback
                  ? `These ${resources.length} selections are from ${displayedLabel}, not ${currentLabel}. This week's PDFs will appear once published. Choose a title to read or print an earlier edition.`
                  : "Choose any publication to read, download or print. No account needed."}
              </p>
            )}
            <>
            {resources.length === 0 ? (
              <p className="mt-6 text-center text-muted-foreground max-w-md mx-auto">
                New Divrei Torah for {currentLabel} are being prepared. Check back soon!
              </p>
            ) : showCompleteCollection ? (
              <>
                {sortedResources.length >= 6 && (
                  <>
                <div className="hidden text-center sm:block">
                  <button
                    type="button"
                    aria-expanded={showRecommendationChooser}
                    aria-controls="weekly-recommendation-chooser"
                    onClick={() => {
                      if (showRecommendationChooser) {
                        setSelectedChooser(null);
                        setActiveChooser(null);
                      }
                      setShowRecommendationChooser((open) => !open);
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-accent/45 bg-background px-5 py-2.5 font-serif text-sm font-semibold text-primary hover:border-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {showRecommendationChooser ? "Hide guided suggestions" : "Need help choosing? See guided suggestions"}
                  </button>
                </div>
                <div id="weekly-recommendation-chooser" className="hidden sm:block">
                  {showRecommendationChooser && (
                    <TableChooser
                      resources={sortedResources}
                      parshaKey={displayedParshaKey}
                      displayTitle={(r) => displayTitle(r as Resource)}
                      displayPublicationName={(r) => displayPublicationName(r as Resource)}
                      selected={selectedChooser}
                      onSelectedChange={setSelectedChooser}
                      onActiveChooserChange={setActiveChooser}
                    />
                  )}
                </div>

                <div id="filters" aria-label="Weekly collection filters" className="mt-3 scroll-mt-24 rounded-lg border border-accent/35 bg-card/60 px-2 py-2 sm:mt-4 sm:rounded-xl sm:px-4 sm:py-3">
                  <div className="space-y-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0" role="group" aria-label="Quick filters">
                    {([["All", "Children", "Families"], ["Adults", "Brief Insights"]] as const).map((row, rowIndex) => {
                      const available = row.filter((choice) => choice === "All" || (choice === "Brief Insights"
                        ? contentTypeOptions.includes("Brief Insights")
                        : sortedResources.some((r) => matchesAudience(r, choice))));
                      if (available.length === 0) return null;
                      return (
                        <div key={rowIndex} className={`grid gap-1.5 sm:contents ${available.length === 3 ? "grid-cols-3" : available.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {available.map((choice) => {
                            const isBrief = choice === "Brief Insights";
                            const active = choice === "All" ? activeFilterCount === 0 : isBrief ? contentTypeFilter === "Brief Insights" : audienceFilter === choice;
                            return (
                              <Button variant="ghost" key={choice} type="button" aria-pressed={active} onClick={() => {
                                clearFilters();
                                if (isBrief) {
                                  const next = active ? "All" : "Brief Insights";
                                  setContentTypeFilter(next);
                                  trackFp("filter_change", { metadata: { filter: "content_type", value: next } });
                                } else {
                                  const next = active ? "All" : choice;
                                  setAudienceFilter(next);
                                  trackFp("filter_change", { metadata: { filter: "audience", value: next } });
                                }
                              }} className={`min-h-11 min-w-0 rounded-full border px-2 py-1.5 text-center text-xs font-semibold leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${publicFilterTone(active)}`}>{isBrief ? "Brief Insights" : audienceLabel(choice)}</Button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 border-t border-accent/25 pt-1 sm:mt-1 sm:gap-x-2">
                    <Button variant="ghost"
                      type="button"
                      aria-expanded={filtersOpen}
                      aria-controls="weekly-filter-options"
                      onClick={() => setFiltersOpen((open) => !open)}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold text-primary hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {filtersOpen ? "Fewer filters" : "More filters"}
                    </Button>
                    <span role="status" className="text-right text-xs tabular-nums text-muted-foreground">{filteredResources.length === sortedResources.length ? `${filteredResources.length} ${filteredResources.length === 1 ? "selection" : "selections"}` : `${filteredResources.length} of ${sortedResources.length} selections`}</span>
                    {(
                      <Button
                        variant="ghost"
                        disabled={activeFilterCount === 0}
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex min-h-11 items-center px-1 text-xs font-serif text-accent-readable hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>


                  <div id="weekly-filter-options" hidden={!filtersOpen} className={`${filtersOpen ? "block sm:grid" : "hidden"} mt-3 space-y-3 sm:grid-cols-2 lg:grid-cols-3 sm:items-start sm:gap-4 sm:space-y-0`}>
                    {lengthHasChoice && (
                      <div>
                        <span className="block text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By length</span>
                        <div className="mt-1.5 flex flex-wrap justify-start gap-2">
                          {(() => {
                            const options = LENGTH_OPTIONS.map((option) => ({ ...option,
                              count: lengthScoped.filter((r) => matchesPageLength(r.page_count, option.key)).length,
                            })).filter((o) => o.key === "All" || sortedResources.some((r) => matchesPageLength(r.page_count, o.key)));
                            return options.map((o) => {
                              const active = lengthFilter === o.key;
                              return (
                                <Button variant="ghost"
                                  key={o.key}
                                  type="button"
                                  aria-pressed={active}
                                  aria-label={`Filter by length: ${o.label}`}
                                  disabled={o.key !== "All" && o.count === 0 && !active}
                                  title={`${o.count} matching selections`}
                                  onClick={() => {
                                    setSelectedChooser(null);
                                    const next = active ? "All" : o.key;
                                    setLengthFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "length", value: next } });
                                  }}
                                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                                    publicFilterTone(active)
                                  }`}
                                >
                                  {o.label} <span className="ml-1 tabular-nums">({o.count})</span>
                                </Button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {publicationOptions.length > 0 && (
                      <div>
                        <label htmlFor="weekly-publication-filter" className="block text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By publication / author</label>
                        <select
                          id="weekly-publication-filter"
                          value={publicationFilter}
                          onChange={(e) => {
                            setSelectedChooser(null);
                            setPublicationFilter(e.target.value);
                            trackFp("filter_change", { metadata: { filter: "publication", value: e.target.value } });
                          }}
                          className={`mt-1.5 w-full min-h-11 rounded-lg border px-3 py-2 text-sm ${PUBLIC_FILTER_FIELD_TONE}`}
                        >
                          <option value="All">All publications</option>
                          {publicationOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {contentTypeHasChoice && (
                      <div>
                        <span className="block text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By content type</span>
                        <div className="mt-1.5 flex flex-wrap justify-start gap-2">
                          {[
                            { key: "All", label: "All", count: contentTypeScoped.length },
                            ...contentTypeOptions.map((t) => ({
                              key: t,
                              label: t,
                              count: contentTypeScoped.filter((r) => resourceContentType(r) === t).length,
                            })),
                          ]
                            .map((o) => {
                              const active = contentTypeFilter === o.key;
                              return (
                                <Button variant="ghost"
                                  key={o.key}
                                  type="button"
                                  aria-pressed={active}
                                  aria-label={`Filter by content type: ${o.label}`}
                                  disabled={o.key !== "All" && o.count === 0 && !active}
                                  title={`${o.count} matching selections`}
                                  onClick={() => {
                                    setSelectedChooser(null);
                                    const next = active ? "All" : o.key;
                                    setContentTypeFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "content_type", value: next } });
                                  }}
                                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                                    publicFilterTone(active)
                                  }`}
                                >
                                  {o.label} <span className="ml-1 tabular-nums">({o.count})</span>
                                </Button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                  </>
                )}

                <div id="weekly-publication-list" className="mt-3 scroll-mt-24 grid grid-cols-1 gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-4">
                  {weeklyResourceGroups.map((group) => (
                    <Fragment key={group.key}>
                    {group.heading && (
                      <h3 className="col-span-full mt-2 border-b border-accent/40 pb-2 font-serif text-lg font-bold text-primary sm:text-xl">
                        {group.heading}
                      </h3>
                    )}
                    {group.items.map((r) => (
                    <PublicationCardTracker
                      key={r.id}
                      className="h-full rounded-xl border border-accent/40 bg-card p-2 sm:p-4 hover:border-accent/70 hover:shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 flex flex-col"
                      publication_id={r.id}
                      publication_title={r.title}
                      publication_series={r.publication ?? null}
                      publisher={r.publisher ?? null}
                      parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey ?? null}
                    >
                      <div className="flex flex-1 items-start gap-2.5 sm:gap-3">
                        {originalCover(r, true) ?? (
                          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg bg-accent/12 text-primary shrink-0">
                            <FileText className="h-5 w-5" aria-hidden="true" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {(() => {
                            const badges = weeklyCardBadges(isTfttOriginal(r), r.badge);
                            return badges.length > 0 ? (
                              <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {badges.map((b) => b.tone === "subtle" ? (
                                  <span key={b.label} className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{b.label}</span>
                                ) : (
                                  <span key={b.label} className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-sans text-[11px] font-bold uppercase leading-none tracking-wide text-accent-foreground">{b.label}</span>
                                ))}
                              </p>
                            ) : null;
                          })()}
                          <h4 className="min-w-0 break-words font-serif text-base font-bold leading-snug text-primary sm:text-xl">
                            <Link to="/view/$id" params={{ id: r.id }} className="hover:text-accent hover:underline transition-colors duration-150">
                              {displayTitle(r)}
                            </Link>
                          </h4>
                          {r.publisher && <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">By {r.publisher}</p>}
                          <PublicationQuickFacts
                            audience={audienceLabel(normalizeAudience(r.audience, displayTitle(r), r.publication_id)) ?? r.audience}
                            format={resourceContentType(r)}
                            length={pageCountLabel(r)}
                          />
                          {(() => {
                            const summary = r.summary_quick || r.subtitle || r.description;
                            return summary ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:mt-2 sm:line-clamp-none sm:text-sm">{summary}</p>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      <div className="mt-auto pt-2 sm:pt-4">
                        <DownloadAndPrintButtons
                          href={`/view/${r.id}/pdf`}
                          publicationId={r.id}
                          publicationName={displayPublicationName(r)}
                          publicationTitle={r.title}
                          publisher={r.publisher}
                          publicationSeries={r.publication}
                          parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                          jewishYear={r.jewish_year ?? null}
                          className="w-full px-3 py-2.5 lg:py-2"
                        />
                        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2 sm:mt-2">
                          <SharePublicationButton
                            pdfId={r.id}
                            title={r.title}
                            parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                          />
                        </div>
                      </div>
                    </PublicationCardTracker>
                    ))}
                    </Fragment>
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
            ) : null}
            </>

          </div>
        </section>
        )}

        <section aria-label="Stay connected" className="mx-auto max-w-2xl">
          <WeeklyEmailSignup
            sourceId="homepage"
            heading="Receive the Weekly Shabbos Collection"
            description="Receive our seven original weekly series and additional Divrei Torah in your inbox, ready to read or print before Shabbos."
          />
        </section>



        {!isFallback && tableThought && (
          <section
            aria-labelledby="table-thought-heading"
            className="mx-auto w-full max-w-3xl rounded-2xl border border-accent/50 bg-card/70 px-5 py-5 text-center shadow-sm sm:px-8 sm:py-6"
          >
            <h2
              id="table-thought-heading"
              className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent-readable sm:text-xs"
            >
              TABLE TALK
            </h2>
            <p className="mt-1 font-sans text-[11px] uppercase tracking-[0.1em] text-muted-foreground sm:text-[11px]">
              A THOUGHT FOR YOUR SHABBOS TABLE
            </p>
            <blockquote className="mx-auto mt-3 max-w-2xl font-serif text-lg leading-relaxed text-primary sm:text-2xl sm:leading-relaxed">
              “{tableThought.quote}”
            </blockquote>
            <p lang="he" dir="rtl" className="mt-3 font-serif text-sm text-muted-foreground">
              {tableThought.sourceHebrew}
            </p>
          </section>
        )}
        <ThursdayProgressMeter
          readingDate={readingDate}
          isFallback={isFallback}
          currentPublishedCount={currentPublishedCount}
          progressFillStep={progressFillStep}
          progressEta={progressEta}
          isYomTov={isYomTovCollection}
          initialNow={loaderData.renderedAt}
        />

        <HomepageShare onWhatsApp={() => {
          trackEvent("share_whatsapp", { parsha: displayedParshaKey ?? displayedLabel, count: resources.length });
          trackFp("share_click", { metadata: { placement: "homepage_veahavta", share_method: "whatsapp" } });
        }} />

            <HiddenGemTeaser
              context={{ normalizedCollectionKey, activeParshaKey: currentParshaKey, isFallback, isYomTov: isYomTovCollection, readingDate }}
              initialNow={loaderData.renderedAt ?? Date.now()}
            />



        <section className="mx-auto max-w-2xl text-center">
          <Link
            to="/divrei-torah-parsha"
            className="inline-flex items-center justify-center rounded-full border border-accent/45 bg-background px-5 py-2.5 font-serif font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Browse Available Parshas
          </Link>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Permanent parsha pages with short vorts, printable Torah sheets, family material and archive selections.
          </p>
          {displayedParshaKey && !isYomTovCollection && !isYomTovReading(displayedParshaKey) && (
            <div className="mt-6 border-t border-accent/25 pt-5">
              <h2 className="font-serif text-xl font-bold text-primary">Browse Earlier Editions</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                The archive of past weeks' Divrei Torah, from every available year, is open anytime.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/archive"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-accent/45 bg-background px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Open the Archive
                </Link>
                <Link
                  to="/parsha/$slug"
                  params={{ slug: readingSlug(displayedParshaKey) }}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-accent/45 bg-background px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  All {formatReadingLabel(displayedParshaKey)} Divrei Torah
                </Link>
              </div>
            </div>
          )}
        </section>

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
              <span className="font-sans text-[11px] sm:text-xs uppercase tracking-[0.3em]" dir="ltr">Dedication</span>
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

        <p className="text-center text-xs text-muted-foreground">Divrei Torah in Hebrew — Coming Soon</p>
        <BackToTop collectionId={showCompleteCollection ? "this-weeks-collection" : "starter-selections-heading"} />
        <SiteFooter />
      </div>
    </div>
  );
}
