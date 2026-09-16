import { standardizeCopy } from "@/lib/standardize-copy";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

import { ArrowLeft } from "lucide-react";
import { getPdfById, getParshaOverride } from "@/integrations/supabase/api.functions";
import { getItemPublicationContext } from "@/integrations/supabase/item-page.functions";
import { resolveHebcalParsha } from "@/lib/hebcal";
import { toParshaComparableKey } from "@/lib/parsha-normalize";
import { trackEvent } from "@/lib/analytics";
import { trackFp } from "@/lib/first-party-analytics";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { formatReadingLabel } from "@/lib/parshiyos";
import { buildDownloadFilename } from "@/lib/download-filename";
import { publicationLabel } from "@/lib/badges";
import { DownloadToPrintButton, trackDownloadAction } from "@/components/DownloadToPrintButton";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { WeeklyEmailSignup } from "@/components/WeeklyEmailSignup";
import { SiteFooter } from "@/components/SiteFooter";
import { usePrewarmDownloads } from "@/hooks/use-prewarm-downloads";

export const Route = createFileRoute("/view/$id")({
  loader: async ({ params }) => {
    const [r, publicationContext] = await Promise.all([
      getPdfById({ data: { id: params.id } }),
      getItemPublicationContext({ data: { id: params.id } }),
    ]);
    if (!r.pdf) throw notFound();

    // Determine whether this publication belongs to the live week, so the
    // "back" link never claims an archived piece is part of "this week's
    // collection" (see homepage/short-vorts for the same live-parsha logic).
    let isCurrentWeek = false;
    try {
      let liveKey: string | null = null;
      const o = await getParshaOverride();
      if (o.override && o.isActive) liveKey = o.override;
      if (!liveKey) {
        const resolved = await resolveHebcalParsha();
        liveKey = resolved.parshaKey;
      }
      const pdfKey = (r.pdf.parsha_key ?? "").trim();
      if (liveKey && pdfKey) {
        isCurrentWeek = toParshaComparableKey(liveKey) === toParshaComparableKey(pdfKey);
      }
    } catch {
      // ignore — default to archived-style link, which is always accurate
    }

    return { pdf: r.pdf, isCurrentWeek, publicationContext };
  },
  head: ({ loaderData, params }) => {
    const title = loaderData?.pdf?.title ?? "View PDF";
    const subtitle = loaderData?.pdf?.subtitle;

    // Parsha comes from the record; never hardcoded, never an empty "Parshas " stub.
    const rawParsha = (loaderData?.pdf?.parsha_key ?? "").trim();
    const parshaLabel = rawParsha
      ? formatReadingLabel(rawParsha.replace(/^(parshas|parashat)\s+/i, "").trim())
      : null;

    // Share cards lead with the publication + parsha; the tab title adds the site name.
    const shareTitle = parshaLabel ? `${title} — ${parshaLabel}` : title;
    const pageTitle = `${shareTitle} | Torah for the Table`;

    // Trim to 160 chars at a word boundary so crawlers get a clean sentence.
    const clamp = (v: string) => {
      if (v.length <= 160) return v;
      const cut = v.slice(0, 159);
      const space = cut.lastIndexOf(" ");
      return `${(space > 100 ? cut.slice(0, space) : cut).trimEnd()}…`;
    };
    const description = clamp(
      loaderData?.pdf?.description?.trim() ||
        subtitle?.trim() ||
        (parshaLabel
          ? `A printable Dvar Torah for ${parshaLabel}, free from Torah for the Table.`
          : "A printable Dvar Torah, free from Torah for the Table."),
    );

    const url = `https://torahforthetable.com/view/${params.id}`;
    const ogParams = new URLSearchParams({ title });
    if (rawParsha) ogParams.set("parsha", rawParsha);
    const image = `https://torahforthetable.com/og/image.png?${ogParams.toString()}`;

    // Best available publish/update dates, safely normalized to ISO strings.
    const toIso = (v: string | null | undefined): string | null => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const datePublished = toIso(loaderData?.pdf?.weekOf) ?? toIso(loaderData?.pdf?.createdAt);
    const dateModified = toIso(loaderData?.pdf?.updatedAt);

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: parshaLabel ? `${title} — ${parshaLabel}` : title,
      name: title,
      description,
      url,
      image,
      isPartOf: "https://torahforthetable.com",
      publisher: {
        "@type": "Organization",
        name: "Torah for the Table",
        url: "https://torahforthetable.com",
        logo: "https://torahforthetable.com/favicon.png",
      },
    };
    if (parshaLabel) jsonLd.about = { "@type": "Thing", name: parshaLabel };
    if (datePublished) jsonLd.datePublished = datePublished;
    if (dateModified) jsonLd.dateModified = dateModified;

    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:title", content: shareTitle },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: shareTitle },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: shareTitle },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(jsonLd),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-serif text-3xl text-primary">Resource Not Found</h1>
      <p className="text-muted-foreground">This PDF is unavailable or unpublished.</p>
      <Link to="/" className="text-accent underline">
        Back to Home
      </Link>
    </div>
  ),
  component: ViewPdf,
});

