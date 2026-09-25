import { useCallback, useEffect, useState } from "react";
import { adminPhase1DashboardV2 } from "@/integrations/supabase/phase1-dashboard-v2";

type Data = Awaited<ReturnType<typeof adminPhase1DashboardV2>>;
const RANGES = [1, 7, 30, 90];

function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}
function ratio(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-background/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl font-bold text-primary">{value}</div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}
function Small({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-accent/20 bg-background/40 p-3">
      <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold text-primary">{value}</div>
      {note && <div className="text-[0.7rem] text-muted-foreground">{note}</div>}
    </div>
  );
}

type BreakRow = {
  key: string;
  sessions: number;
  clicks: number;
  accesses: number;
  uniquePdfDownloads: number;
  downloadActions: number;
  convertedSessions: number;
};
function Breakdown({ title, rows }: { title: string; rows: BreakRow[] }) {
  return (
    <section className="mt-6">
      <h3 className="font-serif text-lg font-bold text-primary">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className="rounded-xl border border-accent/20 bg-background/40 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-primary">{r.key}</span>
                <span>{r.sessions} sessions</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                <span>{r.accesses} access pairs</span>
                <span>{r.uniquePdfDownloads} unique PDF downloads</span>
                <span>{r.downloadActions} download actions</span>
                <span className="font-semibold text-foreground">
                  {pct(r.convertedSessions, r.sessions)} session download conversion
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type LocationRow = {
  key: string;
  sessions: number;
  uniqueVisitors: number;
  convertedSessions: number;
  sessionDownloadConversion: number;
};
function LocationList({ title, rows }: { title: string; rows: LocationRow[] }) {
  return (
    <div className="rounded-xl border border-accent/20 bg-background/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No location data yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.slice(0, 10).map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words">{r.key}</span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                <b className="text-primary">{r.sessions}</b> sessions · {r.uniqueVisitors} visitors
                <br />
                {ratio(r.sessionDownloadConversion)} download conv.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Phase1Funnel({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publicationScope, setPublicationScope] = useState("all");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setProblem(null);
    try {
      setData(await adminPhase1DashboardV2({ data: { accessToken, days } }));
    } catch (e) {
      setData(null);
      setProblem(e instanceof Error ? e.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, days]);
  useEffect(() => {
    void load();
  }, [load]);

  const parshas = data
    ? Array.from(
        new Set(data.publications.map((p) => p.parsha).filter((p): p is string => Boolean(p))),
      )
    : [];
  const pubs = data
    ? publicationScope === "all"
      ? data.publications
      : data.publications.filter((p) => p.parsha === publicationScope)
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Site overview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Canonical first-party events only. Diagnostics and raw counts are further down.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${days === d ? "border-accent bg-accent text-accent-foreground" : "border-accent/40 text-primary"}`}
            >
              {d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-accent/40 px-3 py-1 text-xs font-semibold text-primary"
          >
            Refresh
          </button>
        </div>
      </div>
      {loading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {problem && <p className="mt-3 text-sm text-destructive">{problem}</p>}
      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Card label="Likely human visitors" value={String(data.totals.uniqueVisitors)} />
            <Card label="Sessions" value={String(data.totals.sessions)} />
            <Card
              label="Engaged sessions"
              value={String(data.totals.engagedSessions)}
              note={`${pct(data.totals.engagedSessions, data.totals.sessions)} of sessions`}
            />
            <Card
              label="Session download conversion"
              value={ratio(data.totals.sessionDownloadConversion)}
              note={`${data.totals.downloadingSessions} downloading of ${data.totals.sessions} sessions`}
            />
            <Card
              label="Returning visitors"
              value={String(data.totals.returningVisitors)}
              note={`${pct(data.totals.returningVisitors, data.totals.uniqueVisitors)} of visitors`}
            />
            <Card
              label="New subscribers"
              value={String(data.totals.newSubscribers)}
              note={`${ratio(data.totals.subscriberConversion)} of unique visitors`}
            />
          </div>

          <Breakdown title="By first-touch source" rows={data.bySource} />
          <Breakdown title="By device" rows={data.byDevice} />

          <section className="mt-6">
            <h3 className="font-serif text-lg font-bold text-primary">Locations</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Approximate locations derived from the network request by our hosting provider. They
              can be inaccurate, and older recorded events may have no city or region. Location is
              available for {data.totals.sessionsWithLocation} of {data.totals.sessions} sessions.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <LocationList title="Top countries" rows={data.byCountry} />
              <LocationList title="Top states / regions" rows={data.byRegion} />
              <LocationList title="Top cities" rows={data.byCity} />
            </div>
          </section>

          <section className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-serif text-lg font-bold text-primary">Publication performance</h3>
              {parshas.length > 0 && (
                <label className="text-sm">
                  <span className="mr-2 text-muted-foreground">Collection</span>
                  <select
                    value={publicationScope}
                    onChange={(e) => setPublicationScope(e.target.value)}
                    className="rounded-lg border border-accent/40 bg-background px-3 py-2"
                  >
                    <option value="all">All collections</option>
                    {parshas.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {pubs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No publication data for this selection.
                </p>
              ) : (
                pubs.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-accent/20 bg-background/40 p-3 text-sm"
                  >
                    <div className="font-semibold text-primary">{p.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.parsha, p.series, p.publisher].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <span>{p.impressions} impression pairs</span>
                      <span>{p.clicks} click pairs</span>
                      <span>{p.accesses} access pairs</span>
                      <span>{p.downloads} download pairs</span>
                      <span className="font-semibold">CTR {pct(p.clicks, p.impressions)}</span>
                      <span className="font-semibold">
                        Access→download {pct(p.downloads, p.accesses)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <details className="mt-6 rounded-xl border border-accent/30 bg-background/40 p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-primary">
              Diagnostics &amp; raw counts
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Small
                label="PDF-accessing sessions"
                value={String(data.totals.pdfAccessingSessions)}
                note={pct(data.totals.pdfAccessingSessions, data.totals.sessions)}
              />
              <Small
                label="Downloading sessions"
                value={String(data.totals.downloadingSessions)}
                note={pct(data.totals.downloadingSessions, data.totals.sessions)}
              />
              <Small
                label="Unique PDF downloads"
                value={String(data.totals.uniquePdfDownloads)}
                note="session + publication pairs"
              />
              <Small
                label="Download actions"
                value={String(data.totals.downloadActions)}
                note="raw recorded events"
              />
              <Small
                label="Avg active time / session"
                value={`${Math.round(data.totals.avgActiveSeconds)}s`}
              />
              <Small
                label="Low-confidence sessions"
                value={String(data.totals.lowConfidenceSessions)}
                note="retained, not discarded"
              />
              <Small label="Events recorded" value={String(data.rawEventCount)} />
            </div>
          </details>

          <details className="mt-3 rounded-xl border border-accent/30 bg-background/40 p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-primary">
              Metric definitions
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <p>
                <b className="text-foreground">Session:</b> activity under one 30-minute inactivity
                session ID.
              </p>
              <p>
                <b className="text-foreground">Unique visitor:</b> one persistent first-party
                visitor ID active in the selected range.
              </p>
              <p>
                <b className="text-foreground">Returning visitor:</b> active visitor with a session
                before the range, or canonical non-first-session evidence.
              </p>
              <p>
                <b className="text-foreground">Session download conversion:</b> downloading sessions
                / sessions.
              </p>
              <p>
                <b className="text-foreground">New subscribers:</b> subscriber rows created in the
                selected range. Subscriber conversion divides that by unique visitors in the same
                range.
              </p>
              <p>
                <b className="text-foreground">Unique PDF download:</b> one session+publication
                pair.
              </p>
              <p>
                <b className="text-foreground">Download action:</b> each raw download event,
                including repeats.
              </p>
              <p>
                <b className="text-foreground">Engaged session:</b> positive action, heartbeat, at
                least two pageviews, or at least 10 seconds of tracked active time. Low-confidence
                sessions remain in totals.
              </p>
              <p>
                <b className="text-foreground">Location:</b> approximate country, region, and city
                reported for the network request. No IP address is stored.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
