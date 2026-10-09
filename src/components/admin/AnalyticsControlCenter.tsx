import type { adminAnalyticsReport } from "@/integrations/supabase/admin-analytics-canonical";
import PlausibleOverview from "@/components/admin/PlausibleOverview";
import AnalyticsHealthPanel from "@/components/admin/AnalyticsHealthPanel";
import BlockedVisitsSection from "@/components/admin/BlockedVisitsSection";
import { formatCountRate, shouldShowRate } from "@/lib/admin-analytics-display";
import { CONFIDENCE_LABELS } from "@/lib/traffic-confidence";

export type ReportData = Awaited<ReturnType<typeof adminAnalyticsReport>>;

export function secs(n: number) {
  if (!n) return "—";
  const m = Math.floor(n / 60);
  return m ? `${m}m ${n % 60}s` : `${n}s`;
}
export function etTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso));
}
function delta(cur: number, prev: number | undefined) {
  if (prev === undefined) return "";
  if (prev < 10) return `prior ${prev}`;
  const d = Math.round(((cur - prev) / prev) * 100);
  return `${d >= 0 ? "+" : ""}${d}% vs prior`;
}

export function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="rounded-md border border-border bg-background/50 px-3 py-2">
    <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="block font-serif text-xl font-bold text-primary sm:text-2xl">{value}</span>
    {note && <span className="block text-[10px] text-muted-foreground">{note}</span>}
  </div>;
}

/** Plain-language owner summary built only from canonical headline numbers. */
export function ownerSentence(data: ReportData) {
  const h = data.report.overview.headline;
  const conv = shouldShowRate(h.sessions) ? `${Math.round(h.pdfOpenRate * 100)}% of visits` : `${h.countedPdfSessions} of ${h.sessions} visits`;
  return `${data.rangeLabel}: ${h.visitors} human visitors made ${h.sessions} visits and viewed ${h.pageviews} pages. ${h.countedPdfOpens} counted PDF-open requests from ${h.countedPdfVisitors} browsers (${conv} with a counted PDF open). ${h.returningVisitors} visitors were returning. PDF opens mean deliberate requests, not verified reading.`;
}

export function KpiRow({ data }: { data: ReportData }) {
  const h = data.report.overview.headline;
  const p = data.comparisonHeadline;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
    <Kpi label="Human visitors" value={h.visitors} note={delta(h.visitors, p?.visitors)} />
    <Kpi label="Visits" value={h.sessions} note={delta(h.sessions, p?.sessions)} />
    <Kpi label="Pageviews" value={h.pageviews} note={delta(h.pageviews, p?.pageviews)} />
    <Kpi label="Counted PDF opens" value={h.countedPdfOpens} note={`${h.countedUniquePdfs} distinct PDFs · max 5 / browser`} />
    <Kpi label="PDF-open rate" value={formatCountRate(h.countedPdfSessions, h.sessions).split(" · ")[0]!} note={`${h.countedPdfVisitors} browsers requested PDFs`} />
    <Kpi label="Avg engaged time" value={secs(h.averageEngagedSeconds)} note={`median ${secs(h.medianEngagedSeconds)}`} />
    <Kpi label="New / returning" value={`${h.newVisitors} / ${h.returningVisitors}`} />
    <Kpi label="Active now" value={data.report.overview.recency.activeLast5Min} note={`${data.report.overview.recency.activeLast30Min} in last 30 min`} />
  </div>;
}