function ViewPdf() {
  const { pdf, isCurrentWeek, publicationContext } = Route.useLoaderData();
  const publication = publicationContext.publication;
  const related = publicationContext.related;
  const viewerSrc = `/view/${pdf.id}/pdf#toolbar=1&navpanes=0&view=FitH`;
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const pdfOpenTrackedRef = useRef<string | null>(null);
  useEffect(() => setMounted(true), []);

  // Mobile/tablet can't embed the PDF (no iframe onLoad), so record the
  // canonical pdf_open on page load instead — otherwise phone visits never
  // count as PDF access in the analytics dashboards.
  useEffect(() => {
    if (mounted && isMobile) trackCanonicalPdfOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isMobile, pdf.id]);
  // Mobile browsers (Android Chrome / iOS Safari) can't render PDFs inline —
  // they show a black frame. Only embed once we know we're on desktop.
  const canEmbed = mounted && !isMobile;

  // Warm the edge cache for this PDF so the Download click is instant.
  usePrewarmDownloads([pdf.id]);

  useEffect(() => {
    trackEvent("pdf_view", {
      file_id: pdf.id,
      file_title: pdf.title,
      source_name: pdf.title,
    });
  }, [pdf.id, pdf.title]);

  const trackCanonicalPdfOpen = () => {
    if (pdfOpenTrackedRef.current === pdf.id) return;
    pdfOpenTrackedRef.current = pdf.id;
    trackFp("pdf_open", {
      publication_id: pdf.id,
      publication_title: pdf.title,
      publication_series: publication?.name ?? pdf.publication ?? null,
      publisher: publication?.publisher ?? pdf.publisher ?? null,
      parsha: pdf.parsha_key ?? null,
    });
  };

  const trackFallbackDownload = () => {
    trackEvent("pdf_download", {
      file_id: pdf.id,
      file_title: pdf.title,
      source_name: pdf.title,
    });
    trackDownloadAction({
      publicationId: pdf.id,
      publicationName: publicationLabel(publication?.name || pdf.publication || pdf.title) || pdf.title,
      publicationTitle: pdf.title,
      parsha: pdf.parsha_key,
      publisher: publication?.publisher ?? pdf.publisher,
      publicationSeries: publication?.name ?? pdf.publication,
    });
  };

  const metaLine = [
    audienceLabel(normalizeAudience(pdf.audience, pdf.title)) ?? pdf.audience,
    formatTypeLabel(pdf.format_type),
    typeof pdf.page_count === "number"
      ? pdf.page_count >= 20
        ? `Long Study · ${pdf.page_count} pages`
        : `${pdf.page_count} ${pdf.page_count === 1 ? "page" : "pages"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary leading-snug">
                {pdf.title}
              </h1>
              {pdf.badge && (
                <span className="mt-1 shrink-0 rounded-full border border-accent bg-accent/20 px-2 py-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-primary">
                  {pdf.badge}
                </span>
              )}
            </div>
            {(publication?.publisher || pdf.publisher) && (
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                Published by {publication?.publisher || pdf.publisher}
              </p>
            )}
            {pdf.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{standardizeCopy(pdf.subtitle)}</p>
            )}
            {metaLine && (
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {metaLine}
              </p>
            )}
            {publication && (
              <p className="mt-3 text-sm text-muted-foreground">
                Part of{" "}
                <Link
                  to="/publication/$slug"
                  params={{ slug: publication.slug }}
                  className="font-medium text-accent underline hover:text-primary"
                >
                  {publication.name}
                </Link>
              </p>
            )}
          </div>
        </div>

        {pdf.description && (
          <section className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5">
            <p className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent-readable">
              What you'll find
            </p>
            <p className="mt-2 font-serif text-base leading-relaxed text-primary/85">
              {standardizeCopy(pdf.description)}
            </p>
          </section>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <DownloadToPrintButton
            href={`/view/${pdf.id}/download`}
            publicationId={pdf.id}
            publicationName={publicationLabel(publication?.name || pdf.publication || pdf.title) || pdf.title}
            publicationTitle={pdf.title}
            parsha={pdf.parsha_key}
            publisher={publication?.publisher ?? pdf.publisher}
            publicationSeries={publication?.name ?? pdf.publication}
            filename={buildDownloadFilename(pdf.parsha_key, publication?.name || pdf.publication || pdf.title)}
            onClick={() =>
              trackEvent("pdf_download", {
                file_id: pdf.id,
                file_title: pdf.title,
                source_name: pdf.title,
              })
            }
            className="px-5 py-2.5"
          />
          <SharePublicationButton
            pdfId={pdf.id}
            title={pdf.title}
            parsha={pdf.parsha_key}
            variant="inline"
          />
        </div>

        <div className="mt-6">
          {canEmbed ? (
            <>
              <h2 className="font-serif text-lg sm:text-xl font-semibold text-primary mb-3">
                Preview
              </h2>
              <iframe
                src={viewerSrc}
                title={`Embedded PDF viewer: ${pdf.title}`}
                className="w-full border-0 bg-muted h-[80vh] rounded-lg"
                onLoad={trackCanonicalPdfOpen}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Can't read the embedded viewer?{" "}
                <a
                  href={`/view/${pdf.id}/download`}
                  rel="nofollow"
                  download={buildDownloadFilename(pdf.parsha_key, publication?.name || pdf.publication || pdf.title)}
                  onClick={trackFallbackDownload}
                  className="font-medium text-accent underline hover:text-primary transition-colors duration-150"
                >
                  Download the PDF file for {pdf.title}
                </a>
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
              <h2 className="font-serif text-lg sm:text-xl font-semibold text-primary mb-3">
                Preview
              </h2>
              {typeof pdf.page_count === "number" && (
                <p className="text-sm text-muted-foreground">
                  {pdf.page_count} {pdf.page_count === 1 ? "page" : "pages"} · PDF
                </p>
              )}
              {pdf.thumb_url && !thumbFailed ? (
                <img
                  src={pdf.thumb_url}
                  alt={`First page preview of ${pdf.title}`}
                  loading="lazy"
                  onError={() => setThumbFailed(true)}
                  className="mx-auto mt-3 w-full max-w-sm rounded-md border border-accent/40 bg-background shadow-sm"
                />
              ) : (
                <p className="mt-3 text-sm text-foreground/80">
                  Mobile browsers can't preview PDFs. Download it to read or print.
                </p>
              )}
            </div>
          )}
        </div>

        {publication && related.length > 0 && (
          <section className="mt-9 border-t border-accent/25 pt-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent-readable">
                  More from this publication
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-primary">{publication.name}</h2>
              </div>
              <Link
                to="/publication/$slug"
                params={{ slug: publication.slug }}
                className="text-sm font-medium text-accent underline hover:text-primary"
              >
                View all editions
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {related.map((edition) => {
                const reading = formatReadingLabel(edition.parsha_key);
                const label = edition.jewish_year ? `${reading} ${edition.jewish_year}` : reading;
                const relatedMeta = [
                  edition.audience
                    ? audienceLabel(normalizeAudience(edition.audience, edition.title)) ?? edition.audience
                    : null,
                  formatTypeLabel(edition.format_type),
                  typeof edition.page_count === "number"
                    ? `${edition.page_count} ${edition.page_count === 1 ? "page" : "pages"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <Link
                    key={edition.id}
                    to="/view/$id"
                    params={{ id: edition.id }}
                    className="rounded-xl border border-accent/30 bg-background/65 p-4 transition-colors hover:border-accent/60 hover:bg-accent/5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent-readable">{label}</p>
                    <p className="mt-1 font-serif text-lg font-semibold text-primary">{edition.title}</p>
                    {relatedMeta && <p className="mt-2 text-xs text-muted-foreground">{relatedMeta}</p>}
                    {edition.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {edition.description}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-7">
          <Link
            to={isCurrentWeek ? "/" : "/archive"}
            className="inline-flex items-center gap-2 font-serif italic text-accent hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />{" "}
            {isCurrentWeek ? "Back to this week's collection" : "Back to Archive"}
          </Link>
        </div>

        <div className="mt-10">
          <WeeklyEmailSignup sourceId="view" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
