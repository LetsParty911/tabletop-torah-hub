import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isPostShabbosWindow } from "@/lib/post-shabbos";
import { FileText, Share2 } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { WhatsNewBanner } from "@/components/WhatsNewBanner";
import { WhatsNewPopup } from "@/components/WhatsNewPopup";
import { ThursdayProgressMeter } from "@/components/ThursdayProgressMeter";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { SITE_URL } from "@/lib/site-url";

import { BackToTop } from "@/components/BackToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { buildDownloadFilename } from "@/lib/download-filename";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { standardizeCopy } from "@/lib/standardize-copy";
import { publicationLabel } from "@/lib/badges";

import { resolveHebcalParsha, nextParshaAfter, isPastReading } from "@/lib/hebcal";
import {
  listHomepageWeek,
  getParshaOverride,
  getActiveSubscriberCount,
} from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";
import { WeeklyEmailSignup } from "@/components/WeeklyEmailSignup";
import { usePrewarmDownloads } from "@/hooks/use-prewarm-downloads";


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
  /** ISO date of the Shabbos the displayed reading belongs to (Hebcal). */
  readingDate: string | null;
};

async function loadCurrentWeek(): Promise<LoaderData> {
  // Has no dependency on anything below - start it now so it runs
  // concurrently with the parsha/PDF chain instead of adding its own
  // sequential round trip after everything else finishes.
  const subscriberCountPromise = getActiveSubscriberCount().catch((e) => {
    console.error("Failed to load subscriber count", e);
    return { count: 0 };
  });

  let label = "Parshas Hashavua";
  let parshaKey: string | null = null;
  let readingDate: string | null = null;

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

  // 2. Hebcal (Diaspora schedule, 24h cached, static fallback on failure)
  if (!parshaKey) {
    const resolved = await resolveHebcalParsha();
    parshaKey = resolved.parshaKey;
    label = resolved.label;
    readingDate = resolved.readingDate;
  }

  // 3. PDFs with fallback to most recent published collection
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
      fallbackParshaLabel = r.fallbackParshaKey.startsWith("Parshas")
        ? r.fallbackParshaKey
        : `Parshas ${r.fallbackParshaKey}`;
    }
  } catch (e) {
    console.error("Failed to load PDFs", e);
  }

  let subscriberCount: number | null = null;
  const { count } = await subscriberCountPromise;
  if (count >= 25) subscriberCount = count;

  return { label, parshaKey, resources, isFallback, fallbackParshaLabel, fallbackParshaKey, subscriberCount, readingDate };
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
      <Link to="/" className="text-primary underline">Back to home</Link>
    </div>
  ),
  head: ({ loaderData }) => {
    const data = loaderData as LoaderData | undefined;
    // Mirror the page: everything reflects the collection actually displayed.
    const displayedLabel =
      data?.isFallback && data.fallbackParshaLabel
        ? data.fallbackParshaLabel
        : (data?.label ?? "Parshas Hashavua");
    const count = data?.resources.length ?? 0;

    const title = count > 0
      ? `Print Divrei Torah for ${displayedLabel} — Torah for the Table`
      : "Torah for the Table — Weekly Divrei Torah";
    const description = count > 0
      ? `${count} handpicked, print-ready ${count === 1 ? "Dvar" : "Divrei"} Torah for ${displayedLabel} — free downloads for children, families, and adults.`
      : "A weekly collection of Divrei Torah for Shabbos and Yom Tov — thoughtfully gathered in one quiet, uncluttered place for the Shabbos table.";
    const url = "https://torahforthetable.com/";
    const image = count > 0
      ? `https://torahforthetable.com/og/image.png?parsha=${encodeURIComponent(displayedLabel)}&count=${count}`
      : "https://torahforthetable.com/og-image.png";
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

// Audience normalization is shared with the archive page.

const FEATURED_SLOTS = [
  { key: "children", label: "Best for Children" },
  { key: "family", label: "Best for the Family Table" },
  { key: "quickest", label: "Quickest Read" },
  { key: "deeper", label: "Deeper Learning" },
] as const;

function Index() {
  const { label: currentLabel, parshaKey: currentParshaKey, resources, isFallback, fallbackParshaLabel, fallbackParshaKey, subscriberCount, readingDate } =
    Route.useLoaderData() as LoaderData;

  // Everything user-facing (hero copy, counts, share text) derives from the
  // collection actually displayed on the page, not the upcoming parsha.
  const displayedLabel = isFallback && fallbackParshaLabel ? fallbackParshaLabel : currentLabel;
  const displayedParshaKey = isFallback && fallbackParshaKey ? fallbackParshaKey : currentParshaKey;
  // The upcoming reading: when we're showing last week's collection, that's
  // the live parsha; otherwise it's the next one in the reading order.
  const upcomingParsha = isFallback
    ? (currentParshaKey ?? nextParshaAfter(displayedParshaKey))
    : nextParshaAfter(displayedParshaKey);
  // Post-Shabbos framing: client-only so SSR/hydration stays stable.
  const [postShabbos, setPostShabbos] = useState(false);
  useEffect(() => {
    // Hebcal keeps reporting last Shabbos's parsha until it rolls forward, so
    // "showing last week" is either an explicit fallback OR a reading whose
    // Shabbos has already passed in Eastern time.
    const showingLastShabbos = isFallback || isPastReading(readingDate);
    setPostShabbos(showingLastShabbos && resources.length > 0 && isPostShabbosWindow());
  }, [isFallback, resources.length, readingDate]);

  const collectionLabel = postShabbos ? "Last Shabbos's" : "This Week's";

  const [audienceFilter, setAudienceFilter] = useState<"All" | "Children" | "Families" | "Adults">("All");
  const [lengthFilter, setLengthFilter] = useState<"All" | "short" | "long">("All");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("All");

  // Display order comes from the admin checklist sort order (lower number first),
  // which the server already applies when building `resources`.
  const sortedResources = resources;

  // Warm the edge cache for this week's PDFs so the Download click is instant.
  usePrewarmDownloads(sortedResources.map((r) => r.id));

  // Quick Picks: three low-friction starting points drawn from this week's
  // actual collection (never hardcoded), so a first-time visitor isn't
  // immediately faced with the full list of 20+ options.
  const quickPickForKids = sortedResources.find(
    (r) => normalizeAudience(r.audience, r.title) === "Children",
  );
  const quickPickForFamily = sortedResources.find(
    (r) => normalizeAudience(r.audience, r.title) === "Families",
  );
  const quickPickQuickRead = sortedResources
    .filter((r) => typeof r.page_count === "number")
    .sort((a, b) => (a.page_count as number) - (b.page_count as number))[0];
  const quickPicks = [
    quickPickForKids && { label: "For Kids", resource: quickPickForKids },
    quickPickForFamily &&
      quickPickForFamily.id !== quickPickForKids?.id && {
        label: "For the Family",
        resource: quickPickForFamily,
      },
    quickPickQuickRead &&
      quickPickQuickRead.id !== quickPickForKids?.id &&
      quickPickQuickRead.id !== quickPickForFamily?.id && {
        label: "Quick 1–2 Page Read",
        resource: quickPickQuickRead,
      },
  ].filter(Boolean) as { label: string; resource: Resource }[];

  // Each filter is independent so every row's options can respect the others.
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

  const audienceFiltered = sortedResources.filter(
    (r) => matchesLength(r) && matchesContentType(r),
  );
  const lengthScoped = sortedResources.filter(
    (r) => matchesAudience(r) && matchesContentType(r),
  );
  const contentTypeScoped = sortedResources.filter(
    (r) => matchesAudience(r) && matchesLength(r),
  );

  const contentTypeOptions = Array.from(
    new Set(
      sortedResources
        .map((r) => resourceContentType(r))
        .filter((v): v is string => !!v),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const filteredResources = sortedResources.filter(
    (r) => matchesAudience(r) && matchesLength(r) && matchesContentType(r),
  );

  const featuredPicks = FEATURED_SLOTS.map((slot) => ({
    ...slot,
    resource: resources.find(
      (r) => (r.featured_slot ?? "").trim().toLowerCase() === slot.key,
    ),
  })).filter((p) => !!p.resource);

  const pdfParams = (r: Resource) => ({
    file_id: r.id,
    file_title: r.title,
    source_name: r.title,
    parsha: displayedParshaKey ?? undefined,
  });

  const shareText = `${resources.length} free, handpicked Divrei Torah for ${displayedLabel} — ready to download and print: ${SITE_URL}/`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const ShareButton = ({ className }: { className?: string }) => (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent("share_whatsapp", { parsha: displayedParshaKey ?? displayedLabel, count: resources.length })}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-accent bg-transparent px-5 py-2.5 font-serif font-semibold text-primary hover:bg-accent hover:text-accent-foreground transition-colors ${className ?? ""}`}
    >
      <Share2 className="h-4 w-4" />
      Share {collectionLabel} Divrei Torah
    </a>
  );

  return (
    <div className="min-h-screen bg-background">
      <WhatsNewPopup />
      <WhatsNewBanner />
      <AnnouncementBanner />
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-7 md:px-8 md:py-10 space-y-4 sm:space-y-6 md:space-y-8">
        {/* Hero */}
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <p className="font-sans text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-accent-readable sm:text-xs">
              Weekly Divrei Torah
            </p>
            <h1 className="mt-2 font-serif text-[2rem] leading-[1.08] sm:text-4xl md:text-5xl font-bold tracking-tight text-primary">
              {postShabbos ? `Divrei Torah for ${displayedLabel}` : "Free Divrei Torah for Your Shabbos Table"}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl font-serif text-base leading-relaxed text-primary sm:text-lg md:text-xl">
              <span className="font-semibold">{resources.length} {resources.length === 1 ? "selection" : "selections"}</span>{" "}
              {postShabbos ? "still available to download" : `for ${displayedLabel}`}
            </p>

            <div className="mt-5 flex justify-center">
              <a
                href="#this-weeks-collection"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById("this-weeks-collection")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="inline-flex w-full items-center justify-center rounded-full bg-primary px-7 py-3 font-serif font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto"
              >
                Browse {displayedLabel}
              </a>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {upcomingParsha && upcomingParsha !== displayedParshaKey && (
                <span>
                  Next: {upcomingParsha.startsWith("Parshas") ? upcomingParsha : `Parshas ${upcomingParsha}`} {postShabbos ? "updates" : "posts"} Thursday
                </span>
              )}
              <a
                href="#weekly-email-signup"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById("weekly-email-signup")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="font-medium text-primary underline decoration-accent/50 underline-offset-4 transition-colors hover:text-accent"
              >
                Get the Thursday reminder
              </a>
            </div>
          </div>
        </section>

        <ThursdayProgressMeter />

        {featuredPicks.length > 0 && (
          <>
            <section className="parchment-frame">
              <div className="parchment-panel">
                <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
                  This Week's Recommended Picks
                </h2>
                <div className="mt-5 grid gap-4 grid-cols-1 sm:grid-cols-2">
                  {featuredPicks.map(({ key, label, resource }) => {
                    const r = resource!;
                    return (
                      <article
                        key={key}
                        className="h-full rounded-xl border border-accent/50 bg-background/70 p-4 sm:p-5 flex flex-col"
                      >
                        <span className="self-start rounded-full bg-accent px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-accent-foreground">
                          {label}
                        </span>
                        <h3 className="mt-3 font-serif text-base sm:text-xl font-bold text-primary leading-snug">
                          <Link
                            to="/view/$id"
                            params={{ id: r.id }}
                            className="hover:text-accent hover:underline transition-colors duration-150"
                          >
                            {r.title}
                          </Link>
                        </h3>
                        {r.publisher && (
                          <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">
                            By {r.publisher}
                          </p>
                        )}
                        {r.subtitle && (
                          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                            {standardizeCopy(r.subtitle)}
                          </p>
                        )}
                        {typeof r.page_count === "number" && (
                          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {r.page_count} {r.page_count === 1 ? "page" : "pages"}
                          </p>
                        )}
                        <div className="mt-auto pt-4">
                          <DownloadToPrintButton
                            href={`/view/${r.id}/download`}
                            publicationId={r.id}
                            publicationName={publicationLabel(r.publication || r.title) || r.title}
                            publicationTitle={r.title}
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
                          <div className="mt-2 flex justify-center">
                            <SharePublicationButton
                              pdfId={r.id}
                              title={r.title}
                              parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                            />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="gold-divider" aria-hidden><span className="gold-divider-dot" /></div>
          </>
        )}

        {/* Resource collection */}
        <section id="this-weeks-collection" className="scroll-mt-8">
          <div className="px-1 sm:px-2">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
              {postShabbos ? "Still Available to Download" : "This Week's Collection"}
            </h2>

            {isFallback && resources.length > 0 && (
              <div className="mx-auto mt-3 max-w-2xl rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-center">
                <p className="font-serif text-sm sm:text-base text-primary">
                  This week's collection for {currentLabel} is coming soon — enjoy last week's selections below.
                </p>
              </div>
            )}
            {resources.length > 0 && (
              <p className="mt-2 text-center text-sm text-muted-foreground sm:text-base">
                {resources.length} {resources.length === 1 ? "selection" : "selections"} · {displayedLabel}
              </p>
            )}

            {!isFallback && quickPicks.length > 0 && (
              <div className="mt-4 max-w-2xl mx-auto">
                <p className="text-center font-sans text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-accent-readable sm:text-xs">
                  Start here
                </p>
                <div className={`mt-2 grid gap-2.5 ${quickPicks.length === 1 ? "grid-cols-1" : quickPicks.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
                  {quickPicks.map(({ label, resource }) => (
                    <Link
                      key={label}
                      to="/view/$id"
                      params={{ id: resource.id }}
                      className="rounded-xl border border-accent/25 bg-card/30 p-3 text-center transition-colors hover:border-accent/60 hover:bg-card/50"
                    >
                      <p className="font-sans text-[0.62rem] uppercase tracking-[0.14em] text-accent-readable">
                        {label}
                      </p>
                      <p className="mt-1 font-serif text-base font-bold text-primary leading-snug">
                        {resource.title}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {resources.length === 0 ? (
              <p className="mt-6 text-center text-muted-foreground max-w-md mx-auto">
                New Divrei Torah for {currentLabel} go up Thursday. Check back soon!
              </p>
            ) : (
              <>
                <div className="mt-5 space-y-3 sticky top-14 z-30 -mx-3 px-3 py-3 bg-background/95 backdrop-blur border-b border-accent/20 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0">
                  {(audienceFilter !== "All" || lengthFilter !== "All" || contentTypeFilter !== "All") && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setAudienceFilter("All");
                          setLengthFilter("All");
                          setContentTypeFilter("All");
                        }}
                        className="text-xs font-serif text-accent-readable hover:text-primary hover:underline transition-colors"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  <div>
                    <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      By audience
                    </span>
                    <div className="mt-1.5 flex flex-wrap justify-start gap-2">
                      {(["All", "Children", "Families", "Adults"] as const)
                        .map((audience) => ({
                          audience,
                          count:
                            audience === "All"
                              ? audienceFiltered.length
                              : audienceFiltered.filter(
                                  (r) => normalizeAudience(r.audience, r.title) === audience,
                                ).length,
                        }))
                        .filter(({ audience, count }) => audience === "All" || count > 0)
                        .map(({ audience }) => {
                          const active = audienceFilter === audience;
                          return (
                            <button
                              key={audience}
                              type="button"
                              aria-pressed={active}
                              aria-label={`Filter by audience: ${audienceLabel(audience)}`}
                              onClick={() => setAudienceFilter(active ? "All" : audience)}
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

                  <div>
                    <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      By length
                    </span>
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
                              onClick={() => setLengthFilter(active ? "All" : o.key)}
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

                  {contentTypeOptions.length > 0 && (
                    <div>
                      <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        By content type
                      </span>
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
                                onClick={() => setContentTypeFilter(active ? "All" : o.key)}
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

                <div className="mt-5 sm:mt-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                  {filteredResources.map((r, i) => (
                    <>
                      <article
                        key={r.id}
                        className="h-full rounded-xl border border-accent/35 bg-background/55 p-4 sm:p-5 hover:border-accent/70 hover:shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 flex flex-col"
                      >
                        <div className="flex flex-1 items-start gap-3">
                          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg bg-accent/12 text-primary shrink-0">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-serif text-base sm:text-xl font-bold text-primary line-clamp-2 leading-snug min-h-[2.6em] sm:min-h-[2.5em]">
                                <Link
                                  to="/view/$id"
                                  params={{ id: r.id }}
                                  className="hover:text-accent hover:underline transition-colors duration-150"
                                >
                                  {r.title}
                                </Link>
                              </h3>
                              {r.badge && (
                                <span className="shrink-0 rounded-full border border-accent bg-accent/20 px-2 py-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-primary">
                                  {r.badge}
                                </span>
                              )}
                            </div>
                            {r.publisher && (
                              <p className="mt-0.5 text-xs sm:text-sm font-normal text-muted-foreground">
                                By {r.publisher}
                              </p>
                            )}
                            {r.subtitle && (
                              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                {standardizeCopy(r.subtitle)}
                              </p>
                            )}
                            {!r.subtitle && r.description && (
                              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                {standardizeCopy(r.description)}
                              </p>
                            )}
                            {(r.audience || r.format_type || typeof r.page_count === "number") && (
                              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {[
                                  audienceLabel(normalizeAudience(r.audience, r.title)) ?? r.audience,
                                  formatTypeLabel(r.format_type),
                                  typeof r.page_count === "number"
                                    ? `${r.page_count} ${r.page_count === 1 ? "page" : "pages"}`
                                    : null,
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
                            publicationName={publicationLabel(r.publication || r.title) || r.title}
                            publicationTitle={r.title}
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
                          <div className="mt-2 flex justify-center">
                            <SharePublicationButton
                              pdfId={r.id}
                              title={r.title}
                              parsha={(r as { parsha_key?: string | null }).parsha_key ?? displayedParshaKey}
                            />
                          </div>
                        </div>
                      </article>
                      {i === (filteredResources.length > 1 ? 1 : 0) && (
                        <div key="share-prompt" className="col-span-1 sm:col-span-2 flex justify-center py-2">
                          <ShareButton />
                        </div>
                      )}
                    </>
                  ))}
                </div>

                {filteredResources.length === 0 && (
                  <p className="mt-8 text-center text-muted-foreground max-w-md mx-auto">
                    No Divrei Torah match this combination of filters — try clearing one.
                  </p>
                )}
              </>
            )}
            <p className="mt-7 mx-auto max-w-2xl px-2 text-center text-xs sm:text-sm text-muted-foreground/80 leading-relaxed">
              Torah For The Table is a 501(c)(3) nonprofit organization providing free, carefully
              selected Torah resources for children, families, and adults. Each week, we make
              meaningful Divrei Torah, Parsha questions, and original educational content easy to
              find, print, and share at the Shabbos table.{" "}
              <Link to="/about" className="text-accent hover:text-primary underline">
                Our mission and programs
              </Link>
            </p>
          </div>
        </section>

        <div className="gold-divider" aria-hidden><span className="gold-divider-dot" /></div>

        {/* Email signup */}
        <WeeklyEmailSignup sourceId="homepage" />

        <div className="gold-divider" aria-hidden><span className="gold-divider-dot" /></div>

        {/* Memorial */}
        <section className="parchment-frame max-w-2xl mx-auto">
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
              dir="rtl"
              lang="he"
              className="mt-5 font-serif font-semibold text-primary"
              style={{ fontSize: "1.25rem", letterSpacing: "0.04em" }}
            >
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