function RecentVisitors({ data }: { data: ReportData }) {
  const rows = data.report.overview.journeys;
  return <section>
    <h3 className="font-serif text-lg font-semibold text-primary">Recent visitors</h3>
    <p className="text-xs text-muted-foreground">Most recent human visits (bots, internal devices and blocked visits never appear here). Locations are approximate network locations. Time is ET.</p>
    {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No human visits in this period.</p> :
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
        <thead className="text-muted-foreground"><tr><th className="py-1 pr-2">Started</th><th className="pr-2">Location</th><th className="pr-2">Visitor</th><th className="pr-2">Device</th><th className="pr-2">Source</th><th className="pr-2">Span</th><th className="pr-2">Last</th><th className="pr-2">Pages</th><th className="pr-2">PDF opens</th><th>Scroll</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map((j) => <tr key={j.sessionId}>
          <td className="py-1 pr-2 whitespace-nowrap">{etTime(j.startedAt)}</td>
          <td className="pr-2">{j.location}</td>
          <td className="pr-2">{j.returning ? "Returning" : "New"}</td>
          <td className="pr-2">{j.device}</td>
          <td className="pr-2">{j.source}{j.referrer ? ` · ${j.referrer}` : ""}</td>
          <td className="pr-2">{secs(j.durationSeconds)}</td>
          <td className="pr-2 whitespace-nowrap">{etTime(j.lastAt)}</td>
          <td className="pr-2">{j.pageviews}</td>
          <td className="pr-2">{j.countedPdfOpens}</td>
          <td>{j.maxScroll === null ? "—" : `${j.maxScroll}%`}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}

function Returning({ data }: { data: ReportData }) {
  const h = data.report.overview.headline;
  const repeatVisits = Math.max(0, h.sessions - h.visitors);
  return <section>
    <h3 className="font-serif text-lg font-semibold text-primary">Returning behavior</h3>
    <p className="text-xs text-muted-foreground">Returning = browser ID seen before this period. IDs are per browser and can reset.</p>
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Kpi label="New visitors" value={h.newVisitors} />
      <Kpi label="Returning visitors" value={h.returningVisitors} note={formatCountRate(h.returningVisitors, h.visitors)} />
      <Kpi label="Repeat visits in period" value={repeatVisits} note="visits beyond each visitor's first" />
      <Kpi label="Pages / visit" value={h.pagesPerSession} />
    </div>
  </section>;
}

function Diagnostics({ data, accessToken }: { data: ReportData; accessToken: string }) {
  const c = data.report.confidence.counts as Record<string, number>;
  return <section className="space-y-4">
    <div>
      <h3 className="font-serif text-lg font-semibold text-primary">Blocked, bot and internal traffic</h3>
      <p className="text-xs text-muted-foreground">Shown for diagnostics only. Only high-confidence and likely human visits count in the numbers above.</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(CONFIDENCE_LABELS).map(([k, label]) => <Kpi key={k} label={label} value={c[k] ?? 0} note="visits" />)}
      </div>
    </div>
    <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-medium">PDF-open counting audit</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Kpi label="Raw access actions" value={data.report.pdfAccessAudit.rawActions} note="Before human classification" />
      <Kpi label="Human before cap" value={data.report.pdfAccessAudit.humanBeforeCap} note="Identified browser IDs only" />
      <Kpi label="Counted PDF opens" value={data.report.pdfAccessAudit.counted} note="Maximum five per browser" />
      <Kpi label="Over-cap" value={data.report.pdfAccessAudit.overCap} note={`${data.report.pdfAccessAudit.visitorsOverCap} browsers`} />
      <Kpi label="Auto previews" value={data.report.pdfAccessAudit.automaticPreviews} note="Not part of PDF opens" />
      <Kpi label="Missing PDF IDs" value={data.report.pdfAccessAudit.missingPublicationIds} note="Counted but not rankable" />
      <Kpi label="Unidentified actions" value={data.report.pdfAccessAudit.excludedUnidentified} note="Raw audit only" />
      <Kpi label="Legacy download actions" value={data.report.pdfAccessAudit.legacyDownloadActions} note="Included once in historical opens" />
    </div><p className="mt-2 text-xs text-muted-foreground">Each reporting window is capped separately. Raw events remain intact. Browser IDs are not people and a click does not prove that a file finished loading.</p></details>
    <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Blocked visits (city rules)</summary><div className="mt-3"><BlockedVisitsSection accessToken={accessToken} /></div></details>
  </section>;
}

export function SupportingTables({ data }: { data: ReportData }) {
  return <PlausibleOverview overview={data.report.overview} prior={data.comparisonHeadline} rangeLabel={data.rangeLabel} />;
}

export default function AnalyticsControlCenter({ data, accessToken }: { data: ReportData; accessToken: string }) {
  const pubs = data.report.publications.slice(0, 12);
  return <div className="space-y-8">
    <p className="rounded-md bg-muted/50 p-3 text-sm">{ownerSentence(data)}</p>
    <KpiRow data={data} />
    <RecentVisitors data={data} />
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Publications</h3>
      <p className="text-xs text-muted-foreground">Sorted by counted PDF opens, after excluding suspected automation and capping at five actions per browser for this reporting window.</p>
      {pubs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No publication activity.</p> :
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-1">Publication</th><th>Series</th><th>Shown</th><th>Selected</th><th>Counted PDF opens</th><th>Readers</th><th>Top source</th></tr></thead>
          <tbody className="divide-y divide-border">{pubs.map((p) => <tr key={p.id ?? p.title}><td className="py-1 pr-2">{p.title}</td><td>{p.series ?? "—"}</td><td>{p.impressions}</td><td>{p.clicks}</td><td>{p.countedPdfOpens}</td><td>{p.countedVisitors}</td><td>{p.countedSources[0]?.label ?? "—"}</td></tr>)}</tbody></table></div>}
    </section>
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Search terms</h3>
      {data.report.searches.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">No on-site searches captured in this period.</p> :
        <ul className="mt-1 flex flex-wrap gap-2 text-xs">{data.report.searches.slice(0, 20).map((s, i) => <li key={i} className="rounded border border-border px-2 py-0.5">“{s.term}”</li>)}</ul>}
    </section>
    <Returning data={data} />
    <details open className="rounded-md border border-border p-3"><summary className="cursor-pointer font-serif text-lg font-semibold text-primary">Engagement, content, acquisition, geography and devices</summary><div className="mt-4"><SupportingTables data={data} /></div></details>
    <Diagnostics data={data} accessToken={accessToken} />
    <AnalyticsHealthPanel accessToken={accessToken} />
    <p className="text-xs text-muted-foreground">Microsoft Clarity recordings are available in the Clarity dashboard; Clarity sessions are not linked to these visit IDs, so individual visits cannot be matched.</p>
  </div>;
}
