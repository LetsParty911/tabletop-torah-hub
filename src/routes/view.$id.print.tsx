import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { getPdfById } from "@/integrations/supabase/api.functions";

export const Route = createFileRoute("/view/$id/print")({
  loader: async ({ params }) => {
    const r = await getPdfById({ data: { id: params.id } });
    if (!r.pdf) throw notFound();
    return { pdf: r.pdf };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.pdf?.title ?? "Print PDF" }],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-serif text-3xl text-primary">Resource Not Found</h1>
      <Link to="/" className="text-accent underline">Back to Home</Link>
    </div>
  ),
  component: PrintPdf,
});

function PrintPdf() {
  const { pdf } = Route.useLoaderData();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const triggeredRef = useRef(false);

  const triggerPrint = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      // Small delay to ensure PDF is rendered in viewer before print
      setTimeout(triggerPrint, 600);
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-accent/30 bg-background/80 backdrop-blur sticky top-0 z-10 print:hidden">
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
          <button
            onClick={triggerPrint}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            <Printer className="h-4 w-4" /> Print again
          </button>
        </div>
        <p className="mx-auto max-w-6xl px-3 sm:px-6 pb-3 text-xs text-muted-foreground">
          The print dialog should open automatically. If it doesn't, click "Print again".
        </p>
      </header>
      <main className="flex-1 flex">
        <iframe
          ref={iframeRef}
          src={`/view/${pdf.id}/inline`}
          title={pdf.title}
          className="w-full h-[calc(100vh-96px)] border-0 bg-muted print:h-screen"
        />
      </main>
    </div>
  );
}
