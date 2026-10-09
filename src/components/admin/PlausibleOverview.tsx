import { useState } from "react";
import type { Overview, Headline } from "@/lib/overview-analytics";
import { formatCountRate, shouldShowRate } from "@/lib/admin-analytics-display";

type Row = { label: string; sessions: number; count?: number };

// Approximate IP location, per session. IP/network geolocation can differ from
// the visitor's physical location, especially on cellular, VPN, corporate, or
// ISP gateway networks.
const GEO_NOTE = "Approx. IP location, per session — may differ from the visitor's physical location (cellular, VPN, corporate, ISP gateway).";

function secs(n: number) {
  if (!n) return "—";
  const m = Math.floor(n / 60);
  return m ? `${m}m ${n % 60}s` : `${n}s`;
}
function time(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso)) + " ET";
}
function change(cur: number, prev: number | undefined) {
  if (prev === undefined) return "";
  if (prev < 10) return `prior ${prev}`;
  const d = Math.round(((cur - prev) / prev) * 100);
  return `${d >= 0 ? "+" : ""}${d}% vs prior (${prev})`;
}

function Card({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="rounded-md border border-border bg-background/50 p-3">
    <span className="block text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
    <span className="mt-1 block font-serif text-2xl font-bold text-primary">{value}</span>
    {note && <span className="mt-1 block text-[11px] text-muted-foreground">{note}</span>}
  </div>;
}

function List({ title, rows, note, countLabel }: { title: string; rows: Row[]; note?: string; countLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count ?? r.sessions));
  return <section>
    <h3 className="font-serif text-lg font-semibold text-primary">{title}</h3>
    {note && <p className="text-xs text-muted-foreground">{note}</p>}
    {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None in this period.</p> : <ul className="mt-2 space-y-1 text-sm">
      {rows.map((r) => <li key={r.label} className="relative flex justify-between gap-3 px-2 py-1">
        <span className="absolute inset-y-0 left-0 rounded bg-accent/15" style={{ width: `${((r.count ?? r.sessions) / max) * 100}%` }} />
        <span className="relative break-all">{r.label}</span>
        <span className="relative whitespace-nowrap text-muted-foreground">{r.count !== undefined ? `${r.count} ${countLabel ?? ""} · ` : ""}{r.sessions} sess.</span>
      </li>)}
    </ul>}
  </section>;
}

