from pathlib import Path
import re

# Returning visitor journeys: show the backend's approximate location.
p = Path('src/components/Phase2ReturningAnalytics.tsx')
s = p.read_text()
old = '''                            ET · {s.source} · {s.device} · {s.activeSeconds}s active
                          </div>
                          {s.pages.length > 0 && ('''
new = '''                            ET · {s.source} · {s.device} · {s.activeSeconds}s active
                          </div>
                          {s.approximateLocation && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Approx. location (network-derived): {s.approximateLocation}
                            </div>
                          )}
                          {s.pages.length > 0 && ('''
if old not in s:
    raise SystemExit('Phase2 journey marker not found')
s = s.replace(old, new, 1)
meth = '''              <p>
                <b className="text-foreground">Lifetime timing:</b> calculated only when canonical
                session 1 is present, so pre-canonical or otherwise missing history is not treated
                as a known lifetime start.
              </p>'''
meth_new = meth + '''
              <p>
                <b className="text-foreground">Approximate location:</b> network-derived location
                reported by the hosting provider for a recorded session. It can be inaccurate and
                may be unavailable for older sessions; it is not an exact address.
              </p>'''
if meth in s:
    s = s.replace(meth, meth_new, 1)
p.write_text(s)

# Focus collection analytics on current-vs-previous collection performance.
traffic = r'''import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { adminCanonicalCollectionTraffic } from "@/integrations/supabase/admin-analytics-canonical";

type Traffic = Awaited<ReturnType<typeof adminCanonicalCollectionTraffic>>;

function pctRatio(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}
function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(iso));
}

function ComparisonCard({
  label,
  current,
  previous,
  note,
}: {
  label: string;
  current: React.ReactNode;
  previous: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-2xl font-bold text-primary">{current}</div>
      <div className="mt-1 text-xs text-muted-foreground">Previous: {previous}</div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

export default function TrafficAnalytics({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<Traffic | null>(null);
  const [parsha, setParsha] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: string | null) => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const result = await adminCanonicalCollectionTraffic({ data: { accessToken, parsha: p } });
        setData(result);
        setParsha(result.selectedParsha);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load collection performance");
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const cur = data?.current;
  const prev = data?.previous;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Collection performance</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Matched collection windows using the canonical first-party event stream.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="traffic-parsha-select">
            Collection
          </label>
          <select
            id="traffic-parsha-select"
            value={parsha ?? ""}
            onChange={(e) => void load(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {(!data || data.parshas.length === 0) && <option value="">No data</option>}
            {data?.parshas.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(parsha)}
            className="rounded-md border border-border px-2 py-1 text-xs"
            aria-label="Refresh collection performance"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {data && cur && prev && data.currentWindow && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{data.selectedParsha}</span> collection
            window: {fmtDate(data.currentWindow.start)}–{fmtDate(data.currentWindow.end)}.
            {data.previousParsha ? (
              <> Compared with <span className="font-semibold text-foreground">{data.previousParsha}</span>.</>
            ) : null}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ComparisonCard
              label="Unique visitors"
              current={cur.uniqueVisitors}
              previous={prev.uniqueVisitors}
              note={`${cur.sessions} sessions now · ${prev.sessions} previous`}
            />
            <ComparisonCard
              label="Sessions"
              current={cur.sessions}
              previous={prev.sessions}
              note={`${pct(cur.engagedSessions, cur.sessions)} engaged now`}
            />
            <ComparisonCard
              label="Download conversion"
              current={pctRatio(cur.downloadConversion)}
              previous={pctRatio(prev.downloadConversion)}
              note={`${cur.downloadingSessions} downloading sessions now`}
            />
            <ComparisonCard
              label="New subscribers"
              current={data.currentSubscribers}
              previous={data.previousSubscribers}
              note={`${pctRatio(data.subscriberConversion)} now · ${pctRatio(data.previousSubscriberConversion)} previous (new subscribers / unique visitors)`}
            />
            <ComparisonCard
              label="Returning visitors"
              current={`${cur.returningVisitors} · ${pct(cur.returningVisitors, cur.uniqueVisitors)}`}
              previous={`${prev.returningVisitors} · ${pct(prev.returningVisitors, prev.uniqueVisitors)}`}
            />
            <ComparisonCard
              label="PDF activity"
              current={`${cur.uniquePdfDownloads} unique PDF downloads`}
              previous={`${prev.uniquePdfDownloads} unique PDF downloads`}
              note={`${cur.downloadActions} download actions · ${cur.pdfAccessingSessions} PDF-accessing sessions now`}
            />
          </div>

          <div className="mt-5 rounded-xl border border-border bg-background/60 p-4">
            <div className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Top pages · selected collection window
            </div>
            {cur.topPages.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No pageviews yet</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                {cur.topPages.map((x) => (
                  <div key={x.path} className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0">
                    <span className="min-w-0 break-all">{x.path}</span>
                    <span className="shrink-0 text-right text-muted-foreground">
                      <b className="text-primary">{x.pageviews}</b> pageviews<br />
                      <b className="text-primary">{x.sessions}</b> sessions
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <details className="mt-4 rounded-xl border border-border bg-background/40 p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-primary">Collection metric definitions</summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <p><b className="text-foreground">Collection window:</b> the matched reporting interval derived for the selected publication collection; all conversion numerators and denominators use that same interval.</p>
              <p><b className="text-foreground">Download conversion:</b> sessions with at least one canonical download action / all sessions in that collection window.</p>
              <p><b className="text-foreground">Unique PDF download:</b> one session+publication pair, deduplicating repeated clicks on the same PDF inside a session.</p>
              <p><b className="text-foreground">Download action:</b> every recorded user-initiated download request, including repeats.</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
'''
Path('src/components/TrafficAnalytics.tsx').write_text(traffic)

