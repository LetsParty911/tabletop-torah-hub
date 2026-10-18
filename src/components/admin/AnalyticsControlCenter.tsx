import type { adminAnalyticsReport } from "@/integrations/supabase/admin-analytics-canonical";
import PlausibleOverview from "@/components/admin/PlausibleOverview";
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
    <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="block font-serif text-xl font-bold text-primary sm:text-2xl">{value}</span>
    {note && <span className="block text-xs text-muted-foreground">{note}</span>}
  </div>;
}

/** Plain-language owner summary built only from canonical headline numbers. */
export function ownerSentence(data: ReportData) {
  const h = data.report.overview.headline;
  const conv = shouldShowRate(h.sessions) ? `${Math.round((h.pdfOpenSessions / h.sessions) * 100)}% of visits` : `${h.pdfOpenSessions} of ${h.sessions} visits`;
  return `${data.rangeLabel}: ${h.visitors} likely-human browser IDs made ${h.sessions} visits and viewed ${h.pageviews} pages. ${data.report.metrics.usedTorah} browser IDs had a Torah-use action (PDF access, sharing or signup). ${conv} attempted a PDF open (${h.countedPdfOpens} counted attempts, no per-visitor maximum). ${h.returningVisitors} browser IDs were returning.`;
}

export function KpiRow({ data }: { data: ReportData }) {
  const h = data.report.overview.headline;
  const p = data.comparisonHeadline;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
    <Kpi label="Likely-human visitors" value={h.visitors} note={delta(h.visitors, p?.visitors)} />
    <Kpi label="Visits" value={h.sessions} note={delta(h.sessions, p?.sessions)} />
    <Kpi label="Pageviews" value={h.pageviews} note={delta(h.pageviews, p?.pageviews)} />
    <Kpi label="Counted PDF attempted opens" value={h.countedPdfOpens} note={delta(h.countedPdfOpens, p?.countedPdfOpens)} />
    <Kpi label="PDF attempted-open rate" value={formatCountRate(h.pdfOpenSessions, h.sessions).split(" · ")[0]!} note="visits with an attempted open, not confirmed transfer" />
    <Kpi label="Avg engaged time" value={secs(h.averageEngagedSeconds)} note={`median ${secs(h.medianEngagedSeconds)}`} />
    <Kpi label="New / returning" value={`${h.newVisitors} / ${h.returningVisitors}`} note={`Returning share: ${formatCountRate(h.returningVisitors, h.visitors)}`} />
    <Kpi label="Seen in last 5 min" value={data.report.overview.recency.activeLast5Min} note={`${data.report.overview.recency.activeLast30Min} in last 30 min; not verified online now`} />
  </div>;
}

