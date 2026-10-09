import type { adminAnalyticsReport } from "@/integrations/supabase/admin-analytics-canonical";
import { csvCell } from "@/lib/open-pdf-clicks";

type ReportData = Awaited<ReturnType<typeof adminAnalyticsReport>>;

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

/** One-line audit: how raw PDF-access actions became the counted headline. */
export function pdfAccessAuditLine(m: ReportData["report"]["metrics"]): string {
  return `${m.pdfAccessRaw} raw actions → ${m.pdfAccessExcludedNonHuman} excluded (uncertain, internal/test or automation) · ${m.pdfAccessExcludedNoVisitorId} without a visitor ID · ${m.pdfAccessOverCap} over the ${m.pdfAccessCap}-per-visitor cap (${m.pdfAccessVisitorsOverCap} ${m.pdfAccessVisitorsOverCap === 1 ? "visitor" : "visitors"}) → ${m.countedPdfOpens} counted.`;
}

export function countedPdfOpensCsv(data: ReportData): string {
  const header = ["publication_id", "title", "series", "parsha", "counted_pdf_opens", "unique_visitors", "top_source", "last_at_utc"];
  const lines = data.report.pdfAccess.byPublication.map((p) =>
    [p.publicationId, p.title, p.series, p.parsha, p.opens, p.uniqueVisitors, p.topSource, p.lastAt].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(data: ReportData) {
  const blob = new Blob([countedPdfOpensCsv(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `counted-pdf-opens-${data.windowStart.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Ranked publications by counted PDF opens, plus filter audit and historical downloads. */
export default function CountedPdfOpens({ data, showRanking = true }: { data: ReportData; showRanking?: boolean }) {
  const m = data.report.metrics;
  const access = data.report.pdfAccess;
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-serif text-lg font-semibold text-primary">Counted PDF opens</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Deliberate Open PDF clicks plus historical download actions, from likely-human visitors only, at most {m.pdfAccessCap} per visitor in this period (earliest first, across all visits and PDFs). Attempted opens — not proof the file loaded or was read. Automatic previews ({access.automaticPreviews}) are never counted.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fig label="Counted PDF opens" value={m.countedPdfOpens} />
        <Fig label="Visitors who opened" value={m.countedPdfOpenVisitors} />
        <Fig label="Distinct PDFs" value={m.countedUniquePdfs} />
        <Fig label="PDF-open rate" value={m.sessions > 0 ? pct(m.pdfOpenRate) : "—"} note={`${m.countedPdfOpenSessions} of ${m.sessions} visits`} />
      </div>
      <p className="text-xs text-muted-foreground">{pdfAccessAuditLine(m)}{m.pdfAccessMissingPublicationId > 0 ? ` ${m.pdfAccessMissingPublicationId} counted actions have no publication ID and are excluded from the ranking.` : ""}</p>
      {showRanking && (access.byPublication.length === 0 ? (
        <p className="text-sm text-muted-foreground">No counted PDF opens in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-muted-foreground"><tr><th className="py-1 pr-2">Publication</th><th className="pr-2">Series</th><th className="pr-2">Parsha</th><th className="pr-2">Counted opens</th><th className="pr-2">Visitors</th><th>Top source</th></tr></thead>
            <tbody className="divide-y divide-border">
              {access.byPublication.slice(0, 25).map((p) => (
                <tr key={p.publicationId}><td className="py-1 pr-2">{p.title}</td><td className="pr-2">{p.series ?? "—"}</td><td className="pr-2">{p.parsha ?? "—"}</td><td className="pr-2 font-semibold">{p.opens}</td><td className="pr-2">{p.uniqueVisitors}</td><td>{p.topSource ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {access.bySource.length > 0 && (
        <p className="text-xs text-muted-foreground">By source: {access.bySource.slice(0, 6).map((s) => `${s.label} ${s.opens}`).join(" · ")}{access.byCampaign.length ? ` · Campaigns: ${access.byCampaign.slice(0, 4).map((c) => `${c.label} ${c.opens}`).join(" · ")}` : ""}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {showRanking && access.byPublication.length > 0 && (
          <button type="button" className="underline" onClick={() => downloadCsv(data)}>Export CSV</button>
        )}
        <span className="text-muted-foreground">Historical audit (not a headline): {m.downloads} download actions, {m.downloadsServed} served redirects.</span>
      </div>
    </section>
  );
}

function Fig({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <span className="block text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
      <span className="mt-1 block font-serif text-2xl font-bold text-primary">{value}</span>
      {note && <span className="mt-1 block text-[11px] text-muted-foreground">{note}</span>}
    </div>
  );
}
