import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DownloadsDashboard from "@/components/DownloadsDashboard";
import Phase2ReturningAnalytics from "@/components/Phase2ReturningAnalytics";
import VisitorActivitySection from "@/components/admin/VisitorActivitySection";
import AdminReports from "@/components/admin/AdminReports";
import OwnerSummary from "@/components/admin/OwnerSummary";
import AnalyticsHealthPanel from "@/components/admin/AnalyticsHealthPanel";
import CampaignLinkBuilder from "@/components/admin/CampaignLinkBuilder";
import InternalDeviceControl from "@/components/admin/InternalDeviceControl";
import AnalyticsControlCenter from "@/components/admin/AnalyticsControlCenter";
import WeeklyOperationsReport from "@/components/admin/WeeklyOperationsReport";
import { adminAnalyticsReport, type AnalyticsReportRange } from "@/integrations/supabase/admin-analytics-canonical";
import { buildTrackingUrl, formatCountRate } from "@/lib/admin-analytics-display";

type ReportData = Awaited<ReturnType<typeof adminAnalyticsReport>>;
type Detail = ReportData["report"]["details"]["people"][number];
type DetailKey = keyof ReportData["report"]["details"];
const RANGES: Array<{ value: AnalyticsReportRange; label: string }> = [
  { value: "today", label: "FSR Today" }, { value: "1h", label: "FSR Last 1" }, { value: "4h", label: "FSR Last 4" },
  { value: "24h", label: "FSR Last 24" }, { value: "7d", label: "FSR Last 7 Days" }, { value: "yesterday", label: "Yesterday" },
  { value: "collection", label: "This Collection" }, { value: "30d", label: "30 Days" }, { value: "custom", label: "Custom" },
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

function ReportsSection({ accessToken }: { accessToken: string }) {
  return <details className="border-t border-border pt-4 print:open">
    <summary className="cursor-pointer font-serif text-lg font-semibold text-primary print:hidden">Reports · daily and collection</summary>
    <p className="mt-1 text-xs text-muted-foreground print:hidden">Plain-English, printable summaries built from the same canonical filtered analytics.</p>
    <div className="mt-5"><AdminReports accessToken={accessToken} /></div>
  </details>;
}


function Overview({ data, accessToken, openDetail }: { data: ReportData; accessToken: string; openDetail: (key: DetailKey, title: string, description: string) => void }) {
  const { report, comparison } = data;
  const m = report.metrics;
  const story = m.people === 0 ? "There has not been enough reader activity to summarize this period." : `${m.people} ${m.people === 1 ? "person visited" : "people visited"}; ${m.usedTorah} ${m.usedTorah === 1 ? "used" : "used"} Torah, with ${m.pdfOpens} PDF opens and ${m.downloads} download actions.`;
  if (m.sessions === 0) return <div className="space-y-8"><EmptyState /><ReportsSection accessToken={accessToken} /></div>;
  return <div className="space-y-8">
    <section><p className="font-serif text-xl leading-relaxed text-foreground">{story}</p><p className="mt-2 text-sm text-muted-foreground">Compared with the prior matching period: {comparison.people} people and {comparison.downloads} download actions.</p></section>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricButton label="Likely human visitors" value={m.people} note="High-confidence + likely human only" onClick={() => openDetail("people", "People", "The distinct browser visitors included in this report.")} />
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
    <ReportsSection accessToken={accessToken} />
    <footer className="text-xs text-muted-foreground">Headline audience metrics are human-qualified: only high-confidence and likely human sessions count ({m.sessions} of {report.raw.sessions} raw sessions, {report.raw.visitors} raw visitors). Excluded but kept for diagnostics: {report.filteredUncertainSessions} uncertain · {report.filteredAutomationSessions} suspected automation · {report.filteredInternalSessions} internal/test. Any deliberate action or explicit human signal keeps a session counted.</footer>
  </div>;
}

function SukkahSignDownloadsSection({ data }: { data: ReportData }) {
  const c = (data.report as { sukkahSignDownloads?: { letter: number; tabloid: number; total: number } }).sukkahSignDownloads ?? { letter: 0, tabloid: 0, total: 0 };
  return <section className="mt-6 border-y border-border py-5"><h3 className="font-serif text-lg font-semibold text-primary">Sukkah Sign Downloads</h3><p className="mt-1 text-xs text-muted-foreground">Download actions for the Sukkos “Trust in Hashem” sign in the selected period ({data.rangeLabel}), after internal and suspected-automation filtering.</p><div className="mt-3 grid grid-cols-3 gap-3 text-sm"><div><b className="text-xl">{c.letter}</b><span className="block text-xs text-muted-foreground">8.5 × 11</span></div><div><b className="text-xl">{c.tabloid}</b><span className="block text-xs text-muted-foreground">11 × 17</span></div><div><b className="text-xl">{c.total}</b><span className="block text-xs text-muted-foreground">Total</span></div></div></section>;
}

function Publications({ data }: { data: ReportData }) {
  const publications = data.report.publications;
  return <div><h2 className="font-serif text-2xl font-bold text-primary">Publications</h2><p className="mt-1 text-sm text-muted-foreground">What readers saw, selected, opened, and requested to download.</p><SukkahSignDownloadsSection data={data} />{publications.length === 0 ? <div className="mt-6"><EmptyState /></div> : <div className="mt-6 space-y-4">{publications.map((p) => <article key={p.title} className="border-b border-border pb-5"><h3 className="font-serif text-lg font-semibold">{p.title}</h3><div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5"><div><b>{p.impressions}</b><span className="block text-xs text-muted-foreground">Shown</span></div><div><b>{p.clicks}</b><span className="block text-xs text-muted-foreground">Selected</span></div><div><b>{p.uniqueReaders}</b><span className="block text-xs text-muted-foreground">Readers</span></div><div><b>{p.pdfOpens}</b><span className="block text-xs text-muted-foreground">PDF opens</span></div><div><b>{p.downloadActions}</b><span className="block text-xs text-muted-foreground">Download actions</span></div></div><div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"><p>Selection rate: {formatCountRate(p.clickNumerator, p.clickDenominator)}</p><p>Access-to-download: {formatCountRate(p.downloadNumerator, p.downloadDenominator)}</p></div>{p.sources.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Sources: {p.sources.slice(0, 4).map((s) => `${s.label} (${s.sessions})`).join(" · ")}</p>}</article>)}</div>}
    <section className="mt-8"><h3 className="font-serif text-lg font-semibold text-primary">Search outcomes</h3>{data.report.searches.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No searches in this period.</p> : <ul className="mt-2 divide-y divide-border text-sm">{data.report.searches.map((search, index) => <li key={`${search.at}-${index}`} className="flex justify-between gap-3 py-2"><span>“{search.term}”</span><span className="text-xs text-muted-foreground">{search.ledToContent ? "Led to Torah" : "No later content action"}</span></li>)}</ul>}</section>
  </div>;
}

const CHANNEL_PRESETS: Array<{ label: string; source: string; medium: string }> = [
  { label: "WhatsApp", source: "whatsapp", medium: "message" },
  { label: "Email", source: "email", medium: "newsletter" },
  { label: "Sender.net", source: "sender", medium: "email" },
  { label: "Facebook", source: "facebook", medium: "social" },
  { label: "Instagram", source: "instagram", medium: "social" },
  { label: "QR / Print", source: "print", medium: "qr" },
];

function WebsiteSharing({ data }: { data: ReportData }) {
  const sharing = data.report.homepageSharing;
  const figures = [
    { label: "Homepage share clicks", value: sharing.buttonClicks, note: "WhatsApp sharing opened, not confirmed sent" },
    { label: "Browsers clicking Share", value: sharing.clickingBrowsers, note: "Distinct browser visitor IDs" },
    { label: "Tagged-link sessions", value: sharing.linkSessions, note: "Sessions with a page view attributed to the link" },
    { label: "Tagged-link visitors", value: sharing.linkVisitors, note: "Distinct browser IDs attributed to the link" },
    { label: "PDF opens", value: sharing.linkPdfOpens, note: "In tagged-link sessions" },
    { label: "Download actions", value: sharing.linkDownloads, note: "In tagged-link sessions; not confirmed saves" },
  ];

  return <div className="space-y-6">
    <header>
      <h2 className="font-serif text-2xl font-bold text-primary">Website Sharing · ואהבת לרעך כמוך</h2>
      <p className="mt-2 text-sm text-muted-foreground">Selected period: {data.rangeLabel}. These are separate, human-qualified measurements from the site's first-party analytics.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {figures.map((figure) => <div key={figure.label} className="rounded-lg border border-border bg-background/50 p-4">
        <p className="text-xs font-semibold text-muted-foreground">{figure.label}</p>
        <p className="mt-2 font-serif text-3xl font-bold text-primary">{figure.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{figure.note}</p>
      </div>)}
    </div>
    <div className="grid gap-3 border-y border-border py-4 text-sm sm:grid-cols-2">
      <p><b>Last tracked button click:</b> {sharing.lastClickAt ? `${dateTime(sharing.lastClickAt)} ET` : "None in this period"}</p>
      <p><b>Last tagged-link page view:</b> {sharing.lastLinkVisitAt ? `${dateTime(sharing.lastLinkVisitAt)} ET` : "None in this period"}</p>
    </div>
    <p className="text-sm text-muted-foreground">A click opens a prepared WhatsApp message; WhatsApp does not tell the website whether it was actually sent. Tagged-link activity shows the campaign attribution stored by the visitor's browser, not a verified count of messages delivered or recipients. First-party share-button click tracking began with this change; earlier individual-PDF shares are not counted as homepage clicks.</p>
  </div>;
}

