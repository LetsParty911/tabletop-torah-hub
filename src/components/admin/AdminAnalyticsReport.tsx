import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DownloadsDashboard from "@/components/DownloadsDashboard";
import Phase2ReturningAnalytics from "@/components/Phase2ReturningAnalytics";
import VisitorActivitySection from "@/components/admin/VisitorActivitySection";
import AdminReports from "@/components/admin/AdminReports";
import { adminAnalyticsReport, type AnalyticsReportRange } from "@/integrations/supabase/admin-analytics-canonical";
import { buildTrackingUrl, formatCountRate } from "@/lib/admin-analytics-display";

type ReportData = Awaited<ReturnType<typeof adminAnalyticsReport>>;
type Detail = ReportData["report"]["details"]["people"][number];
type DetailKey = keyof ReportData["report"]["details"];
const RANGES: Array<{ value: AnalyticsReportRange; label: string }> = [
  { value: "1h", label: "Last Hour" }, { value: "today", label: "Today" },
  { value: "collection", label: "This Collection" }, { value: "7d", label: "7 Days" },
];

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(value));
}

function MetricButton({ label, value, note, onClick }: { label: string; value: number; note: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="min-h-32 rounded-md border border-border bg-background/50 p-4 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className="block text-xs font-semibold uppercase text-muted-foreground">{label}</span>
    <span className="mt-2 block font-serif text-3xl font-bold text-primary">{value}</span>
    <span className="mt-2 block text-xs text-muted-foreground">{note} · View details</span>
  </button>;
}

function DetailSheet({ title, description, rows, open, onOpenChange }: { title: string; description: string; rows: Detail[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
      {rows.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">No matching activity in this period.</p> : <ol className="mt-6 space-y-3">
        {rows.map((row, index) => <li key={`${row.sessionId}-${row.at}-${index}`} className="border-b border-border pb-3 text-sm">
          <div className="font-medium text-foreground">{row.publication ?? row.path ?? row.event.replaceAll("_", " ")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{dateTime(row.at)} ET · {row.source}</div>
          {row.reason && <div className="mt-1 text-xs text-foreground/80">Qualified because: {row.reason}</div>}
          <code className="mt-1 block break-all text-[11px] text-muted-foreground">Session {row.sessionId}</code>
        </li>)}
      </ol>}
    </SheetContent>
  </Sheet>;
}

function EmptyState() {
  return <div className="border-y border-border py-12 text-center"><h3 className="font-serif text-xl font-semibold text-primary">Not enough activity yet</h3><p className="mt-2 text-sm text-muted-foreground">Choose a longer period, or check back after more readers visit.</p></div>;
}

function Overview({ data, openDetail }: { data: ReportData; openDetail: (key: DetailKey, title: string, description: string) => void }) {
  const { report, comparison } = data;
  const m = report.metrics;
  const story = m.people === 0 ? "There has not been enough reader activity to summarize this period." : `${m.people} ${m.people === 1 ? "person visited" : "people visited"}; ${m.usedTorah} ${m.usedTorah === 1 ? "used" : "used"} Torah, with ${m.pdfOpens} PDF opens and ${m.downloads} download actions.`;
  if (m.sessions === 0) return <EmptyState />;
  return <div className="space-y-8">
    <section><p className="font-serif text-xl leading-relaxed text-foreground">{story}</p><p className="mt-2 text-sm text-muted-foreground">Compared with the prior matching period: {comparison.people} people and {comparison.downloads} download actions.</p></section>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricButton label="People" value={m.people} note="Distinct browser visitors" onClick={() => openDetail("people", "People", "The distinct browser visitors included in this report.")} />
      <MetricButton label="Used Torah" value={m.usedTorah} note="People who opened, downloaded, shared, or signed up" onClick={() => openDetail("usedTorah", "Used Torah", "Sessions with a qualifying Torah action and the reason each qualified.")} />
      <MetricButton label="PDF Opens" value={m.pdfOpens} note="Viewer opens, not downloads" onClick={() => openDetail("pdfOpens", "PDF Opens", "Every canonical PDF-open event in this period.")} />
      <MetricButton label="Download Actions" value={m.downloads} note="Requests, not verified saves" onClick={() => openDetail("downloads", "Download Actions", "Every canonical user-initiated download request in this period.")} />
    </section>
    <section className="grid gap-6 border-y border-border py-6 md:grid-cols-3">
      <div><h3 className="font-serif text-lg font-semibold text-primary">What happened</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>Sessions</dt><dd>{m.sessions}</dd></div><button className="flex w-full justify-between text-left hover:text-primary" onClick={() => openDetail("engaged", "Engaged Sessions", "Sessions with meaningful intent or at least two pageviews.")}><span>Engaged sessions</span><span>{m.engagedSessions}</span></button><button className="flex w-full justify-between text-left hover:text-primary" onClick={() => openDetail("returning", "Returning Readers", "Visitors with prior canonical history or an explicit non-first-session signal.")}><span>Returning readers</span><span>{m.returningReaders}</span></button><div className="flex justify-between"><dt>Signups</dt><dd>{m.signups}</dd></div></dl></div>
      <div><h3 className="font-serif text-lg font-semibold text-primary">How people arrived</h3><ul className="mt-3 space-y-2 text-sm">{report.sources.slice(0, 5).map((source) => <li key={source.label} className="flex justify-between"><span>{source.label}</span><span>{source.sessions} sessions</span></li>)}</ul></div>
      <div><h3 className="font-serif text-lg font-semibold text-primary">Top publication</h3>{report.publications[0] ? <div className="mt-3 text-sm"><p className="font-medium">{report.publications[0].title}</p><p className="mt-1 text-muted-foreground">{report.publications[0].pdfOpens} opens · {report.publications[0].downloadActions} download actions</p></div> : <p className="mt-3 text-sm text-muted-foreground">No publication activity yet.</p>}</div>
    </section>
    <section><h3 className="font-serif text-lg font-semibold text-primary">Recent activity</h3><ul className="mt-3 divide-y divide-border text-sm">{report.recentActivity.slice(0, 8).map((row, index) => <li key={`${row.at}-${index}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between"><span>{row.event.replaceAll("_", " ")}{row.publication ? ` · ${row.publication}` : row.path ? ` · ${row.path}` : ""}</span><span className="text-xs text-muted-foreground">{dateTime(row.at)} ET</span></li>)}</ul></section>
    <footer className="text-xs text-muted-foreground">Canonical filtered report · {report.raw.sessions} raw sessions · {report.filteredAutomationSessions} suspected automated sessions excluded from headline audience counts. Legitimate PDF and download actions remain protected by the canonical intent rules.</footer>
  </div>;
}

function Publications({ data }: { data: ReportData }) {
  const publications = data.report.publications;
  return <div><h2 className="font-serif text-2xl font-bold text-primary">Publications</h2><p className="mt-1 text-sm text-muted-foreground">What readers saw, selected, opened, and requested to download.</p>{publications.length === 0 ? <div className="mt-6"><EmptyState /></div> : <div className="mt-6 space-y-4">{publications.map((p) => <article key={p.title} className="border-b border-border pb-5"><h3 className="font-serif text-lg font-semibold">{p.title}</h3><div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5"><div><b>{p.impressions}</b><span className="block text-xs text-muted-foreground">Shown</span></div><div><b>{p.clicks}</b><span className="block text-xs text-muted-foreground">Selected</span></div><div><b>{p.uniqueReaders}</b><span className="block text-xs text-muted-foreground">Readers</span></div><div><b>{p.pdfOpens}</b><span className="block text-xs text-muted-foreground">PDF opens</span></div><div><b>{p.downloadActions}</b><span className="block text-xs text-muted-foreground">Download actions</span></div></div><div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"><p>Selection rate: {formatCountRate(p.clickNumerator, p.clickDenominator)}</p><p>Access-to-download: {formatCountRate(p.downloadNumerator, p.downloadDenominator)}</p></div>{p.sources.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Sources: {p.sources.slice(0, 4).map((s) => `${s.label} (${s.sessions})`).join(" · ")}</p>}</article>)}</div>}
    <section className="mt-8"><h3 className="font-serif text-lg font-semibold text-primary">Search outcomes</h3>{data.report.searches.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No searches in this period.</p> : <ul className="mt-2 divide-y divide-border text-sm">{data.report.searches.map((search, index) => <li key={`${search.at}-${index}`} className="flex justify-between gap-3 py-2"><span>“{search.term}”</span><span className="text-xs text-muted-foreground">{search.ledToContent ? "Led to Torah" : "No later content action"}</span></li>)}</ul>}</section>
  </div>;
}

function Reach({ data }: { data: ReportData }) {
  const [source, setSource] = useState("community"); const [medium, setMedium] = useState("whatsapp"); const [campaign, setCampaign] = useState(data.rangeLabel); const [copied, setCopied] = useState(false);
  const url = useMemo(() => buildTrackingUrl({ baseUrl: "https://torahforthetable.com/", source, medium, campaign }), [source, medium, campaign]);
  const copy = async () => { if (!url) return; await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <div className="space-y-10"><section><h2 className="font-serif text-2xl font-bold text-primary">Reach</h2><p className="mt-1 text-sm text-muted-foreground">Acquisition, named campaigns, and approximate network location are kept separate.</p></section><div className="grid gap-8 lg:grid-cols-3"><section><h3 className="font-serif text-lg font-semibold text-primary">Acquisition sources</h3><ul className="mt-3 space-y-2 text-sm">{data.report.sources.map((item) => <li key={item.label} className="flex justify-between"><span>{item.label}</span><span>{item.sessions} sessions</span></li>)}</ul></section><section><h3 className="font-serif text-lg font-semibold text-primary">Campaign attribution</h3>{data.report.campaigns.length ? <ul className="mt-3 space-y-2 text-sm">{data.report.campaigns.map((item) => <li key={item.label} className="flex justify-between gap-3"><span className="break-all">{item.label}</span><span>{item.sessions}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No named campaigns in this period.</p>}</section><section><h3 className="font-serif text-lg font-semibold text-primary">Likely network location</h3><p className="mt-1 text-xs text-muted-foreground">Approximate and may reflect a carrier, VPN, or network exit.</p>{data.report.locations.length ? <ul className="mt-3 space-y-2 text-sm">{data.report.locations.map((item) => <li key={item.label} className="flex justify-between gap-3"><span>{item.label}</span><span>{item.sessions} sessions</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No location data in this period.</p>}</section></div><section className="border-t border-border pt-6"><h3 className="font-serif text-lg font-semibold text-primary">Create a tracking link</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs text-muted-foreground">Channel or community<input value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Medium<input value={medium} onChange={(e) => setMedium(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Campaign or collection<input value={campaign} onChange={(e) => setCampaign(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" /></label></div><div className="mt-3 flex items-start gap-2"><code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 p-3 text-xs">{url ?? "Complete all three fields to create a link."}</code><Button variant="outline" size="icon" onClick={() => void copy()} disabled={!url} aria-label="Copy tracking link">{copied ? <Check /> : <Copy />}</Button></div></section></div>;
}

function Settings({ accessToken }: { accessToken: string }) {
  const definitions = [["People", "Distinct first-party browser visitor IDs in the selected period."], ["Used Torah", "Distinct visitors whose session opened or downloaded a PDF, shared Torah, or signed up."], ["PDF Open", "The publication viewer opened. It is not a download."], ["Download Action", "A user initiated a download request. It does not prove an operating-system save completed."], ["Engaged Session", "A canonical session with meaningful intent or at least two pageviews."], ["Returning Reader", "A visitor with earlier canonical history or explicit non-first-session evidence."], ["Campaign", "Explicit UTM attribution from a named link; never inferred from network location."]];
  return <div className="space-y-8"><section><h2 className="font-serif text-2xl font-bold text-primary">Settings &amp; Definitions</h2><dl className="mt-4 divide-y divide-border">{definitions.map(([term, definition]) => <div key={term} className="py-3 sm:grid sm:grid-cols-4 sm:gap-4"><dt className="font-semibold text-foreground">{term}</dt><dd className="mt-1 text-sm text-muted-foreground sm:col-span-3 sm:mt-0">{definition}</dd></div>)}</dl></section><section className="rounded-md border border-border bg-muted/30 p-4"><h3 className="font-serif text-base font-semibold text-primary">How reports are built</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>The Daily report covers the previous completed local calendar day in America/New_York, daylight saving included.</li><li>The Collection report covers a completed upload-derived Torah collection window, not a generic Monday–Sunday week.</li><li>Reports read the same canonical filtered analytics as every other tab; there is no second source of truth.</li><li>All observations and comparisons are deterministic rules over counts, never AI opinions, and no percentage is shown when the denominator is under 10.</li></ul></section><section><h3 className="font-serif text-lg font-semibold text-primary">Campaign naming</h3><p className="mt-2 text-sm text-muted-foreground">Use a stable community or channel for source, the delivery method for medium, and the collection or initiative for campaign. Generated names are lowercase and hyphenated.</p></section><details className="border-t border-border pt-4"><summary className="cursor-pointer font-serif text-lg font-semibold text-primary">Advanced · returning behavior</summary><div className="mt-5"><Phase2ReturningAnalytics accessToken={accessToken} /></div></details><details className="border-t border-border pt-4"><summary className="cursor-pointer font-serif text-lg font-semibold text-primary">Advanced · raw download audit</summary><div className="mt-5"><DownloadsDashboard accessToken={accessToken} /></div></details></div>;
}

export default function AdminAnalyticsReport({ accessToken }: { accessToken: string }) {
  const [range, setRange] = useState<AnalyticsReportRange>("collection"); const [data, setData] = useState<ReportData | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [detail, setDetail] = useState<{ key: DetailKey; title: string; description: string } | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await adminAnalyticsReport({ data: { accessToken, range } })); } catch (e) { setError(e instanceof Error ? e.message : "Could not load analytics."); } finally { setLoading(false); } }, [accessToken, range]);
  useEffect(() => { void load(); }, [load]);
  return <><div className="flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-1 overflow-x-auto pb-1">{RANGES.map((item) => <Button key={item.value} size="sm" variant={range === item.value ? "default" : "ghost"} onClick={() => setRange(item.value)}>{item.label}</Button>)}</div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />{loading ? "Loading…" : "Refresh"}</Button></div>{error && <p className="mt-5 text-sm text-destructive">{error}</p>}{!data && !error ? <p className="py-12 text-center text-muted-foreground">Preparing your report…</p> : data && <Tabs defaultValue="overview" className="mt-6"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md bg-muted/60 p-1"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="publications">Publications</TabsTrigger><TabsTrigger value="reach">Reach</TabsTrigger><TabsTrigger value="visitors">Visitors</TabsTrigger><TabsTrigger value="reports">Reports</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList><TabsContent value="overview" className="mt-8"><Overview data={data} openDetail={(key, title, description) => setDetail({ key, title, description })} /></TabsContent><TabsContent value="publications" className="mt-8"><Publications data={data} /></TabsContent><TabsContent value="reach" className="mt-8"><Reach data={data} /></TabsContent><TabsContent value="visitors" className="mt-8"><VisitorActivitySection accessToken={accessToken} embedded /></TabsContent><TabsContent value="reports" className="mt-8"><AdminReports accessToken={accessToken} /></TabsContent><TabsContent value="settings" className="mt-8"><Settings accessToken={accessToken} /></TabsContent></Tabs>}
    {data && detail && <DetailSheet title={detail.title} description={detail.description} rows={data.report.details[detail.key]} open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} />}
  </>;
}