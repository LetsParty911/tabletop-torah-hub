import type { NoahideResourcesReport } from "@/lib/noahide-resources-analytics";

const CONFIDENCE_LABELS: Record<string, string> = {
  high_confidence_human: "High-confidence human",
  likely_human: "Likely human",
  uncertain: "Uncertain",
  suspected_automation: "Suspected automation",
  internal_test: "Internal / test",
};

function et(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const secs = (v: number | null) => (v === null ? "—" : v >= 60 ? `${Math.floor(v / 60)}m ${v % 60}s` : `${v}s`);
const shortId = (v: string | null) => (v ? v.slice(0, 8) : "—");

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="rounded-md border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-serif text-2xl font-bold text-primary">{value}</p>{note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}</div>;
}

function RankList({ title, items, note }: { title: string; items: { label: string; sessions: number }[]; note?: string }) {
  return <section><h3 className="font-serif text-lg font-semibold text-primary">{title}</h3>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}{items.length ? <ul className="mt-2 space-y-1 text-sm">{items.slice(0, 10).map((i) => <li key={i.label} className="flex justify-between gap-3"><span className="break-all">{i.label}</span><span>{i.sessions}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">None in this period.</p>}</section>;
}

export default function NoahideResourcesSection({ report, rangeLabel }: { report: NoahideResourcesReport | undefined; rangeLabel: string }) {
  if (!report) return <p className="text-sm text-muted-foreground">Noahide Resources data is not available in this report.</p>;
  const h = report.headline;
  const d = report.diagnostics;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-serif text-2xl font-bold text-primary">Noahide Resources</h2>
        <p className="mt-1 text-sm text-muted-foreground">Visits to {report.path} in {rangeLabel}. Headline numbers count only high-confidence and likely human sessions that loaded this page. A visitor is a browser ID, not a person; nothing here indicates anyone's background. A click shows a link was followed, not that the external page was read. These clicks never count toward PDF opens or Used Torah.</p>
      </section>
      {d.rawSessions === 0 ? <p className="text-sm text-muted-foreground">No visits to this page in the selected period.</p> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Human visitors" value={h.visitors} note={`${h.newVisitors} new · ${h.returningVisitors} returning`} />
          <Kpi label="Visits (sessions)" value={h.sessions} note={`${h.repeatVisitors} visitors came more than once`} />
          <Kpi label="Page views" value={h.pageviews} />
          <Kpi label="Visits that clicked a resource" value={h.anyClickSessions} note={`Click-through ${pct(h.clickThroughRate)} of visits`} />
          {report.destinations.map((dest) => <Kpi key={dest.key} label={`${dest.label} clicks`} value={dest.qualifiedClicks} note={`${dest.clickedSessions} visits · ${dest.uniqueClickers} visitors · ${pct(dest.clickThroughRate)}`} />)}
          <Kpi label="Engaged visits" value={h.engagedSessions} note="Interacted, scrolled or clicked" />
          <Kpi label="Observed focused time (median)" value={secs(h.activeSecondsMedian)} note={`From ${h.activeSecondsSampledSessions} visits with heartbeats; not reading time`} />
        </div>
        <section>
          <h3 className="font-serif text-lg font-semibold text-primary">Resource links</h3>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-3">Destination</th><th className="pr-3">Human clicks</th><th className="pr-3">Visits</th><th className="pr-3">Visitors</th><th className="pr-3">Repeat clicks</th><th className="pr-3">Rate</th><th>Raw clicks</th></tr></thead><tbody>{report.destinations.map((dest) => <tr key={dest.key} className="border-t border-border"><td className="py-1 pr-3">{dest.label}</td><td className="pr-3">{dest.qualifiedClicks}</td><td className="pr-3">{dest.clickedSessions}</td><td className="pr-3">{dest.uniqueClickers}</td><td className="pr-3">{dest.repeatClicks}</td><td className="pr-3">{pct(dest.clickThroughRate)}</td><td>{dest.rawClicks}</td></tr>)}</tbody></table></div>
        </section>
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          <RankList title="Scroll reached" items={report.scrollReached.map((s) => ({ label: `${s.percent}%`, sessions: s.sessions }))} note="Human visits reaching each milestone." />
          <RankList title="How they arrived" items={report.sources} />
          <RankList title="Campaigns (source / medium / campaign)" items={report.campaigns} />
          <RankList title="Devices" items={report.devices} />
          <RankList title="Approximate network location" items={report.locations} note="IP-based; may reflect a carrier, VPN or network exit." />
        </div>
        <section className="rounded-md border border-dashed border-border p-4">
          <h3 className="font-serif text-lg font-semibold text-primary">Diagnostics — raw, unverified</h3>
          <p className="mt-1 text-xs text-muted-foreground">Not reader figures. Shown for auditing only.</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <li>Raw visits: {d.rawSessions} · raw page views: {d.rawPageviews}</li>
            {Object.entries(d.byConfidence).map(([k, v]) => <li key={k}>{CONFIDENCE_LABELS[k]}: {v}</li>)}
            <li>Click-only sessions with no page view (excluded): {d.clickOnlySessionsWithoutPageView}</li>
            <li>Outbound clicks to other destinations (excluded): {d.rejectedOutboundClicks}</li>
            <li>Human visits without a browser ID: {h.sessionsWithoutVisitorId}</li>
          </ul>
        </section>
        <section>
          <h3 className="font-serif text-lg font-semibold text-primary">Recent visits on this page</h3>
          <p className="mt-1 text-xs text-muted-foreground">Latest {report.journeys.length}, all confidence levels. Times are Eastern. IDs are shortened pseudonymous browser/session codes.</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-2">Time (ET)</th><th className="pr-2">Visitor</th><th className="pr-2">Session</th><th className="pr-2">Class</th><th className="pr-2">Source</th><th className="pr-2">Device</th><th className="pr-2">Location (quality)</th><th className="pr-2">Views</th><th className="pr-2">Ask Noah</th><th className="pr-2">Chabad</th><th className="pr-2">Focused</th><th>Scroll</th></tr></thead><tbody>{report.journeys.map((j) => <tr key={j.sessionId} className={`border-t border-border ${j.counted ? "" : "text-muted-foreground"}`}><td className="py-1 pr-2 whitespace-nowrap">{et(j.at)}</td><td className="pr-2 font-mono">{shortId(j.visitorId)}{j.returning ? " ↺" : ""}</td><td className="pr-2 font-mono">{shortId(j.sessionId)}</td><td className="pr-2">{CONFIDENCE_LABELS[j.confidence]}</td><td className="pr-2">{j.source}{j.utm ? ` (${j.utm})` : ""}</td><td className="pr-2">{j.device}</td><td className="pr-2">{j.location} ({j.locationQuality})</td><td className="pr-2">{j.pageviews}</td><td className="pr-2">{j.askNoahClicks}</td><td className="pr-2">{j.chabadClicks}</td><td className="pr-2">{secs(j.activeSeconds)}</td><td>{j.maxScroll ? `${j.maxScroll}%` : "—"}</td></tr>)}</tbody></table></div>
        </section>
      </>}
    </div>
  );
}
