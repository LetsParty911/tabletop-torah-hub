import { useCallback, useEffect, useState } from "react";
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

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-2">{children}</div>
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
        setError(e instanceof Error ? e.message : "Could not load site traffic");
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
          <h2 className="text-lg font-semibold">Site traffic &amp; conversion</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Primary metrics use the canonical first-party event stream.
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
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(parsha)}
            className="rounded-md border border-border px-2 py-1 text-xs"
            aria-label="Refresh analytics"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
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
              <>
                {" "}
                Compared with{" "}
                <span className="font-semibold text-foreground">{data.previousParsha}</span>.
              </>
            ) : null}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Tile title="Audience">
              <p className="font-serif text-3xl font-bold text-primary">{cur.uniqueVisitors}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                unique visitors · {cur.sessions} sessions · {cur.pageviews} pageviews
              </p>
            </Tile>

            <Tile title="Engaged sessions">
              <p className="font-serif text-3xl font-bold text-primary">{cur.engagedSessions}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pct(cur.engagedSessions, cur.sessions)} of sessions
              </p>
            </Tile>

            <Tile title="Download conversion">
              <p className="font-serif text-3xl font-bold text-primary">
                {pctRatio(cur.downloadConversion)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {cur.downloadingSessions} downloading sessions of {cur.sessions} total sessions
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Previous collection: {pctRatio(prev.downloadConversion)}
              </p>
            </Tile>

            <Tile title="PDF activity">
              <p className="font-serif text-3xl font-bold text-primary">{cur.downloadActions}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                download actions · {cur.uniquePdfDownloads} unique session+PDF downloads
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {cur.pdfAccessingSessions} sessions accessed a PDF
              </p>
            </Tile>

            <Tile title="New-subscriber conversion">
              <p className="font-serif text-3xl font-bold text-primary">
                {pctRatio(data.subscriberConversion)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.currentSubscribers} new subscribers / {cur.uniqueVisitors} unique visitors
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Previous collection: {pctRatio(data.previousSubscriberConversion)}
              </p>
            </Tile>

            <Tile title="Returning visitors">
              <p className="font-serif text-3xl font-bold text-primary">
                {pct(cur.returningVisitors, cur.uniqueVisitors)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {cur.returningVisitors} of {cur.uniqueVisitors} visitors had evidence of a prior
                session
              </p>
            </Tile>

            <Tile title="Traffic sources · sessions">
              {cur.sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No source data yet</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {cur.sources.slice(0, 8).map((x) => (
                    <li key={x.label} className="flex justify-between gap-3">
                      <span>{x.label}</span>
                      <span className="font-semibold text-primary">
                        {x.sessions} · {pct(x.sessions, cur.sessions)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tile>

            <Tile title="Device mix · sessions">
              {cur.devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No device data yet</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {cur.devices.map((x) => (
                    <li key={x.label} className="flex justify-between gap-3">
                      <span className="capitalize">{x.label}</span>
                      <span className="font-semibold text-primary">
                        {x.sessions} · {pct(x.sessions, cur.sessions)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tile>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
            <div className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Top pages
            </div>
            {cur.topPages.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No pageviews yet</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                {cur.topPages.map((x) => (
                  <div
                    key={x.path}
                    className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
                  >
                    <span className="min-w-0 break-all">{x.path}</span>
                    <span className="shrink-0 text-right text-muted-foreground">
                      <b className="text-primary">{x.pageviews}</b> pageviews
                      <br />
                      <b className="text-primary">{x.sessions}</b> sessions
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <details className="mt-4 rounded-xl border border-border bg-background/40 p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-primary">
              Metric definitions
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <p>
                <b className="text-foreground">Session:</b> activity grouped under one 30-minute
                inactivity session ID.
              </p>
              <p>
                <b className="text-foreground">Unique visitor:</b> one first-party visitor ID in the
                reporting window.
              </p>
              <p>
                <b className="text-foreground">Returning visitor:</b> visitor with canonical
                evidence that the active session was not the first visitor session.
              </p>
              <p>
                <b className="text-foreground">Downloading session:</b> session containing at least
                one download event.
              </p>
              <p>
                <b className="text-foreground">Unique PDF download:</b> one session+publication
                pair, deduplicating repeat clicks on the same PDF inside a session.
              </p>
              <p>
                <b className="text-foreground">Download action:</b> every recorded download event,
                including repeated downloads.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
