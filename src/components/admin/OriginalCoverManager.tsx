import { useRef, useState } from "react";
import { adminUploadPdfThumb } from "@/integrations/supabase/api.functions";
import { groupOriginalEditions } from "@/lib/original-editions";
import { latestPromotionEdition, ORIGINAL_PROMOTION_SERIES } from "@/lib/originals-promotion";
import type { PdfRow } from "@/lib/pdf-constants";

function CoverControl({ accessToken, title, target }: {
  accessToken: string;
  title: string;
  target?: { id: string; label: string };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!target || !file || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus(null);
    try {
      const { renderManualCoverBase64, renderSmallThumbBase64 } = await import("@/lib/pdf-thumb");
      const pngBase64 = await renderManualCoverBase64(file);
      if (!pngBase64) throw new Error("Choose a valid PDF, PNG, JPEG or WebP file (up to 20 MB).");
      const smallWebpBase64 = await renderSmallThumbBase64(pngBase64);
      const result = await adminUploadPdfThumb({ data: { accessToken, id: target.id, pngBase64, smallWebpBase64 } });
      if (!result.ok) throw new Error(result.error || "Thumbnail upload failed.");
      setStatus({ ok: true, message: "Cover saved. Both public pages will use the updated cover after the cache refreshes." });
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (error) {
      setStatus({ ok: false, message: error instanceof Error ? error.message : "Thumbnail upload failed." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border border-accent/30 bg-background/60 p-4">
      <h3 className="font-serif font-semibold text-primary">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {target ? "Latest published issue: " + target.label : "No published issue yet. Upload the first PDF to enable its cover."}
      </p>
      <label className="mt-3 block text-sm">
        <span className="sr-only">{title} cover file</span>
        <input ref={input} type="file" accept=".pdf,image/png,image/jpeg,image/webp" disabled={!target || busy}
          className="block w-full text-sm" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setStatus(null); }} />
      </label>
      <button type="button" aria-label={"Save cover for " + title} disabled={!target || !file || busy}
        onClick={upload} className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? "Saving…" : "Upload / Replace Cover"}
      </button>
      {status && <p role={status.ok ? "status" : "alert"} className={"mt-2 text-sm " + (status.ok ? "text-primary" : "text-destructive")}>{status.message}</p>}
    </article>
  );
}

export default function OriginalCoverManager({ accessToken, pdfs }: { accessToken: string; pdfs: PdfRow[] }) {
  const groups = groupOriginalEditions(
    pdfs.filter((pdf) => pdf.published).map((pdf) => ({
      id: pdf.id,
      publication_id: pdf.publication_id ?? null,
      parsha_key: pdf.parsha_key,
      jewish_year: pdf.jewish_year,
      created_at: pdf.created_at,
    })),
    () => null, 300,
  );
  return (
    <section className="parchment-frame" aria-labelledby="original-cover-heading">
      <div className="parchment-panel">
        <h2 id="original-cover-heading" className="font-serif text-2xl font-semibold text-primary">Original Series Covers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage all seven original publication covers. Choose the first page of the listed issue as a PDF or image.
          This changes the thumbnail only, not the PDF or publishing status. New published issues update automatically.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ORIGINAL_PROMOTION_SERIES.map((series) => {
            const selected = latestPromotionEdition(series, groups);
            const target = selected ? { id: selected.edition.id, label: selected.group.label } : undefined;
            return <CoverControl key={series.key + ":" + (target?.id ?? "none")} accessToken={accessToken} title={series.title} target={target} />;
          })}
        </div>
      </div>
    </section>
  );
}