export default function PlausibleOverview({ overview, prior, rangeLabel }: { overview: Overview; prior?: Headline; rangeLabel: string }) {
  const h = overview.headline;
  const [scrollPath, setScrollPath] = useState("All pages");
  const [funnelStage, setFunnelStage] = useState<{ f: string; i: number } | null>(null);
  const [journey, setJourney] = useState<string | null>(null);
  const scroll = scrollPath === "All pages" ? overview.scroll.overall : overview.scroll.pages.find((p) => p.path === scrollPath) ?? overview.scroll.overall;
  const maxTrend = Math.max(1, ...overview.trend.map((t) => t.visitors));

  return <div className="space-y-10">
    <section className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
      <span>Latest event: {time(overview.recency.latestEventAt)}</span>
      <span>Latest heartbeat: {time(overview.recency.latestHeartbeatAt)}</span>
      <span>Active last 5 min: {overview.recency.activeLast5Min}</span>
      <span>Active last 30 min: {overview.recency.activeLast30Min}</span>
    </section>

    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <Card label="Unique visitors" value={h.visitors} note={change(h.visitors, prior?.visitors)} />
      <Card label="Sessions" value={h.sessions} note={change(h.sessions, prior?.sessions)} />
      <Card label="Pageviews" value={h.pageviews} note={change(h.pageviews, prior?.pageviews)} />
      <Card label="Pages / session" value={h.pagesPerSession} />
      <Card label="Engaged sessions" value={h.engagedSessions} note={formatCountRate(h.engagedSessions, h.sessions)} />
      <Card label="Bounce rate" value={shouldShowRate(h.sessions) ? `${Math.round((h.bouncedSessions / h.sessions) * 100)}%` : `${h.bouncedSessions} of ${h.sessions}`} />
      <Card label="Median engaged time" value={secs(h.medianEngagedSeconds)} note={`avg ${secs(h.averageEngagedSeconds)} · ${h.engagedSessionsWithTime} timed`} />
      <Card label="New / returning" value={`${h.newVisitors} / ${h.returningVisitors}`} />
      <Card label="Counted PDF opens" value={h.countedPdfOpens} note={change(h.countedPdfOpens, prior?.countedPdfOpens)} />
      <Card label="PDF-open rate" value={formatCountRate(h.countedPdfSessions, h.sessions)} note="Visits with a counted open" />
      <Card label="PDF-opening browsers" value={h.countedPdfVisitors} note="Distinct browser visitor IDs" />
      <Card label="Unique PDFs accessed" value={h.countedUniquePdfs} note="Distinct publication IDs in counted actions" />
    </section>

    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Trend · {rangeLabel}</h3>
      <p className="text-xs text-muted-foreground">Visitors per {overview.bucketing === "day" ? "day" : overview.bucketing === "hour" ? "hour" : "5 minutes"} (New York time).</p>
      {overview.trend.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No activity.</p> : <>
        <div className="mt-3 flex h-32 items-end gap-0.5 border-b border-border">
          {overview.trend.map((t) => <div key={t.bucket} title={`${t.bucket}: ${t.visitors} visitors, ${t.pageviews} pageviews, ${t.pdfOpens} counted PDF opens`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${(t.visitors / maxTrend) * 100}%` }} />)}
        </div>
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Show table</summary>
          <table className="mt-2 w-full text-left"><thead><tr className="text-muted-foreground"><th>Period</th><th>Visitors</th><th>Sessions</th><th>Pageviews</th><th>Counted PDF opens</th></tr></thead>
            <tbody>{overview.trend.map((t) => <tr key={t.bucket}><td>{t.bucket}</td><td>{t.visitors}</td><td>{t.sessions}</td><td>{t.pageviews}</td><td>{t.pdfOpens}</td></tr>)}</tbody></table>
        </details>
      </>}
    </section>

    <div className="grid gap-8 md:grid-cols-3">
      <List title="Top pages" rows={overview.pages} countLabel="views" />
      <List title="Landing pages" rows={overview.landingPages} />
      <List title="Exit pages" rows={overview.exitPages} note="Last pageview in each session." />
    </div>

    <div className="grid gap-8 md:grid-cols-3">
      <List title="Sources" rows={overview.acquisition.sources} note="First-touch per session; later navigation never overwrites it." />
      <List title="Referrers" rows={overview.acquisition.referrers} />
      <List title="UTM campaign" rows={overview.acquisition.utmCampaign} />
      <List title="UTM source" rows={overview.acquisition.utmSource} />
      <List title="UTM medium" rows={overview.acquisition.utmMedium} />
      <List title="UTM content" rows={overview.acquisition.utmContent} />
    </div>

    <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
      <List title="Countries" rows={overview.geography.countries} note={GEO_NOTE} />
      <List title="Regions" rows={overview.geography.regions} note={GEO_NOTE} />
      <List title="Cities" rows={overview.geography.cities} note={GEO_NOTE} />
      <List title="Postal codes" rows={overview.geography.postalCodes} note={GEO_NOTE} />
    </div>

    <div className="grid gap-8 md:grid-cols-3">
      <List title="Devices" rows={overview.technology.devices} />
      <List title="Browsers" rows={overview.technology.browsers} />
      <List title="Operating systems" rows={overview.technology.os} />
    </div>

    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-primary">Scroll depth</h3>
        <select className="rounded border border-border bg-background px-2 py-1 text-sm" value={scrollPath} onChange={(e) => setScrollPath(e.target.value)}>
          <option>All pages</option>
          {overview.scroll.pages.map((p) => <option key={p.path} value={p.path}>{p.path} ({p.viewSessions})</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Share of sessions that viewed the page and reached each depth. Each threshold counts once per page view.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([25, 50, 75, 100] as const).map((t) => <Card key={t} label={`${t}%`} value={formatCountRate(scroll.reached[t], scroll.viewSessions)} />)}
        <Card label="Median max depth" value={scroll.medianMaxDepth ? `${scroll.medianMaxDepth}%` : "—"} />
      </div>
    </section>

    <div className="grid gap-8 md:grid-cols-2">
      <List title={`Outbound clicks · ${overview.outbound.clicks}`} rows={overview.outbound.hosts} countLabel="clicks" note={`${overview.outbound.sessions} sessions clicked an external link.`} />
      <List title="Outbound targets" rows={overview.outbound.targets} countLabel="clicks" note="Host and path only; query strings are never stored." />
    </div>

    <section className="space-y-6">
      <h3 className="font-serif text-lg font-semibold text-primary">Funnels</h3>
      {overview.funnels.map((f) => <div key={f.id}>
        <p className="text-sm font-medium">{f.title}</p>
        <ol className="mt-2 grid gap-2 sm:grid-cols-4">
          {f.stages.map((s, i) => <li key={s.label}><button type="button" onClick={() => setFunnelStage(funnelStage?.f === f.id && funnelStage.i === i ? null : { f: f.id, i })} className="w-full rounded-md border border-border p-3 text-left hover:border-accent">
            <span className="block text-xs text-muted-foreground">{s.label}</span>
            <span className="block font-serif text-xl font-bold text-primary">{s.sessions}</span>
            {i > 0 && <span className="block text-[11px] text-muted-foreground">{formatCountRate(s.sessions, f.stages[i - 1]!.sessions)} of prior step</span>}
          </button></li>)}
        </ol>
        {funnelStage?.f === f.id && <ul className="mt-2 divide-y divide-border rounded border border-border text-xs">
          {f.stages[funnelStage.i]!.examples.map((e) => <li key={e.sessionId} className="flex flex-wrap justify-between gap-2 px-2 py-1"><span>{time(e.at)} · {e.source} · {e.landing ?? "—"}</span><button className="underline" onClick={() => setJourney(e.sessionId)}>journey</button></li>)}
        </ul>}
      </div>)}
    </section>

    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Visitor journeys</h3>
      <p className="text-xs text-muted-foreground">Most recent 30 counted sessions. Visitor IDs are first-party browser IDs and can reset; they are not people.</p>
      <ul className="mt-2 divide-y divide-border text-sm">
        {overview.journeys.map((j) => <li key={j.sessionId} className="py-2">
          <button className="w-full text-left" onClick={() => setJourney(journey === j.sessionId ? null : j.sessionId)}>{time(j.startedAt)} · {j.source} · {j.device} · {j.countedPdfOpens} counted PDF opens · {j.steps.length} steps</button>
          {journey === j.sessionId && <ol className="mt-2 space-y-0.5 pl-4 text-xs text-muted-foreground">{j.steps.map((s, i) => <li key={i}>{time(s.at)} — {s.event.replaceAll("_", " ")}{s.label ? ` · ${s.label}` : ""}</li>)}</ol>}
        </li>)}
      </ul>
    </section>

    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Event types</h3>
      <p className="text-xs text-muted-foreground">Every validated canonical event name recorded in this period. Scroll events: {overview.scroll.rawEvents} raw, {overview.scroll.uniqueThresholdEvents} unique page-view thresholds.</p>
      <table className="mt-2 w-full text-left text-sm"><thead><tr className="text-muted-foreground"><th>Event</th><th>Count</th><th>Sessions</th></tr></thead>
        <tbody>{overview.eventCatalog.map((e) => <tr key={e.label}><td>{e.label}</td><td>{e.count}</td><td>{e.sessions}</td></tr>)}</tbody></table>
    </section>
  </div>;
}
