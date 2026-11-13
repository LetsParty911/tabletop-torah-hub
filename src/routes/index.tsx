import { createFileRoute, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isPostShabbosWindow } from "@/lib/post-shabbos";
import { FileText } from "lucide-react";
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
import { leadWithPublicationTitle } from "@/lib/publication-description";
import { PARSHA_DETECTIVE_PUBLICATION_ID, PARSHA_DETECTIVE_SERIES_COPY, TFTT_ORIGINAL_EDITION_SERIES, tfttOriginalSeriesById } from "@/lib/tftt-originals";
import { publicationLabel } from "@/lib/badges";
import { publicationFilterName } from "@/lib/publication-filter";
import { Button } from "@/components/ui/button";
import { SmallPdfImage } from "@/components/SmallPdfImage";
import { LENGTH_OPTIONS, matchesPageLength, type LengthFilter } from "@/lib/length-filter";
import { isWeeklyCollectionHash, scrollToWeeklyCollection, WEEKLY_COLLECTION_REQUEST } from "@/lib/weekly-navigation";
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
import { MobileCollectionControlsBar } from "@/components/MobileCollectionControlsBar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHOOSERS, chooseReason, pickRecommendations, pickStarterSelections, type ChooserKey } from "@/lib/table-chooser";

type Resource = {
  id: string;
  parsha_key: string | null;
  title: string;
  publisher: string | null;
  subtitle: string | null;
  url: string;
  summary_quick: string | null;
  content_type: string | null;
  summary_audio_path: string | null;
  primary_category: string | null;
  publication: string | null;
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

// First-page preview for every publication; also acts as a tracked PDF-open link.
function StarterThumb({ src, smallSrc, alt, title, href, onOpen }: {
  src: string;
  smallSrc?: string | null;
  alt: string;
  title: string;
  href: string;
  onOpen: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div role="img" aria-label={`Cover unavailable for ${title}`} className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-primary">
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
      className="block h-[83px] w-16 shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <SmallPdfImage
        key={src}
        src={src}
        verifiedSmallSrc={smallSrc}
        alt={alt}
        width={64}
        height={83}
        loading="lazy"
        decoding="async"
        onUnavailable={() => setFailed(true)}
        className="h-[83px] w-16 rounded-sm border border-accent/40 bg-card object-contain shadow-sm hover:border-accent"
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
      "Original weekly Parsha Challenge, Stories for the Shabbos Table, In the Margins, and The Parsha Detective, alongside printable Divrei Torah from respected Torah publishers.";
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
                  "A nonprofit digital platform sharing printable Divrei Torah for the weekly parsha and Yom Tov for children, families, and adults.",
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

const FEATURED_SLOTS = [
  { key: "children", label: "Best for Children" },
  { key: "family", label: "Best for the Family Table" },
  { key: "quickest", label: "Quickest Read" },
  { key: "deeper", label: "Deeper Learning" },
] as const;

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
        })
        .replace(/^Saturday,/, "Shabbos,")
    : null;
  const normalizedCollectionKey = (displayedParshaKey ?? displayedLabel)
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
  const [mobileQuickChoice, setMobileQuickChoice] = useState<ChooserKey | null>(null);
  const [detectiveLaunchOpen, setDetectiveLaunchOpen] = useState(false);

  const sortedResources = resources;
  // Start-here showcase: only this week's published TFTT originals (matched by
  // canonical publication_id). Never last week's fallback PDFs, never a
  // third-party substitute for an absent series.
  const starterSelections = isFallback ? [] : pickStarterSelections(sortedResources);
  const parshaDetective = !isFallback && PARSHA_DETECTIVE_PUBLICATION_ID
    ? sortedResources.find((r) => r.publication_id === PARSHA_DETECTIVE_PUBLICATION_ID) ?? null
    : null;
  const showDetectivePlaceholder = !isFallback && Boolean(PARSHA_DETECTIVE_PUBLICATION_ID) && !parshaDetective;
  const starterCardCount = starterSelections.length + (showDetectivePlaceholder ? 1 : 0);

  useEffect(() => {
    if (!parshaDetective || !displayedParshaKey) return;
    const key = `tftt-parsha-detective-launch-${displayedParshaKey.toLowerCase().replace(/\s+/g, "-")}`;
    try {
      if (window.localStorage.getItem(key)) return;
      setDetectiveLaunchOpen(true);
      window.localStorage.setItem(key, "shown");
    } catch {
      setDetectiveLaunchOpen(true);
    }
  }, [parshaDetective?.id, displayedParshaKey]);
  // Show all this week's publications by default; Browse All is a shortcut, not a gate.
  const showCompleteCollection = resources.length > 0 || isWeeklyCollectionHash(collectionHash) || showAllResources || isCurrentYomKippur;
  const viewAllLabel = `View all ${resources.length} ${displayedLabel.replace(/^Parshas\s+/i, "")} selections`;
  // Section views are passive; they do not establish human engagement.
  const originalsRef = useHomepageSectionImpression<HTMLElement>("originals", starterCardCount > 0 && !isCurrentYomKippur);
  const weeklyHeadingRef = useHomepageSectionImpression<HTMLHeadingElement>("weekly_collection", resources.length > 0 && showCompleteCollection);
  useEffect(() => {
    if (resources.length > 0) trackHomepageJourneyStart(starterCardCount > 0 && !isCurrentYomKippur);
  }, [resources.length > 0, starterCardCount > 0, isCurrentYomKippur]);

  usePrewarmDownloads(sortedResources.map((r) => r.id));


  const matchesAudience = (r: Resource, value = audienceFilter) =>
    value === "All" || normalizeAudience(r.audience, r.title) === value;
  const matchesLength = (r: Resource, value = lengthFilter) => matchesPageLength(r.page_count, value);
  const resourceContentType = (r: Resource) =>
    displayContentType(r.content_type, r.format_type, formatTypeLabel);
  const matchesContentType = (r: Resource, value = contentTypeFilter) =>
    value === "All" || resourceContentType(r) === value;
  const matchesPublication = (r: Resource, value = publicationFilter) =>
    value === "All" || publicationFilterName(r) === value;
  const publicationOptions = Array.from(new Set(sortedResources.map(publicationFilterName).filter((v): v is string => Boolean(v)))).sort((a,b)=>a.localeCompare(b));

  const lengthScoped = sortedResources.filter((r) => matchesAudience(r) && matchesContentType(r));
  const contentTypeScoped = sortedResources.filter((r) => matchesAudience(r) && matchesLength(r));

  const contentTypeOptions = Array.from(
    new Set(sortedResources.map((r) => resourceContentType(r)).filter((v): v is string => !!v)),
  ).sort((a, b) => a.localeCompare(b));

  const filteredResources = mobileQuickChoice
    ? pickRecommendations(sortedResources, mobileQuickChoice)
    : sortedResources.filter(
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
      !sortedResources.some((r) => normalizeAudience(r.audience, r.title) === audienceFilter)
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

    // A quick selection with no matching PDFs must never leave an empty list.
    if (mobileQuickChoice && pickRecommendations(sortedResources, mobileQuickChoice).length === 0) {
      setMobileQuickChoice(null);
    }
  }, [
    sortedResources,
    audienceFilter,
    lengthFilter,
    contentTypeFilter,
    contentTypeOptions,
    publicationFilter,
    mobileQuickChoice,
  ]);

  const activeFilterCount = mobileQuickChoice
    ? 1
    : Number(audienceFilter !== "All") + Number(lengthFilter !== "All") + Number(contentTypeFilter !== "All") + Number(publicationFilter !== "All");

  const featuredPicks = FEATURED_SLOTS.map((slot) => ({
    ...slot,
    resource: resources.find((r) => (r.featured_slot ?? "").trim().toLowerCase() === slot.key),
  })).filter((p) => !!p.resource);
  const quickChoices = (["quick", "family", "kids", "story"] as const).map((key) => {
    const chooser = CHOOSERS.find((option) => option.key === key);
    const labels: Record<(typeof key), string> = {
      quick: "Brief Insights",
      family: "Family Table",
      kids: "Children",
      story: "Stories",
    };
    return { key, label: labels[key], trackingLabel: chooser?.label ?? labels[key] };
  });

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
    const base = tfttOriginalSeriesById(r.publication_id)?.title === "Parsha Challenge"
      ? r.title.replace(/^Parsha Questions\s*(?:&|and)\s*Answers/i, "Parsha Challenge")
      : isHaazinuWeek && r.title === "Parsha Questions & Answers" ? haazinuQaTitle : r.title;
    const qualifier = holidayQualifier(r);
    return qualifier ? `${base} — ${qualifier}` : base;
  };
  const displayPublicationName = (r: Resource) =>
    isHaazinuWeek && r.title === "Parsha Questions & Answers"
      ? haazinuQaTitle
      : publicationLabel(r.publication || r.title) || r.title;

  const isTfttOriginal = (r: Resource) => Boolean(tfttOriginalSeriesById(r.publication_id));
  // Display the correct uploaded PDF cover on all publication cards in ALL
  // homepage states, including when last week's collection is shown as fallback.
  const originalCover = (r: Resource) => {
    if (!r.thumb_url) return null;
    const href = pdfActionHrefs(r.id).open;
    return (
      <StarterThumb
        smallSrc={r.small_thumb_url}
        src={r.publication_id === "bd544c49-a810-478d-bf5c-38b94a81bc31" ? "/publication-covers/mi-kaamcha-yisroel-permanent.jpg" : r.thumb_url}
        alt={r.publication_id === "bd544c49-a810-478d-bf5c-38b94a81bc31" ? "Mi Ka'amcha Yisroel permanent cover" : `Cover for ${displayTitle(r)} for ${r.parsha_key ?? displayedParshaKey ?? "this week"}`}
        title={displayTitle(r)}
        href={href}
        onOpen={(event) => recordPdfAction(event, "open_pdf", href, {
          publicationId: r.id,
          publicationName: displayPublicationName(r),
          publicationTitle: displayTitle(r),
          publicationSeries: r.publication,
          publisher: r.publisher,
          parsha: r.parsha_key ?? displayedParshaKey,
        }, "thumbnail")}
      />
    );
  };
  // Only canonical current-week originals belong in the starter row.
  const starterShowsAllOriginals =
    starterCardCount === TFTT_ORIGINAL_EDITION_SERIES.length &&
    starterSelections.every(({ resource }) => isTfttOriginal(resource));

  const clearFilters = () => {
    setSelectedChooser(null);
    setMobileQuickChoice(null);
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

  return (
    <div className="min-h-screen bg-background">
      {parshaDetective && (
        <Dialog open={detectiveLaunchOpen} onOpenChange={setDetectiveLaunchOpen}>
          <DialogContent className="max-w-md border-2 border-accent/60 bg-card text-center">
            <DialogHeader className="text-center sm:text-center">
              <p className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-accent-readable">New from Torah For The Table</p>
              <DialogTitle className="font-serif text-2xl text-primary">The Parsha Detective</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                A new illustrated series of Torah mysteries for children and families to solve together at the Shabbos table.
              </DialogDescription>
            </DialogHeader>
            <a
              href={pdfActionHrefs(parshaDetective.id).open}
              target="_blank"
              rel="nofollow noopener noreferrer"
              onClick={(event) => {
                recordPdfAction(event, "open_pdf", pdfActionHrefs(parshaDetective.id).open, {
                  publicationId: parshaDetective.id,
                  publicationName: displayPublicationName(parshaDetective),
                  publicationTitle: displayTitle(parshaDetective),
                  publicationSeries: parshaDetective.publication,
                  publisher: parshaDetective.publisher,
                  parsha: parshaDetective.parsha_key ?? displayedParshaKey,
                }, "popup");
                setDetectiveLaunchOpen(false);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-2.5 font-serif text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              See This Week’s Case →
            </a>
            <button type="button" onClick={() => setDetectiveLaunchOpen(false)} className="text-sm text-muted-foreground hover:text-primary hover:underline">
              Maybe later
            </button>
          </DialogContent>
        </Dialog>
      )}
      <AnnouncementBanner initialBanner={Route.useLoaderData().announcement} />
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-7 md:px-8 md:py-10 space-y-4 sm:space-y-6 md:space-y-8">
        <section className="parchment-frame">
          <div className="parchment-panel px-4 py-4 text-center sm:py-6">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-readable sm:text-xs">
              {isCurrentYomKippur ? "Yom Kippur Resources" : isFallback ? "Latest Available Collection" : "This Week's Parsha"}
            </p>
            <h1 className="mt-1 font-serif text-xl font-bold leading-tight text-primary sm:text-3xl">
              {isCurrentYomKippur
                ? "Yom Kippur Divrei Torah"
                : isSukkosSeason
                  ? sukkosSeasonTitle
                  : isFallback
                    ? `${displayedLabel} — Still Available`
                    : `${displayedLabel} — Weekly Divrei Torah`}
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {isFallback
                ? `${resources.length} selections from last week remain available to read or print while we prepare ${currentLabel}.`
                : postShabbos
                  ? "These Torah sheets remain available to read or print."
                  : resources.length > 0
                    ? `${resources.length} selections for the Shabbos table. New editions every Thursday.`
                    : "New Divrei Torah are prepared for your Shabbos table every Thursday."}
            </p>
            {heroDateLine && !isFallback && (
              <p className="mt-1 text-xs text-muted-foreground">{heroDateLine}</p>
            )}
            <Button onClick={browseAllSelections} className="mt-4 h-auto min-h-11 max-w-full whitespace-normal rounded-full px-6 py-3 font-serif text-base font-semibold">
              {isFallback ? `Browse All ${resources.length} Available Selections` : `Browse All ${resources.length} This Week’s Selections`}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">Divrei Torah in Hebrew — Coming Soon</p>
          </div>
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
        {!isFallback && !isCurrentYomKippur && (
          <section aria-labelledby="parsha-detective-launch-heading" className="rounded-2xl border-2 border-accent/60 bg-card/70 px-4 py-5 text-center shadow-sm sm:px-7 sm:py-6">
            <p className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-accent-readable">New Torah For The Table Series</p>
            <h2 id="parsha-detective-launch-heading" className="mt-1 font-serif text-2xl font-bold text-primary sm:text-3xl">The Parsha Detective</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Investigate the clues, explore the mefarshim, and solve Torah mysteries from this week’s parsha together at the Shabbos table.
            </p>
            {parshaDetective ? (
              <a
                href={pdfActionHrefs(parshaDetective.id).open}
                target="_blank"
                rel="nofollow noopener noreferrer"
                onClick={(event) => recordPdfAction(event, "open_pdf", pdfActionHrefs(parshaDetective.id).open, {
                  publicationId: parshaDetective.id,
                  publicationName: displayPublicationName(parshaDetective),
                  publicationTitle: displayTitle(parshaDetective),
                  publicationSeries: parshaDetective.publication,
                  publisher: parshaDetective.publisher,
                  parsha: parshaDetective.parsha_key ?? displayedParshaKey,
                }, "banner")}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-2.5 font-serif text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                See This Week’s Case →
              </a>
            ) : (
              <p className="mt-4 text-sm font-semibold text-primary">This week’s case is being added to the collection.</p>
            )}
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


        {starterCardCount > 0 && !isCurrentYomKippur && (
          <section id={showCompleteCollection ? undefined : "this-weeks-collection"} tabIndex={-1} aria-labelledby="starter-selections-heading" className="scroll-mt-24 rounded-2xl border-2 border-accent/50 bg-card/50 px-4 py-5 sm:px-6">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-readable sm:text-xs">
              Home of the original Torah For The Table series
            </p>
            <h2 id="starter-selections-heading" className="mt-1 font-serif text-xl font-bold text-primary sm:text-2xl">
              {starterShowsAllOriginals ? "Our Originals" : "Start here — ready to read or print"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {starterShowsAllOriginals
                ? "Our own weekly publications, ready to read or print, alongside selections from respected Torah publishers."
                : "Open any PDF to read or print. No account is needed."}
            </p>
            <div className={`mt-4 grid gap-3 ${starterCardCount >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
              {starterSelections.map(({ key, label, resource: r }, index) => (
                <article key={r.id} ref={index === 0 ? originalsRef : undefined} className="flex min-w-0 flex-col rounded-xl border border-accent/30 bg-background p-4">
                  <div className="flex min-w-0 gap-3">
                  {r.thumb_url && (
                    <StarterThumb
                      smallSrc={r.small_thumb_url}
                      src={r.thumb_url}
                      alt={`First page of ${displayTitle(r)}`}
                      title={displayTitle(r)}
                      href={pdfActionHrefs(r.id).open}
                      onOpen={(event) => {
                        recordPdfAction(event, "open_pdf", pdfActionHrefs(r.id).open, {
                          publicationId: r.id,
                          publicationName: displayPublicationName(r),
                          publicationTitle: displayTitle(r),
                          publicationSeries: r.publication,
                          publisher: r.publisher,
                          parsha: r.parsha_key ?? displayedParshaKey,
                        }, "thumbnail");
                        trackFp("recommendation_click", {
                          publication_id: r.id,
                          publication_title: r.title,
                          parsha: r.parsha_key ?? displayedParshaKey,
                          metadata: { chooser: key, placement: "homepage_start_here" },
                        });
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {!isTfttOriginal(r) && <p className="text-xs font-semibold uppercase tracking-wide text-accent-readable">{label}</p>}
                    {isTfttOriginal(r) && (
                      <span className="rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                        TFTT Original
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-serif text-base font-bold leading-snug text-primary">
                    <Link to="/view/$id" params={{ id: r.id }} onClick={() => trackFp("recommendation_click", { publication_id: r.id, publication_title: r.title, parsha: r.parsha_key ?? displayedParshaKey, metadata: { chooser: key, placement: "homepage_start_here" } })} className="hover:text-accent hover:underline">
                      {displayTitle(r)}
                      {r.publication_id === PARSHA_DETECTIVE_PUBLICATION_ID && (
                        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle font-sans text-[10px] font-bold uppercase tracking-wide text-accent-foreground">New</span>
                      )}
                    </Link>
                  </h3>
                  <PublicationQuickFacts
                    audience={audienceLabel(normalizeAudience(r.audience, displayTitle(r))) ?? r.audience}
                    format={resourceContentType(r)}
                    length={pageCountLabel(r)}
                  />
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {tfttOriginalSeriesById(r.publication_id)?.shortDescription ?? leadWithPublicationTitle(displayTitle(r), chooseReason(r))}
                  </p>
                  </div>
                  </div>
                  <div className="mt-auto pt-4">
                    <DownloadAndPrintButtons
                      href={`/view/${r.id}/pdf`}
                      publicationId={r.id}
                      publicationName={displayPublicationName(r)}
                      publicationTitle={displayTitle(r)}
                      publisher={r.publisher}
                      publicationSeries={r.publication}
                      parsha={r.parsha_key ?? displayedParshaKey}
                      className="w-full"
                      onClick={() => trackFp("recommendation_click", {
                        publication_id: r.id,
                        publication_title: r.title,
                        parsha: r.parsha_key ?? displayedParshaKey,
                        metadata: { chooser: key, placement: "homepage_start_here" },
                      })}
                    />
                  </div>
                </article>
              ))}
              {showDetectivePlaceholder && (
                <article className="flex min-w-0 flex-col rounded-xl border border-accent/30 bg-background p-4">
                  <div className="flex min-w-0 gap-3">
                    <div
                      role="img"
                      aria-label="The Parsha Detective"
                      className="flex h-[83px] w-16 shrink-0 items-center justify-center rounded-sm border border-accent/40 bg-accent/10 text-primary shadow-sm"
                    >
                      <FileText className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                          TFTT Original
                        </span>
                        <span className="rounded-full bg-accent px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
                          New
                        </span>
                      </div>
                      <h3 className="mt-2 font-serif text-base font-bold leading-snug text-primary">
                        {PARSHA_DETECTIVE_SERIES_COPY.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {PARSHA_DETECTIVE_SERIES_COPY.shortDescription}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto pt-4">
                    <Link
                      to="/originals"
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-accent/50 bg-background px-4 py-2.5 font-serif text-sm font-semibold text-primary hover:bg-accent/10"
                    >
                      About The Parsha Detective →
                    </Link>
                    <p className="mt-2 text-center text-xs text-muted-foreground">This week’s case is being added.</p>
                  </div>
                </article>
              )}
            </div>
            {resources.length > starterSelections.length && (
              <Button onClick={browseAllSelections} className="mt-4 h-auto min-h-11 whitespace-normal rounded-full px-5 py-2.5 font-serif text-sm font-semibold">
                {viewAllLabel}
              </Button>
            )}
          </section>
        )}

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

        {(resources.length === 0 || showCompleteCollection) && (
        <section id="this-weeks-collection" tabIndex={-1} className="scroll-mt-24">
          <div className="px-1 sm:px-2">
            <h2 ref={weeklyHeadingRef} className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
              {isCurrentYomKippur
                ? "Yom Kippur Divrei Torah and preparation"
                : isFallback
                  ? `${displayedLabel} — Browse All ${resources.length} Selections`
                  : "All This Week's Selections"}
            </h2>
            {!isCurrentYomKippur && (
              <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
                Our weekly originals and selections from respected Torah publishers. Choose a title and tap Read Now to open its PDF — no account needed.
              </p>
            )}
        {resources.length >= 6 && (
          <section aria-labelledby="mobile-quick-choices" className="sm:hidden">
            <h2 id="mobile-quick-choices" className="sr-only">Choose what fits your table</h2>
            <p className="mb-2 text-xs text-muted-foreground">Choose a category, or browse every selection below.</p>
            <div className="grid grid-cols-2 gap-2">
              {quickChoices.map((choice) => {
                const active = mobileQuickChoice === choice.key;
                return (
                  <button
                    key={choice.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedChooser(null);
                      setActiveChooser(null);
                      setAudienceFilter("All");
                      setContentTypeFilter("All");
                      setLengthFilter("All");
                      setPublicationFilter("All");
                      setMobileQuickChoice(active ? null : choice.key);
                      setShowAllResources(true);
                      setFiltersOpen(false);
                      trackFp("filter_change", {
                        metadata: { filter: "mobile_quick_choice", value: active ? "All" : choice.key },
                      });
                      window.requestAnimationFrame(() => {
                        document.getElementById("weekly-publication-list")?.scrollIntoView?.({
                          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                            ? "auto"
                            : "smooth",
                          block: "start",
                        });
                      });
                    }}
                    className={`min-h-11 min-w-0 rounded-lg border px-3 py-2.5 font-serif text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
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
          </section>
        )}

            {featuredPicks.length > 0 && starterSelections.length === 0 && !activeChooser && (
              <p className="mt-5 text-center font-sans text-sm text-muted-foreground">
                Start with four curated choices, or choose what fits your table.
              </p>
            )}

            <>
            {featuredPicks.length > 0 && starterSelections.length === 0 && (
              <>
                <section className="parchment-frame">
                  <div className="parchment-panel">
                    <p className="text-center font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-accent-readable sm:text-xs">
                      <span aria-hidden="true">★</span> Featured
                    </p>
                    <h2 className="mt-1 font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
                      {isFallback ? `${displayedLabel} Recommended Picks` : "This Week's Recommended Picks"}
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
                            <span className="self-start rounded-full bg-accent px-3 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-accent-foreground">
                              {label}
                            </span>
                            {r.thumb_url && (
                              <div className="mt-3">
                                {originalCover(r)}
                              </div>
                            )}
                            <h3 className="mt-3 font-serif text-base sm:text-xl font-bold text-primary leading-snug">
                              <Link to="/view/$id" params={{ id: r.id }} className="hover:text-accent hover:underline transition-colors duration-150">
                                {displayTitle(r)}
                              </Link>
                            </h3>
                            {r.publisher && <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">By {r.publisher}</p>}
                            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{leadWithPublicationTitle(displayTitle(r), r.subtitle || chooseReason(r))}</p>
                            {pageCountLabel(r) && (
                              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {pageCountLabel(r)}
                              </p>
                            )}
                            <div className="mt-auto pt-4">
                              <DownloadAndPrintButtons
                                href={`/view/${r.id}/pdf`}
                                publicationId={r.id}
                                publicationName={displayPublicationName(r)}
                                publicationTitle={r.title}
                                publisher={r.publisher}
                                publicationSeries={r.publication}
                                parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
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

                <MobileCollectionControlsBar
                  anchorId="filters"
                  count={filteredResources.length}
                  activeFilterCount={activeFilterCount}
                  onOpenFilters={() => setFiltersOpen(true)}
                />
                <div id="filters" className="mt-5 sticky top-14 z-30 -mx-3 bg-background/95 px-3 py-3 backdrop-blur border-y border-accent/20 sm:static sm:z-auto sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-sm scroll-mt-24">
                  <div className="flex items-center justify-between gap-3 sm:hidden">
                    <button
                      type="button"
                      aria-expanded={filtersOpen}
                      onClick={() => setFiltersOpen((open) => !open)}
                      className="min-h-11 flex-1 rounded-full border border-accent/45 bg-background px-4 py-2 text-left font-serif text-sm font-semibold text-primary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Filter {filteredResources.length} available selections{activeFilterCount > 0 ? ` · ${activeFilterCount} active` : ""}
                    </button>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex min-h-11 items-center text-xs font-serif text-accent-readable hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        Clear
                      </button>
                    )}
                  </div>


                  <div className={`${filtersOpen ? "block" : "hidden"} mt-3 space-y-3 sm:mt-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:items-start sm:gap-4 sm:space-y-0`}>
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
                        <span className="block text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By audience</span>
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
                                    setSelectedChooser(null);
                                    setMobileQuickChoice(null);
                                    const next = active ? "All" : audience;
                                    setAudienceFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "audience", value: next } });
                                  }}
                                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ${
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
                        <span className="block text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By length</span>
                        <div className="mt-1.5 flex flex-wrap justify-start gap-2">
                          {(() => {
                            const options = LENGTH_OPTIONS.map((option) => ({ ...option,
                              count: lengthScoped.filter((r) => matchesPageLength(r.page_count, option.key)).length,
                            })).filter((o) => o.key === "All" || o.count > 0);
                            return options.map((o) => {
                              const active = lengthFilter === o.key;
                              return (
                                <button
                                  key={o.key}
                                  type="button"
                                  aria-pressed={active}
                                  aria-label={`Filter by length: ${o.label}`}
                                  onClick={() => {
                                    setSelectedChooser(null);
                                    setMobileQuickChoice(null);
                                    const next = active ? "All" : o.key;
                                    setLengthFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "length", value: next } });
                                  }}
                                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ${
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

                    {publicationOptions.length > 0 && (
                      <div>
                        <label htmlFor="weekly-publication-filter" className="block text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">By publication / author</label>
                        <select
                          id="weekly-publication-filter"
                          value={publicationFilter}
                          onChange={(e) => {
                            setSelectedChooser(null);
                            setMobileQuickChoice(null);
                            setPublicationFilter(e.target.value);
                            trackFp("filter_change", { metadata: { filter: "publication", value: e.target.value } });
                          }}
                          className="mt-1.5 w-full min-h-11 rounded-lg border border-accent/45 bg-background/70 px-3 py-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                                    setSelectedChooser(null);
                                    setMobileQuickChoice(null);
                                    const next = active ? "All" : o.key;
                                    setContentTypeFilter(next);
                                    trackFp("filter_change", { metadata: { filter: "content_type", value: next } });
                                  }}
                                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 ${
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

                  </>
                )}

                <div id="weekly-publication-list" className="mt-5 scroll-mt-24 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4">
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
                        {r.thumb_url ? originalCover(r) : (
                          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg bg-accent/12 text-primary shrink-0">
                            <FileText className="h-5 w-5" aria-hidden="true" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="min-w-0 flex-1 break-words font-serif text-base font-bold leading-snug text-primary sm:text-xl">
                              <Link to="/view/$id" params={{ id: r.id }} className="hover:text-accent hover:underline transition-colors duration-150">
                                {displayTitle(r)}
                              </Link>
                            </h3>
                            {(isTfttOriginal(r) || r.badge) && (
                              <span className="shrink-0 rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-primary">
                                {isTfttOriginal(r) ? "TFTT Original" : r.badge}
                              </span>
                            )}
                          </div>
                          {r.publisher && <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">By {r.publisher}</p>}
                          <PublicationQuickFacts
                            audience={audienceLabel(normalizeAudience(r.audience, displayTitle(r))) ?? r.audience}
                            format={resourceContentType(r)}
                            length={pageCountLabel(r)}
                          />
                          {(() => {
                            const summary = r.summary_quick || r.subtitle || r.description;
                            return summary ? (
                              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{leadWithPublicationTitle(displayTitle(r), summary)}</p>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      <div className="mt-auto pt-4">
                        <DownloadAndPrintButtons
                          href={`/view/${r.id}/pdf`}
                          publicationId={r.id}
                          publicationName={displayPublicationName(r)}
                          publicationTitle={r.title}
                          publisher={r.publisher}
                          publicationSeries={r.publication}
                          parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
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
            ) : null}
            </>

          </div>
        </section>
        )}

        <HomepageShare onWhatsApp={() => {
          trackEvent("share_whatsapp", { parsha: displayedParshaKey ?? displayedLabel, count: resources.length });
          trackFp("share_click", { metadata: { placement: "homepage_veahavta", share_method: "whatsapp" } });
        }} />

            <HiddenGemTeaser
              context={{ normalizedCollectionKey, activeParshaKey: currentParshaKey, isFallback, isYomTov: isYomTovCollection, readingDate }}
              initialNow={loaderData.renderedAt ?? Date.now()}
            />

        <section aria-label="Stay connected" className="mx-auto max-w-2xl">
          <WeeklyEmailSignup
            sourceId="homepage"
            heading="Receive the Weekly Shabbos Collection"
            description="A weekly email when the new collection is ready, featuring Parsha Challenge, Stories for the Shabbos Table, In the Margins, The Parsha Detective, and other Divrei Torah. Read or print before Shabbos."
          />
        </section>

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
                Explore the {formatReadingLabel(displayedParshaKey)} archive and revisit earlier Divrei Torah.
              </p>
              <Link
                to="/parsha/$slug"
                params={{ slug: readingSlug(displayedParshaKey) }}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-accent/45 bg-background px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                View {formatReadingLabel(displayedParshaKey)} Editions
              </Link>
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

        <SiteFooter />
      </div>
      <BackToTop collectionId={showCompleteCollection ? "this-weeks-collection" : "starter-selections-heading"} />
    </div>
  );
}
