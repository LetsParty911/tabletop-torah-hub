import type { ReportData } from "@/components/admin/AnalyticsControlCenter";

type Summary = ReportData["report"]["openPdfClicks"];
type Detail = ReportData["report"]["details"]["openPdfClicks"][number];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function exportCsv(rows: Detail[], rangeLabel: string) {
  const header = ["occurred_at_utc", "occurred_at_et", "publication_title", "publication_id", "source_page", "visitor_id", "session_id", "traffic_source", "referrer", "device", "approx_ip_location"];
  const lines = [header.join(",")].concat(
    rows.map((r) => [r.at, fmt(r.at), r.publication, r.publicationId, r.path, r.visitorId, r.sessionId, r.source, r.referrer, r.device, r.location].map(csvCell).join(",")),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `open-pdf-clicks-${rangeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Owner-only breakdown of Open PDF button clicks (not viewer previews, not downloads). */
export default function OpenPdfClicksPanel({ data }: { data: ReportData }) {
  const s: Summary | undefined = data.report.openPdfClicks;
  const rows = data.report.details.openPdfClicks ?? [];
  if (!s) return null;
  return (
    <section className="border-y border-border py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-primary">Open PDF button clicks</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Deliberate taps on the public Open PDF button ({data.rangeLabel}). Separate from PDF viewer previews (automatic) and download actions.
            {" "}{s.total} from likely-human visits · {s.rawTotal} raw ({s.excluded} excluded as internal/test or suspected automation) · {s.uniqueVisitors} visitors · {s.uniqueSessions} visits.
          </p>
        </div>
        <button type="button" onClick={() => exportCsv(rows, data.rangeLabel)} disabled={!rows.length} className="rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent/15 disabled:opacity-50">
          Export CSV
        </button>
      </div>
      {s.total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No Open PDF clicks in this period.</p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 overflow-x-auto">
            <h4 className="text-sm font-semibold">By publication</h4>
            <table className="mt-2 w-full min-w-[420px] text-left text-xs">
              <thead className="text-muted-foreground"><tr><th className="py-1">Publication</th><th>Clicks</th><th>Visits</th><th>Last click (ET)</th></tr></thead>
              <tbody className="divide-y divide-border">
                {s.byPublication.map((p) => (
                  <tr key={p.publicationId ?? p.title}><td className="py-1 pr-2">{p.title}{p.publicationId && <code className="block text-[10px] text-muted-foreground">{p.publicationId}</code>}</td><td>{p.clicks}</td><td>{p.sessions}</td><td>{fmt(p.lastAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Where on the site</h4>
            <ul className="mt-2 space-y-1 text-xs">
              {s.byPage.map((p) => <li key={p.page} className="flex justify-between gap-2"><span className="break-all">{p.page}</span><span>{p.clicks}</span></li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
