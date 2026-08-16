import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Share2 } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { WhatsNewBanner } from "@/components/WhatsNewBanner";
import { WhatsNewPopup } from "@/components/WhatsNewPopup";
import { UpdateCountdown } from "@/components/UpdateCountdown";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { SITE_URL } from "@/lib/site-url";

import { BackToTop } from "@/components/BackToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { buildDownloadFilename } from "@/lib/download-filename";
import { normalizeAudience } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { standardizeCopy } from "@/lib/standardize-copy";

import { resolveHebcalParsha, nextParshaAfter } from "@/lib/hebcal";
import {
  listHomepageWeek,
  getParshaOverride,
  getActiveSubscriberCount,
} from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";
import { WeeklyEmailSignup } from "@/components/WeeklyEmailSignup";



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

  // 2. Hebcal (Diaspora schedule, 24h cached, static fallback on failure)
  if (!parshaKey) {
    const resolved = await resolveHebcalParsha();
    parshaKey = resolved.parshaKey;
    label = resolved.label;
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
  try {
    const { count } = await getActiveSubscriberCount();
    if (count >= 25) subscriberCount = count;
  } catch (e) {
    console.error("Failed to load subscriber count", e);
  }

  return { label, parshaKey, resources, isFallback, fallbackParshaLabel, fallbackParshaKey, subscriberCount };
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
      <Link to="/archive" search={{ year: "all", parsha: "all", audience: "All", q: "" }} className="text-primary underline">Browse archive</Link>
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
  const { label: currentLabel, parshaKey: currentParshaKey, resources, isFallback, fallbackParshaLabel, fallbackParshaKey, subscriberCount } =
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
  const [audienceFilter, setAudienceFilter] = useState<"All" | "Children" | "Families" | "Adults">("All");

  const [lengthFilter, setLengthFilter] = useState<"All" | "short" | "long">("All");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("All");

  // Display order comes from the admin checklist sort order (lower number first),
  // which the server already applies when building `resources`.
  const sortedResources = resources;


  // Each filter is independent so every row's counts can respect the others.
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
      className={`inline-flex items-center justify-center gap-2 rounded-full border-2 border-accent bg-transparent px-6 py-3 font-serif font-semibold text-primary hover:bg-accent hover:text-accent-foreground transition-colors ${className ?? ""}`}
    >
      <Share2 className="h-4 w-4" />
      Share This Week's Divrei Torah
    </a>
  );


  return (
    <div className="min-h-screen bg-background">
      <WhatsNewPopup />
      <WhatsNewBanner />
      <AnnouncementBanner />
      <UpdateCountdown
        contentLive={!isFallback && resources.length > 0}
        liveParshaLabel={displayedLabel}
      />
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-14 space-y-5 sm:space-y-8 md:space-y-10">
        {/* Hero */}
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-[2.25rem] leading-[1.05] sm:text-5xl md:text-6xl font-bold tracking-tight text-primary">
              Free Divrei Torah for Your Shabbos Table
            </h1>
            <p className="mt-4 sm:mt-6 font-serif text-lg sm:text-xl md:text-2xl text-primary max-w-2xl mx-auto leading-[1.35]">
              <span className="inline-block align-baseline text-2xl sm:text-3xl md:text-4xl font-bold text-primary">
                {resources.length}
              </span>{" "}
              handpicked, print-ready selections for {displayedLabel} — for children, families, and adults.
            </p>
            {upcomingParsha && upcomingParsha !== displayedParshaKey && (
              <p className="mt-2 font-serif italic text-sm sm:text-base text-accent">
                {upcomingParsha.startsWith("Parshas") ? upcomingParsha : `Parshas ${upcomingParsha}`} posts Thursday.
              </p>
            )}
            <div className="mt-6 sm:mt-8 flex flex-col items-center gap-3 sm:gap-4">
              <div className="flex w-full flex-col items-center justify-center gap-3 sm:gap-4 md:flex-row">
                <a
                  href="#this-weeks-collection"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("this-weeks-collection")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 font-serif font-semibold text-primary-foreground shadow-md transition-colors hover:bg-accent hover:text-accent-foreground md:w-auto"
                >
                  Browse This Week's Collection
                </a>
                <div className="flex w-full flex-col items-center gap-1 md:w-auto">
                  <a
                    href="#weekly-email-signup"
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById("weekly-email-signup")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="inline-flex w-full items-center justify-center rounded-full border-2 border-accent bg-transparent px-6 py-3 font-serif font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground md:w-auto"
                  >
                    Remind Me Weekly
                  </a>
                  <p className="font-serif text-sm italic text-accent sm:text-base md:hidden">
                    One email every Thursday when the new collection posts.
                  </p>
                </div>
              </div>
              <p className="hidden font-serif text-base italic text-accent text-center md:block">
                One email every Thursday when the new collection posts.
              </p>
            </div>
          </div>
        </section>


        {featuredPicks.length > 0 && (
          <>
            <section className="parchment-frame">
              <div className="parchment-panel">
                <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
                  This Week's Recommended Picks
                </h2>
                <div className="mt-6 grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2">
                  {featuredPicks.map(({ key, label, resource }) => {
                    const r = resource!;
                    return (
                      <article
                        key={key}
                        className="h-full rounded-2xl border-2 border-accent bg-background/70 p-4 sm:p-5 flex flex-col"
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
        <section id="this-weeks-collection" className="parchment-frame scroll-mt-8">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-5xl font-bold text-primary text-center">
              This Week's Collection
            </h2>
            {isFallback && resources.length > 0 && (
              <div className="mt-4 rounded-xl border-2 border-accent/60 bg-accent/10 px-4 py-3 text-center">
                <p className="font-serif italic text-sm sm:text-base text-primary">
                  This week's collection for {currentLabel} is coming soon — enjoy last week's selections below.
                </p>
              </div>
            )}
            {!isFallback && resources.length > 0 && (
              <p className="mt-2 text-center font-sans text-[0.65rem] sm:text-xs uppercase tracking-[0.2em] text-accent">
                {currentLabel} · New collections weekly
              </p>
            )}
            {resources.length > 0 && (
              <>
                <p className="mt-2 text-center font-serif italic text-sm sm:text-base text-accent">
                  <span className="inline-block align-baseline text-base sm:text-lg md:text-xl font-bold text-primary">
                    {resources.length}
                  </span>{" "}
                  {resources.length === 1 ? "Dvar" : "Divrei"} Torah{isFallback && fallbackParshaLabel ? ` · ${fallbackParshaLabel}` : " this week"}
                </p>
                <div className="mt-3 flex justify-center">
                  <ShareButton />
                </div>
              </>
            )}

            {resources.length === 0 ? (
              <p className="mt-8 text-center text-muted-foreground max-w-md mx-auto">
                New Divrei Torah for {currentLabel} go up Thursday. Check back soon!
              </p>
            ) : (
              <>
                <div className="mt-5 sm:mt-6 space-y-4 sticky top-14 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b border-accent/20 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0">
                  {(audienceFilter !== "All" || lengthFilter !== "All" || contentTypeFilter !== "All") && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setAudienceFilter("All");
                          setLengthFilter("All");
                          setContentTypeFilter("All");
                        }}
                        className="text-xs font-serif italic text-accent hover:text-primary hover:underline transition-colors"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  <div>
                    <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      By audience
                    </span>
                    <div className="mt-2 flex flex-wrap justify-start gap-2">
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
                        .map(({ audience, count }) => {
                          const active = audienceFilter === audience;
                          return (
                            <button
                              key={audience}
                              type="button"
                              aria-pressed={active}
                              aria-label={`Filter by audience: ${audience}, ${count} ${count === 1 ? "publication" : "publications"}`}
                              onClick={() => setAudienceFilter(active ? "All" : audience)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer ${
                                active
                                  ? "border-accent bg-accent text-accent-foreground shadow-sm"
                                  : "border-accent/60 bg-background/70 text-primary hover:border-accent hover:bg-accent/15 hover:shadow-sm active:bg-accent/20 active:border-accent"
                              }`}
                            >
                              {audience}
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none tabular-nums ${
                                  active
                                    ? "bg-accent-foreground/20 text-accent-foreground"
                                    : "bg-accent/15 text-accent"
                                }`}
                              >
                                {count}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  <div>
                    <span className="block text-left text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      By length
                    </span>
                    <div className="mt-2 flex flex-wrap justify-start gap-2">
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
                              aria-label={`Filter by length: ${o.label}, ${o.count} ${o.count === 1 ? "publication" : "publications"}`}
                              onClick={() => setLengthFilter(active ? "All" : o.key)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer ${
                                active
                                  ? "border-accent bg-accent text-accent-foreground shadow-sm"
                                  : "border-accent/60 bg-background/70 text-primary hover:border-accent hover:bg-accent/15 hover:shadow-sm active:bg-accent/20 active:border-accent"
                              }`}
                            >
                              {o.label}
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none tabular-nums ${
                                  active
                                    ? "bg-accent-foreground/20 text-accent-foreground"
                                    : "bg-accent/15 text-accent"
                                }`}
                              >
                                {o.count}
                              </span>
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
                      <div className="mt-2 flex flex-wrap justify-start gap-2">
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
                                aria-label={`Filter by content type: ${o.label}, ${o.count} ${o.count === 1 ? "publication" : "publications"}`}
                                onClick={() => setContentTypeFilter(active ? "All" : o.key)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 cursor-pointer ${
                                  active
                                    ? "border-accent bg-accent text-accent-foreground shadow-sm"
                                    : "border-accent/60 bg-background/70 text-primary hover:border-accent hover:bg-accent/15 hover:shadow-sm active:bg-accent/20 active:border-accent"
                                }`}
                              >
                                {o.label}
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none tabular-nums ${
                                    active
                                      ? "bg-accent-foreground/20 text-accent-foreground"
                                      : "bg-accent/15 text-accent"
                                  }`}
                                >
                                  {o.count}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>




                <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2">
                  {filteredResources.map((r) => (
                    <article
                      key={r.id}
                      className="h-full rounded-2xl border-2 border-accent/40 bg-background/60 p-4 sm:p-5 hover:border-accent hover:shadow-md transition-[color,background-color,border-color,box-shadow] duration-150 flex flex-col"
                    >
                      <div className="flex flex-1 items-start gap-3">

                        <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-accent/15 text-primary shrink-0">
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
                          {r.description && (
                            <p className="mt-2 text-sm text-foreground/85 leading-snug">
                              {standardizeCopy(r.description)}
                            </p>
                          )}
                          {(r.audience || r.format_type || typeof r.page_count === "number") && (
                            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {[
                                normalizeAudience(r.audience, r.title) ?? r.audience,
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
                  ))}
                </div>

                {filteredResources.length === 0 && (
                  <p className="mt-8 text-center text-muted-foreground max-w-md mx-auto">
                    No Divrei Torah match this combination of filters — try clearing one.
                  </p>
                )}
              </>
            )}
            {true && resources.length > 0 && (
              <div className="mt-6 sm:mt-8 text-center">
                <Link
                  to="/archive"
                  search={{ year: "all", parsha: "all", audience: "All", q: "" }}
                  className="inline-flex items-center gap-1.5 font-serif italic text-sm sm:text-base text-accent hover:text-primary transition-colors"
                >
                  Browse Archive →
                </Link>
              </div>
            )}
            {resources.length > 0 && (
              <div className="mt-5 flex justify-center">
                <ShareButton />
              </div>
            )}
            <p className="mt-8 mx-auto max-w-2xl px-2 text-center text-xs sm:text-sm text-muted-foreground/80 leading-relaxed">
              Torah For The Table is a 501(c)(3) nonprofit organization providing free, carefully
              selected Torah resources for children, families, and adults. Each week, we make
              meaningful Divrei Torah, Parsha questions, and original educational content easy to
              find, print, and share at the Shabbos table.{" "}
              <Link to="/mission" className="text-accent hover:text-primary underline">
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
