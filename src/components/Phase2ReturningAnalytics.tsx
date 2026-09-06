import { useCallback, useEffect, useState } from "react";
import { adminPhase2ReturningAnalytics } from "@/integrations/supabase/phase2-returning-analytics";

type Phase2Data = Awaited<ReturnType<typeof adminPhase2ReturningAnalytics>>;
type OkData = Extract<Phase2Data, { ok: true }>;

const RANGES = [30, 90, 180, 365];

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function fmtMaybe(n: number | null, suffix: string): string {
  if (n == null) return "—";
  return `${Math.round(n * 10) / 10}${suffix}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-background/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-2xl font-bold text-primary">{value}</div>
    </div>
  );
}

export default function Phase2ReturningAnalytics({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<OkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setProblem(null);
    try {
      const result = await adminPhase2ReturningAnalytics({ data: { accessToken, days } });
      setData(result);
    } catch (error) {
      setData(null);
      setProblem(error instanceof Error ? error.message : "Could not load Phase 2 analytics.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Returning Visitor Behavior</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Repeat visits, acquisition cohorts, conversion timing, and multi-session journeys.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                days === d
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-accent/40 text-primary hover:bg-accent/10"
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-accent/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-accent/10"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {problem && <p className="mt-3 text-sm text-muted-foreground">{problem}</p>}

      {data && (
        <div className="mt-5 space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Visitors" value={String(data.totals.uniqueVisitors)} />
            <Stat label="Returning visitors" value={String(data.totals.returningVisitors)} />
            <Stat label="Return rate" value={`${Math.round(data.totals.returnRate * 1000) / 10}%`} />
            <Stat label="Repeat sessions" value={String(data.totals.repeatSessions)} />
            <Stat label="Converted visitors" value={String(data.totals.convertedVisitors)} />
            <Stat
              label="Visitor conversion"
              value={`${Math.round(data.totals.visitorConversionRate * 1000) / 10}%`}
            />
            <Stat label="Median days to return" value={fmtMaybe(data.totals.medianDaysToReturn, "d")} />
            <Stat
              label="Median time to first download"
              value={fmtMaybe(data.totals.medianHoursToFirstDownload, "h")}
            />
          </div>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">Repeat-session conversion</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Visit stage</th>
                    <th className="py-2 pr-3">Sessions</th>
                    <th className="py-2 pr-3">Sessions with download</th>
                    <th className="py-2">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.repeatConversion.map((row) => (
                    <tr key={row.key} className="border-t border-accent/20">
                      <td className="py-2 pr-3 font-medium text-primary">{row.key}</td>
                      <td className="py-2 pr-3">{row.sessions}</td>
                      <td className="py-2 pr-3">{row.convertedSessions}</td>
                      <td className="py-2">{pct(row.convertedSessions, row.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">Time to first download</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Stat label="First session" value={String(data.timeToConversion.firstSession)} />
              <Stat label="Later session" value={String(data.timeToConversion.laterSession)} />
              <Stat label="No download" value={String(data.timeToConversion.noDownload)} />
            </div>
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">Acquisition cohorts</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Visitors</th>
                    <th className="py-2 pr-3">Returned</th>
                    <th className="py-2 pr-3">Return rate</th>
                    <th className="py-2 pr-3">Converted</th>
                    <th className="py-2 pr-3">Conversion</th>
                    <th className="py-2">Avg sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((row) => (
                    <tr key={row.source} className="border-t border-accent/20">
                      <td className="py-2 pr-3 font-medium text-primary">{row.source}</td>
                      <td className="py-2 pr-3">{row.visitors}</td>
                      <td className="py-2 pr-3">{row.returnedVisitors}</td>
                      <td className="py-2 pr-3">{pct(row.returnedVisitors, row.visitors)}</td>
                      <td className="py-2 pr-3">{row.convertedVisitors}</td>
                      <td className="py-2 pr-3">{pct(row.convertedVisitors, row.visitors)}</td>
                      <td className="py-2">{Math.round(row.avgSessions * 10) / 10}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">Returning visitor publication interests</h3>
            {data.publicationAffinities.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Not enough returning-visitor publication activity yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Publication</th>
                      <th className="py-2 pr-3">Returning visitors</th>
                      <th className="py-2 pr-3">Repeat visitors</th>
                      <th className="py-2 pr-3">Accesses</th>
                      <th className="py-2">Downloads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.publicationAffinities.map((row) => (
                      <tr key={row.id} className="border-t border-accent/20">
                        <td className="py-2 pr-3">
                          <span className="font-medium text-primary">{row.title}</span>
                          {(row.series || row.publisher) && (
                            <span className="block text-xs text-muted-foreground">
                              {[row.series, row.publisher].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{row.returningVisitors}</td>
                        <td className="py-2 pr-3">{row.repeatVisitors}</td>
                        <td className="py-2 pr-3">{row.accesses}</td>
                        <td className="py-2">{row.downloads}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">Returning visitor journeys</h3>
            {data.journeys.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No multi-session visitors in this range yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {data.journeys.map((journey) => (
                  <details key={journey.visitor} className="rounded-xl border border-accent/30 bg-background/50 p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-primary">Visitor {journey.visitor}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {journey.source} · {journey.firstDevice}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {journey.sessions} sessions · {journey.totalDownloads} downloads
                        </div>
                      </div>
                    </summary>
                    <div className="mt-3 space-y-2 text-sm">
                      {journey.sessionJourney.map((session) => (
                        <div key={`${journey.visitor}-${session.sessionNumber}`} className="rounded-lg border border-accent/20 px-3 py-2">
                          <div className="font-medium text-primary">
                            Session {session.sessionNumber} · {new Date(session.startedAt).toLocaleString()}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {session.source} · {session.device} · {session.activeSeconds}s active
                          </div>
                          {session.pages.length > 0 && (
                            <div className="mt-1">Pages: {session.pages.join(" → ")}</div>
                          )}
                          {session.clicked.length > 0 && <div>Clicked: {session.clicked.join(", ")}</div>}
                          {session.accessed.length > 0 && <div>Accessed: {session.accessed.join(", ")}</div>}
                          {session.downloaded.length > 0 && <div>Downloaded: {session.downloaded.join(", ")}</div>}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-muted-foreground">Events analyzed: {data.rawEventCount}</p>
        </div>
      )}
    </div>
  );
}
