import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Printer } from "lucide-react";
import { trackFp } from "@/lib/first-party-analytics";

// Isolated pilot only. No existing public PDF card or download action is changed.
const TORAS_AVIGDOR_ID = "6d30cd1b-77b9-4810-95d3-73653fa8c408";
const PDF_URL = `/view/${TORAS_AVIGDOR_ID}/pdf`;
const TRACKING_CONTEXT = {
  publication_id: TORAS_AVIGDOR_ID,
  publication_title: "Toras Avigdor — Bereishis",
  publication_series: "Toras Avigdor",
  parsha: "Bereishis",
  metadata: { print_test: true },
};

// Render each PDF page into a real image before calling print(). Printing an
// iframe or a cross-origin PDF directly is unreliable in Android in-app tabs.
// Keep PDF rendering client-only, and keep the Print click synchronous so
// browsers that require a user gesture can open their native print dialog.
const PRINT_CSS = `
@media print {
  @page { size: auto; margin: 0.2in; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body.has-chooser-bar { padding-bottom: 0 !important; }
  nav[aria-label="Primary"], .print-test-no-print { display: none !important; }
  .print-test-main { width: 100% !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .print-test-pages { display: block !important; width: 100% !important; padding: 0 !important; margin: 0 !important; gap: 0 !important; }
  .print-test-pages > .print-test-page { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; width: 100% !important; padding: 0 !important; margin: 0 !important; break-inside: avoid; page-break-inside: avoid; break-after: page; page-break-after: always; }
  .print-test-pages > .print-test-page:last-child { break-after: auto; page-break-after: auto; }
  .print-test-page img { display: block !important; width: auto !important; max-width: 100% !important; height: auto !important; max-height: 10.4in !important; object-fit: contain !important; margin: 0 auto !important; }
}
`;

export const Route = createFileRoute("/print-test")({
  head: () => ({
    meta: [
      { title: "Print Test — Toras Avigdor | Torah For The Table" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TorasAvigdorPrintTest,
});

function TorasAvigdorPrintTest() {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderedCount, setRenderedCount] = useState(0);
  const [error, setError] = useState("");
  const [printAttempted, setPrintAttempted] = useState(false);
  const [printError, setPrintError] = useState("");
  const ready = pageCount > 0 && renderedCount === pageCount && !error;

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    const container = pagesRef.current;
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    const loadPages = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        // The existing server route verifies publication visibility and then
        // redirects to the published PDF; the PDF is not forcibly downloaded.
        const task = pdfjs.getDocument({ url: PDF_URL });
        loadingTask = task;
        const pdf = await task.promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);

        for (let index = 1; index <= pdf.numPages; index += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(index);
          const viewport = page.getViewport({ scale: 2 }); // 144 DPI at 72 PDF units/in.
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("This browser cannot prepare PDF pages for printing.");
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          if (cancelled) return;

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((value) => {
              if (value) resolve(value);
              else reject(new Error("Unable to prepare a printable PDF page."));
            }, "image/png");
          });
          // Release the large render buffer as each PNG is prepared.
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
          if (cancelled) return;

          const imageUrl = URL.createObjectURL(blob);
          objectUrls.push(imageUrl);
          const image = new Image();
          image.src = imageUrl;
          image.alt = `Toras Avigdor, page ${index} of ${pdf.numPages}`;
          image.className = "block h-auto w-full";
          await image.decode();
          if (cancelled) return;

          const wrapper = document.createElement("section");
          wrapper.className = "print-test-page overflow-hidden rounded-md bg-white shadow-sm";
          wrapper.setAttribute("aria-label", `PDF page ${index}`);
          wrapper.appendChild(image);
          container?.appendChild(wrapper);
          setRenderedCount(index);
          if (index === 1) trackFp("pdf_open", TRACKING_CONTEXT);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[print-test] PDF preparation failed", e);
          setError("The printable preview could not be prepared in this browser.");
        }
      }
    };

    void loadPages();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      for (const url of objectUrls) URL.revokeObjectURL(url);
      container?.replaceChildren();
    };
  }, []);

  const print = () => {
    if (!ready) return;
    trackFp("print_click", TRACKING_CONTEXT);
    setPrintAttempted(true);
    setPrintError("");
    try {
      // Must run directly in the click handler, not after an await/timer.
      window.print();
      trackFp("print_initiated", TRACKING_CONTEXT);
    } catch (e) {
      console.error("[print-test] print() failed", e);
      setPrintError("Your browser blocked the print dialog.");
      trackFp("print_fallback_open", TRACKING_CONTEXT);
    }
  };

  return (
    <main className="print-test-main mx-auto min-h-screen w-full max-w-4xl px-3 py-5 sm:px-6">
      <style>{PRINT_CSS}</style>
      <div className="print-test-no-print mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-accent-readable">Mobile print pilot</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-primary">Toras Avigdor — Bereishis</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Test printing directly from TorahForTheTable.com, without first downloading the PDF.
          The printable pages appear below as they become ready.
        </p>
      </div>

      <div className="print-test-no-print sticky top-14 z-30 mb-5 rounded-xl border border-accent/30 bg-background p-3 shadow-md md:top-20">
        <button
          type="button"
          onClick={print}
          disabled={!ready}
          className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-wait disabled:opacity-60"
        >
          {ready ? <Printer className="h-6 w-6" aria-hidden="true" /> : <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />}
          {ready ? "Print PDF" : "Preparing pages for printing…"}
        </button>
        <p className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground" aria-live="polite" role="status">
          {error ? (
            <><AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" /> PDF preparation failed</>
          ) : ready ? (
            <><CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" /> All {pageCount} pages ready</>
          ) : pageCount ? (
            `${renderedCount} of ${pageCount} pages ready`
          ) : (
            "Loading the PDF…"
          )}
        </p>
        {printError && <p role="alert" className="mt-2 text-center text-sm text-destructive">{printError}</p>}
        {printAttempted && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            If no printer selection appeared, use the browser menu to open this page in the full Chrome browser, then tap Print PDF again.
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="print-test-no-print mb-5 rounded-lg border border-destructive/30 p-4 text-sm">
          <p>{error}</p>
          <a href={PDF_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 font-semibold text-primary underline">
            Open the original PDF instead <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      )}

      <div ref={pagesRef} aria-label="Toras Avigdor printable pages" className="print-test-pages flex flex-col gap-5" />
      <p className="print-test-no-print mt-5 text-center text-xs text-muted-foreground">
        Pilot page only. The normal website buttons have not been changed. The printer dialog depends on your browser and device.
      </p>
    </main>
  );
}
