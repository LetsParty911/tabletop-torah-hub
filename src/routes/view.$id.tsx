import { standardizeCopy } from "@/lib/standardize-copy";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { getPdfById } from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";
import { normalizeAudience } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { buildDownloadFilename } from "@/lib/download-filename";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { WeeklyEmailSignup } from "@/components/WeeklyEmailSignup";


export const Route = createFileRoute("/view/$id")({
  loader: async ({ params }) => {
    const r = await getPdfById({ data: { id: params.id } });
    if (!r.pdf) throw notFound();
    return { pdf: r.pdf };
  },
  head: ({ loaderData, params }) => {
    const title = loaderData?.pdf?.title ?? "View PDF";
    const subtitle = loaderData?.pdf?.subtitle;
    const pageTitle = subtitle ? `${title} — ${subtitle}` : title;
    const description = subtitle ?? "Torah resource";
    const url = `https://torahforthetable.com/view/${params.id}`;
    const image = "https://torahforthetable.com/og-image.png";

    // Best available publish/update dates, safely normalized to ISO strings.
    const toIso = (v: string | null | undefined): string | null => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const datePublished =
      toIso(loaderData?.pdf?.weekOf) ?? toIso(loaderData?.pdf?.createdAt);
    const dateModified = toIso(loaderData?.pdf?.updatedAt);

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
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
    if (datePublished) jsonLd.datePublished = datePublished;
    if (dateModified) jsonLd.dateModified = dateModified;

    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:title", content: pageTitle },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: pageTitle },
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
      <Link to="/" className="text-accent underline">Back to Home</Link>
    </div>
  ),
  component: ViewPdf,
});

function ViewPdf() {
  const { pdf } = Route.useLoaderData();
  const viewerSrc = `/view/${pdf.id}/pdf#toolbar=1&navpanes=0&view=FitH`;

  useEffect(() => {
    trackEvent("pdf_view", {
      file_id: pdf.id,
      file_title: pdf.title,
      source_name: pdf.title,
    });
  }, [pdf.id, pdf.title]);

  const metaLine = [
    normalizeAudience(pdf.audience, pdf.title) ?? pdf.audience,
    formatTypeLabel(pdf.format_type),
    typeof pdf.page_count === "number"
      ? `${pdf.page_count} ${pdf.page_count === 1 ? "page" : "pages"}`
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
            {pdf.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">
                {standardizeCopy(pdf.subtitle)}
              </p>
            )}
            {pdf.description && (
              <p className="mt-3 text-base text-foreground/85 leading-relaxed">
                {standardizeCopy(pdf.description)}
              </p>
            )}
            {metaLine && (
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {metaLine}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <DownloadToPrintButton
            href={`/view/${pdf.id}/download`}
            publicationId={pdf.id}
            publicationTitle={pdf.title}
            filename={buildDownloadFilename(
              pdf.parsha_key,
              pdf.publication || pdf.title,
            )}
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
          <iframe
            src={viewerSrc}
            title={`Embedded PDF viewer: ${pdf.title}`}
            className="w-full border-0 bg-muted h-[80vh] rounded-lg"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Can't read the embedded viewer?{" "}
            <a
              href={`/view/${pdf.id}/download`}
              download
              className="font-medium text-accent underline hover:text-primary transition-colors duration-150"
            >
              Download the PDF file for {pdf.title}
            </a>
          </p>
        </div>

        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-serif italic text-accent hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to this week's collection
          </Link>
        </div>

        <div className="mt-10">
          <WeeklyEmailSignup sourceId="view" />
        </div>
      </main>
    </div>
  );
}

