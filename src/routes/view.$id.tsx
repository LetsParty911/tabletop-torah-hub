import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import { getPdfById } from "@/integrations/supabase/api.functions";

export const Route = createFileRoute("/view/$id")({
  loader: async ({ params }) => {
    const r = await getPdfById({ data: { id: params.id } });
    if (!r.pdf) throw notFound();
    return { pdf: r.pdf };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.pdf?.title ?? "View PDF";
    const subtitle = loaderData?.pdf?.subtitle;
    const pageTitle = subtitle ? `${title} — ${subtitle}` : title;
    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: subtitle ?? "Torah resource" },
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
          <a
            href={`/view/${pdf.id}/download`}
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            <Download className="h-4 w-4" /> Download
          </a>
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
