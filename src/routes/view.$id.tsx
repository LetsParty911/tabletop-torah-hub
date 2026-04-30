import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { getPdfById } from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";

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


  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-accent/30 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border-2 border-primary/60 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-base sm:text-xl font-semibold text-primary truncate">
              {pdf.title}
            </h1>
            {pdf.subtitle && (
              <p className="text-xs text-muted-foreground truncate">{pdf.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`/view/${pdf.id}/download`}
              onClick={() =>
                trackEvent("pdf_download", {
                  file_id: pdf.id,
                  file_title: pdf.title,
                  source_name: pdf.title,
                })
              }
              className="hidden sm:inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Download className="h-4 w-4" /> Download
            </a>
            <a
              href={`/view/${pdf.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackEvent("pdf_print", {
                  file_id: pdf.id,
                  file_title: pdf.title,
                  source_name: pdf.title,
                })
              }
              className="hidden sm:inline-flex items-center gap-2 rounded-full border-2 border-accent/70 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Printer className="h-4 w-4" /> Print PDF
            </a>
          </div>
        </div>
      </header>
      <main className="flex-1 flex">
        <iframe
          src={viewerSrc}
          title={pdf.title}
          className="w-full border-0 bg-muted h-[calc(100vh-64px)]"
        />
      </main>
    </div>
  );
}
