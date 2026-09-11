import { useCallback, useEffect, useState } from "react";
import { adminPhase2ReturningAnalyticsV2 } from "@/integrations/supabase/phase2-returning-analytics-v2";

type Data = Awaited<ReturnType<typeof adminPhase2ReturningAnalyticsV2>>;
const RANGES = [1, 7, 30, 90, 180, 365];
function pct(n: number, d: number) {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}
function maybe(n: number | null, suffix: string) {
  return n == null ? "—" : `${Math.round(n * 10) / 10}${suffix}`;
}
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-background/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl font-bold text-primary">{value}</div>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function Phase2ReturningAnalytics({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setProblem(null);
    try {
      setData(await adminPhase2ReturningAnalyticsV2({ data: { accessToken, days } }));
    } catch (e) {
      setData(null);
      setProblem(e instanceof Error ? e.message : "Could not load returning analytics.");
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
            The selected range chooses active visitors; earlier canonical history is used to
            determine true return status, original acquisition source, and first download.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${days === d ? "border-accent bg-accent text-accent-foreground" : "border-accent/40 text-primary"}`}
            >
              {d}d
            </button>
          ))}
          <button
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
        <div className="mt-5 space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Active visitors" value={String(data.totals.uniqueVisitors)} />
            <Stat label="Returning visitors" value={String(data.totals.returningVisitors)} />
            <Stat
              label="Return rate"
              value={pct(data.totals.returningVisitors, data.totals.uniqueVisitors)}
            />
            <Stat label="Sessions in range" value={String(data.totals.totalSessions)} />
            <Stat label="Repeat sessions in range" value={String(data.totals.repeatSessions)} />
            <Stat
              label="Visitors ever converted"
              value={String(data.totals.convertedVisitors)}
              note="among visitors active in this range"
            />
            <Stat
              label="Median days to return"
              value={maybe(data.totals.medianDaysToReturn, "d")}
            />
            <Stat
              label="Median lifetime time to first download"
              value={maybe(data.totals.medianHoursToFirstDownload, "h")}
            />
          </div>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">
              Session conversion by lifetime visit stage
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {data.repeatConversion.map((r) => (
                <Stat
                  key={r.key}
                  label={r.key}
                  value={pct(r.convertedSessions, r.sessions)}
                  note={`${r.convertedSessions} downloading sessions / ${r.sessions} sessions`}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">
              Lifetime time to first download
            </h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Stat
                label="First lifetime session"
                value={String(data.timeToConversion.firstSession)}
              />
              <Stat
                label="Later lifetime session"
                value={String(data.timeToConversion.laterSession)}
              />
              <Stat label="No recorded download" value={String(data.timeToConversion.noDownload)} />
            </div>
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">Acquisition cohorts</h3>
            <div className="mt-3 space-y-2">
              {data.cohorts.map((r) => (
                <div
                  key={r.source}
                  className="rounded-xl border border-accent/20 bg-background/40 p-3 text-sm"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-primary">{r.source}</span>
                    <span>{r.visitors} active visitors</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <span>
                      {r.returnedVisitors} returning · {pct(r.returnedVisitors, r.visitors)}
                    </span>
                    <span>
                      {r.convertedVisitors} ever converted · {pct(r.convertedVisitors, r.visitors)}
                    </span>
                    <span>{r.sessions} sessions in range</span>
                    <span>{Math.round(r.avgSessions * 10) / 10} avg sessions</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">
              Returning-visitor publication activity in range
            </h3>
            <div className="mt-3 space-y-2">
              {data.publicationAffinities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No returning-visitor publication activity in this range.
                </p>
              ) : (
                data.publicationAffinities.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-accent/20 bg-background/40 p-3 text-sm"
                  >
                    <div className="font-semibold text-primary">{r.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.returningVisitors} returning visitors · {r.repeatVisitors} repeat visitors
                      · {r.accesses} access pairs · {r.downloads} download pairs
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="font-serif text-lg font-bold text-primary">
              Returning visitor journeys
            </h3>
            <div className="mt-3 space-y-3">
              {data.journeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No returning visitors in this range.
                </p>
              ) : (
                data.journeys.map((j) => (
                  <details
                    key={j.visitor}
                    className="rounded-xl border border-accent/30 bg-background/50 p-3"
                  >
                    <summary className="cursor-pointer">
                      <span className="font-semibold text-primary">Visitor {j.visitor}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {j.source} · {j.sessions} lifetime sessions · {j.totalDownloads} download
                        actions in range
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2 text-sm">
                      {j.sessionJourney.map((s) => (
                        <div
                          key={`${j.visitor}-${s.sessionNumber}`}
                          className="rounded-lg border border-accent/20 p-3"
                        >
                          <div className="font-medium text-primary">
                            Lifetime session {s.sessionNumber}
                            {s.inReportingRange ? " · in selected range" : " · historical"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Intl.DateTimeFormat("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "America/New_York",
                            }).format(new Date(s.startedAt))}{" "}
                            ET · {s.source} · {s.device} · {s.activeSeconds}s active
                          </div>
                          {s.pages.length > 0 && (
                            <div className="mt-1 break-words">Pages: {s.pages.join(" → ")}</div>
                          )}
                          {s.accessed.length > 0 && <div>Accessed: {s.accessed.join(", ")}</div>}
                          {s.downloaded.length > 0 && (
                            <div>Downloaded: {s.downloaded.join(", ")}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))
              )}
            </div>
          </section>

          <details className="rounded-xl border border-accent/30 bg-background/40 p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-primary">
              Methodology &amp; metric definitions
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <p>{data.methodology}</p>
              <p>
                <b className="text-foreground">Returning visitor:</b> an active visitor with at
                least one canonical session before the reporting range.
              </p>
              <p>
                <b className="text-foreground">Repeat session:</b> a session in the selected range
                whose lifetime ordinal is 2 or higher.
              </p>
              <p>
                <b className="text-foreground">Converted visitor:</b> an active visitor with at
                least one recorded download at any point in canonical history.
              </p>
              <p>
                In-range events analyzed: {data.rawEventCount}. Historical events consulted:{" "}
                {data.historicalEventCount}.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