function RecentVisitors({ data }: { data: ReportData }) {
  const rows = data.report.overview.journeys;
  return (
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Recent likely-human visits</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Browser sessions with human-like evidence, not verified people or readers. Location is an approximate IP-network estimate; all times are Eastern.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No likely-human visits in this period.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-3 lg:hidden">
            {rows.map((j) => (
              <li key={j.sessionId} className="rounded-lg border border-border bg-background/50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{etTime(j.startedAt)} ET</span>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs">{j.returning ? "Returning browser" : "New browser"}</span>
                </div>
                <p className="mt-2 break-words">{j.location || "Location unknown"} · {j.device}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">Source: {j.source}{j.referrer ? ` · ${j.referrer}` : ""}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span>Pages: <b>{j.pageviews}</b></span>
                  <span>PDF attempts: <b>{j.pdfOpens}</b></span>
                  <span>Visit span: <b>{secs(j.durationSeconds)}</b></span>
                  <span>Scroll: <b>{j.maxScroll === null ? "—" : `${j.maxScroll}%`}</b></span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Last activity: {etTime(j.lastAt)} ET</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2">Started (ET)</th><th className="pr-2">Location</th>
                  <th className="pr-2">Visitor</th><th className="pr-2">Device</th>
                  <th className="pr-2">Source</th><th className="pr-2">Span</th>
                  <th className="pr-2">Last (ET)</th><th className="pr-2">Pages</th>
                  <th className="pr-2">PDF attempts</th><th>Scroll</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((j) => (
                  <tr key={j.sessionId}>
                    <td className="py-2 pr-2 whitespace-nowrap">{etTime(j.startedAt)}</td>
                    <td className="pr-2">{j.location}</td>
                    <td className="pr-2">{j.returning ? "Returning" : "New"}</td>
                    <td className="pr-2">{j.device}</td>
                    <td className="pr-2">{j.source}{j.referrer ? ` · ${j.referrer}` : ""}</td>
                    <td className="pr-2">{secs(j.durationSeconds)}</td>
                    <td className="pr-2 whitespace-nowrap">{etTime(j.lastAt)}</td>
                    <td className="pr-2">{j.pageviews}</td>
                    <td className="pr-2">{j.pdfOpens}</td>
                    <td>{j.maxScroll === null ? "—" : `${j.maxScroll}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
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

export function Diagnostics({ data, accessToken }: { data: ReportData; accessToken: string }) {
  const c = data.report.confidence.counts as Record<string, number>;
  return <section className="space-y-4">
    <div>
      <h3 className="font-serif text-lg font-semibold text-primary">Blocked, bot and internal traffic</h3>
      <p className="text-xs text-muted-foreground">Shown for diagnostics only. Only high-confidence and likely human visits count in the numbers above.</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.entries(CONFIDENCE_LABELS).map(([k, label]) => <Kpi key={k} label={label} value={c[k] ?? 0} note="visits" />)}
      </div>
    </div>
    <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Blocked visits (city rules)</summary><div className="mt-3"><BlockedVisitsSection accessToken={accessToken} /></div></details>
  </section>;
}

export function SupportingTables({ data }: { data: ReportData }) {
  return <PlausibleOverview overview={data.report.overview} prior={data.comparisonHeadline} rangeLabel={data.rangeLabel} />;
}

export default function AnalyticsControlCenter({ data, accessToken }: { data: ReportData; accessToken: string }) {
  const pubs = data.report.pdfAccess.byPublication.slice(0, 12);
  return <div className="space-y-8">
    <p className="rounded-md bg-muted/50 p-3 text-sm">{ownerSentence(data)}</p>
    <KpiRow data={data} />
    <RecentVisitors data={data} />
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Publications</h3>
      <p className="text-xs text-muted-foreground">Ranked by counted PDF attempted opens (human-qualified, no per-visitor limit).</p>
      {pubs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No counted PDF attempted opens.</p> :
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-1">Publication</th><th>Series</th><th>Parsha</th><th>Attempted opens</th><th>Visitors</th><th>Top source</th></tr></thead>
          <tbody className="divide-y divide-border">{pubs.map((p) => <tr key={p.publicationId}><td className="py-1 pr-2">{p.title}</td><td>{p.series ?? "—"}</td><td>{p.parsha ?? "—"}</td><td>{p.opens}</td><td>{p.uniqueVisitors}</td><td>{p.topSource ?? "—"}</td></tr>)}</tbody></table></div>}
    </section>
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Search terms</h3>
      {data.report.searches.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">No on-site searches captured in this period.</p> :
        <ul className="mt-1 flex flex-wrap gap-2 text-xs">{data.report.searches.slice(0, 20).map((s, i) => <li key={i} className="rounded border border-border px-2 py-0.5">“{s.term}”</li>)}</ul>}
    </section>
    <Returning data={data} />
    <details className="rounded-md border border-border p-3"><summary className="cursor-pointer font-serif text-lg font-semibold text-primary">Additional charts, funnels, locations and devices</summary><div className="mt-4"><SupportingTables data={data} /></div></details>
    <p className="text-xs text-muted-foreground">Microsoft Clarity recordings are available in the Clarity dashboard; Clarity sessions are not linked to these visit IDs, so individual visits cannot be matched.</p>
  </div>;
}