# /admin: operational only, with one obvious Site Analytics link.
p = Path('src/routes/admin.tsx')
s = p.read_text()
s = s.replace('import { DownloadAnalytics } from "@/components/DownloadAnalytics";\n', '')
s = s.replace('import TrafficAnalytics from "@/components/TrafficAnalytics";\n', '')
s = s.replace('<TabsTrigger value="subscribers-analytics">Subscribers &amp; Analytics</TabsTrigger>', '<TabsTrigger value="subscribers-analytics">Subscribers</TabsTrigger>')
marker = '        <Tabs defaultValue="this-week" className="w-full">'
link = '''        <div className="flex justify-end">
          <Link
            to="/admin-analytics"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open Site Analytics →
          </Link>
        </div>

'''
if marker not in s:
    raise SystemExit('Admin tabs marker not found')
s = s.replace(marker, link + marker, 1)
old_sections = '''        <section className="parchment-frame">
          <div className="parchment-panel">
            <div className="mb-4 flex justify-end">
              <Link
                to="/admin-analytics"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Open full download dashboard →
              </Link>
            </div>
            <DownloadAnalytics accessToken={accessToken ?? ""} />
          </div>
        </section>
        <section className="parchment-frame">
          <div className="parchment-panel">
            <TrafficAnalytics accessToken={accessToken ?? ""} />
          </div>
        </section>
'''
if old_sections not in s:
    raise SystemExit('Admin duplicate analytics sections marker not found')
s = s.replace(old_sections, '', 1)
p.write_text(s)

# Privacy policy.
p = Path('src/routes/privacy.tsx')
s = p.read_text()
old = '''                        normalized traffic-source category; device category; approximate country
                        and region; and event-specific metadata such as the filter selected, search
                        information, share method, or active-time interval.
                      </p>'''
new = '''                        normalized traffic-source category; device category; and approximate,
                        network-derived country, state or region, city, and postal code. This location
                        can be inaccurate, for example when a mobile carrier or VPN routes traffic
                        elsewhere. The canonical analytics table does not retain the visitor's raw IP
                        address. Event-specific metadata may include the filter selected, search
                        information, share method, or active-time interval.
                      </p>'''
if old not in s:
    raise SystemExit('Privacy analytics paragraph marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# About-page privacy summary.
p = Path('src/routes/about.tsx')
s = p.read_text()
old = '''                    The site collects an email address when you join the weekly notification list,
                    and site usage analytics (page views, downloads) via Google Tag Manager. Emails
                    are used to send the weekly notification when new Divrei Torah are posted.
                    Details are on the{" "}'''
new = '''                    The site collects an email address when you join the weekly notification list,
                    and uses site analytics for usage such as page views and downloads. First-party
                    analytics may include approximate network-derived country, state or region, city,
                    and postal code; this can be inaccurate, and the canonical analytics table does
                    not retain raw IP addresses. Emails are used to send the weekly notification when
                    new Divrei Torah are posted. Details are on the{" "}'''
if old not in s:
    raise SystemExit('About privacy paragraph marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Analytics documentation.
p = Path('docs/analytics-event-schema.md')
s = p.read_text()
s = s.replace('`country`, `region`, `metadata`', '`country`, `region`, `city`, `postal_code`, `metadata`')
loc_note = '''
### Approximate location

Canonical events may store hosting-provider, network-derived `country`, `region`, `city`, and `postal_code`. These values are approximate and can be wrong because of mobile-carrier routing, VPNs, proxies, or ISP topology. The canonical analytics table does **not** retain the visitor's raw IP address or latitude/longitude. Location rankings are aggregated at the session level rather than counting every event as a separate location observation. Historical canonical rows recorded before the richer-location enhancement may have only country/region or may have no city/postal value.
'''
if '### Approximate location' not in s:
    anchor = '## Collection-window traffic (`/admin`)'
    if anchor in s:
        s = s.replace(anchor, loc_note + '\n' + anchor, 1)
    else:
        s += '\n' + loc_note
p.write_text(s)

# Migration source: match production partial indexes.
p = Path('supabase_analytics_events_migration.sql')
s = p.read_text()
for col in ('country', 'region', 'city'):
    pattern = rf'create index if not exists analytics_events_{col}_idx\s*\n\s*on public\.analytics_events \({col}\);'
    repl = f'create index if not exists analytics_events_{col}_idx\n  on public.analytics_events ({col})\n  where {col} is not null;'
    s, n = re.subn(pattern, repl, s)
    if n == 0 and f'analytics_events_{col}_idx' not in s:
        raise SystemExit(f'Migration index marker missing for {col}')
p.write_text(s)