function Reach({ data, accessToken }: { data: ReportData; accessToken: string }) {
  const [source, setSource] = useState("community"); const [medium, setMedium] = useState("whatsapp"); const [campaign, setCampaign] = useState(data.rangeLabel); const [copied, setCopied] = useState(false);
  const url = useMemo(() => buildTrackingUrl({ baseUrl: "https://torahforthetable.com/", source, medium, campaign }), [source, medium, campaign]);
  const copy = async () => { if (!url) return; await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <div className="space-y-10"><section><h2 className="font-serif text-2xl font-bold text-primary">Reach</h2><p className="mt-1 text-sm text-muted-foreground">Acquisition, named campaigns, and approximate network location are kept separate.</p></section><div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-4"><section><h3 className="font-serif text-lg font-semibold text-primary">Acquisition sources</h3><ul className="mt-3 space-y-2 text-sm">{data.report.sources.map((item) => <li key={item.label} className="flex justify-between"><span>{item.label}</span><span>{item.sessions} sessions</span></li>)}</ul></section><section><h3 className="font-serif text-lg font-semibold text-primary">Exact link source</h3><p className="mt-1 text-xs text-muted-foreground">The utm_source on tagged links, kept separate from the grouped source.</p>{data.report.utmSources.length ? <ul className="mt-3 space-y-2 text-sm">{data.report.utmSources.map((item) => <li key={item.label} className="flex justify-between gap-3"><span className="break-all">{item.label}</span><span>{item.sessions}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No tagged links in this period.</p>}</section><section><h3 className="font-serif text-lg font-semibold text-primary">Campaign attribution</h3>{data.report.campaigns.length ? <ul className="mt-3 space-y-2 text-sm">{data.report.campaigns.map((item) => <li key={item.label}><div className="flex justify-between gap-3"><span className="break-all">{item.label}</span><span>{item.sessions}</span></div>{item.variants.length > 0 && <ul className="mt-1 space-y-0.5 pl-3 text-xs text-muted-foreground">{item.variants.map((variant) => <li key={variant.content} className="flex justify-between gap-3"><span className="break-all">variant: {variant.content}</span><span>{variant.sessions}</span></li>)}</ul>}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No named campaigns in this period.</p>}</section><section><h3 className="font-serif text-lg font-semibold text-primary">Likely network location</h3><p className="mt-1 text-xs text-muted-foreground">Approximate and may reflect a carrier, VPN, or network exit.</p>{data.report.locations.length ? <ul className="mt-3 space-y-2 text-sm">{data.report.locations.map((item) => <li key={item.label} className="flex justify-between gap-3"><span>{item.label}</span><span>{item.sessions} sessions</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No location data in this period.</p>}</section></div><section className="border-t border-border pt-6"><CampaignLinkBuilder defaultCampaign={data.rangeLabel} /></section><section className="border-t border-border pt-6"><InternalDeviceControl accessToken={accessToken} /></section></div>;
}

function Settings({ accessToken }: { accessToken: string }) {
  const definitions = [["Likely human visitors", "Distinct first-party browser visitor IDs whose sessions are classified high-confidence or likely human. Uncertain, suspected automation and internal/test sessions are excluded from every headline count and rate."], ["Used Torah", "Distinct visitors whose session opened or downloaded a PDF, shared Torah, or signed up."], ["PDF Open", "The publication viewer opened. It is not a download."], ["Download Action", "A user initiated a download request. It does not prove an operating-system save completed."], ["Engaged Session", "A canonical session with meaningful intent or at least two pageviews."], ["Returning Reader", "A visitor with earlier canonical history or explicit non-first-session evidence."], ["Campaign", "Explicit UTM attribution from a named link; never inferred from network location."], ["Campaign variant", "The utm_content label on a link. Variants group under the same source, medium and campaign."], ["Served Download Request", "The application validated the publication and issued the redirect to the file. It does not prove the file finished transferring."], ["Internal / test", "A device an administrator marked with a signed, server-issued marker. Kept for diagnostics, excluded from reader counts."], ["Traffic confidence", "A reporting label — high-confidence human, likely human, uncertain, suspected automation or internal/test. It is recomputed from the raw rows every time and never stamped onto them."]];
  return <div className="space-y-8"><section><h2 className="font-serif text-2xl font-bold text-primary">Definitions &amp; Audit</h2><p className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"><b className="text-foreground">Reporting hierarchy:</b> canonical analytics are the source of truth for visitors, sessions, sources, engagement, publications, and conversions. Legacy tables are retained only for historical audit and diagnostics; never add legacy/raw totals to canonical totals or use them as headline metrics.</p><dl className="mt-4 divide-y divide-border">{definitions.map(([term, definition]) => <div key={term} className="py-3 sm:grid sm:grid-cols-4 sm:gap-4"><dt className="font-semibold text-foreground">{term}</dt><dd className="mt-1 text-sm text-muted-foreground sm:col-span-3 sm:mt-0">{definition}</dd></div>)}</dl></section><section><h3 className="font-serif text-lg font-semibold text-primary">How reports are built</h3><p className="mt-2 text-sm text-muted-foreground">The daily report covers one completed New York calendar day; the collection report covers a completed upload-derived collection window, not a generic Monday–Sunday week. Both read the same canonical filtered analytics used everywhere else, suppress percentages when the denominator is under 10, and describe observations with fixed deterministic rules, never AI opinions.</p></section><section><h3 className="font-serif text-lg font-semibold text-primary">Campaign naming</h3><p className="mt-2 text-sm text-muted-foreground">Use a stable community or channel for source, the delivery method for medium, and the collection or initiative for campaign. Generated names are lowercase and hyphenated.</p></section><section className="border-t border-border pt-6"><AnalyticsHealthPanel accessToken={accessToken} /></section><details className="border-t border-border pt-4"><summary className="cursor-pointer font-serif text-lg font-semibold text-primary">Advanced · returning behavior</summary><div className="mt-5"><Phase2ReturningAnalytics accessToken={accessToken} /></div></details><details className="border-t border-border pt-4"><summary className="cursor-pointer font-serif text-lg font-semibold text-primary">Legacy audit only · raw download events</summary><p className="mt-2 text-xs text-muted-foreground">Historical diagnostic data only. These rows are not the source for headline download, visitor, session, source, or conversion numbers.</p><div className="mt-5"><DownloadsDashboard accessToken={accessToken} /></div></details></div>;
}

export default function AdminAnalyticsReport({ accessToken }: { accessToken: string }) {
  const [range, setRange] = useState<AnalyticsReportRange>("today"); const [customStart, setCustomStart] = useState(""); const [customEnd, setCustomEnd] = useState(""); const [data, setData] = useState<ReportData | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [detail, setDetail] = useState<{ key: DetailKey; title: string; description: string } | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { if (range === "custom" && !customStart) { setLoading(false); return; } setData(await adminAnalyticsReport({ data: { accessToken, range, ...(range === "custom" ? { customStart: new Date(customStart).toISOString(), ...(customEnd ? { customEnd: new Date(customEnd).toISOString() } : {}) } : {}) } })); } catch (e) { setError(e instanceof Error ? e.message : "Could not load analytics."); } finally { setLoading(false); } }, [accessToken, range, customStart, customEnd]);
  useEffect(() => { void load(); }, [load]);
  return <><div className="flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-col gap-2"><div className="flex flex-wrap gap-1">{RANGES.map((item) => <Button key={item.value} size="sm" variant={range === item.value ? "default" : "ghost"} onClick={() => setRange(item.value)}>{item.label}</Button>)}</div>{range === "custom" && <div className="flex flex-wrap items-center gap-2 text-xs"><label>From <input type="datetime-local" className="rounded border border-border bg-background px-2 py-1" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label><label>To <input type="datetime-local" className="rounded border border-border bg-background px-2 py-1" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></label><span className="text-muted-foreground">Your local time; leave “To” empty for now. Up to 92 days.</span></div>}</div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />{loading ? "Loading…" : "Refresh"}</Button></div>{error && <p className="mt-5 text-sm text-destructive">{error}</p>}{!data && !error ? <p className="py-12 text-center text-muted-foreground">Preparing your report…</p> : data && <><p className="mt-5 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><b className="text-foreground">Primary reporting:</b> all headline figures in these tabs come from the canonical analytics stream. Legacy/raw records are isolated under Definitions &amp; Audit for diagnostics only.</p><Tabs defaultValue="control" className="mt-4"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md bg-muted/60 p-1"><TabsTrigger value="control">Control Center</TabsTrigger><TabsTrigger value="weekly">Weekly Ops</TabsTrigger><TabsTrigger value="owner">Owner Summary</TabsTrigger><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="publications">Publications</TabsTrigger><TabsTrigger value="reach">Reach</TabsTrigger><TabsTrigger value="sharing">Website Sharing</TabsTrigger><TabsTrigger value="visitors">Visitors</TabsTrigger><TabsTrigger value="settings">Definitions &amp; Audit</TabsTrigger></TabsList><TabsContent value="owner" className="mt-8"><OwnerSummary data={data} accessToken={accessToken} openDetail={(key, title, description) => setDetail({ key, title, description })} /></TabsContent><TabsContent value="control" className="mt-8"><AnalyticsControlCenter data={data} accessToken={accessToken} /></TabsContent><TabsContent value="weekly" className="mt-8"><WeeklyOperationsReport accessToken={accessToken} /></TabsContent><TabsContent value="overview" className="mt-8"><Overview data={data} accessToken={accessToken} openDetail={(key, title, description) => setDetail({ key, title, description })} /></TabsContent><TabsContent value="publications" className="mt-8"><Publications data={data} /></TabsContent><TabsContent value="reach" className="mt-8"><Reach data={data} accessToken={accessToken} /></TabsContent><TabsContent value="sharing" className="mt-8"><WebsiteSharing data={data} /></TabsContent><TabsContent value="visitors" className="mt-8"><VisitorActivitySection accessToken={accessToken} embedded /></TabsContent><TabsContent value="settings" className="mt-8"><Settings accessToken={accessToken} /></TabsContent></Tabs></>}
    {data && detail && <DetailSheet title={detail.title} description={detail.description} rows={data.report.details[detail.key]} open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }} />}
  </>;
}