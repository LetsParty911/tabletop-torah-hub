import { useCallback, useEffect, useState } from "react";
import { adminPhase1Funnel } from "@/integrations/supabase/api.functions";
import { adminPhase1SessionFunnel } from "@/integrations/supabase/phase1-session-funnel";

type FunnelData = Awaited<ReturnType<typeof adminPhase1Funnel>>;
type OkData = Extract<FunnelData, { ok: true }>;
type SessionFunnelData = Awaited<ReturnType<typeof adminPhase1SessionFunnel>>;

const RANGES = [1, 7, 30, 90];

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-background/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl font-bold text-primary">{value}</div>
    </div>
  );
}

function BreakdownTable({
  title,
  keyLabel,
  rows,
}: {
  title: string;
  keyLabel: string;
  rows: Array<{
    key: string;
    sessions: number;
    clicks: number;
    accesses: number;
    downloads: number;
  }>;
}) {
  return (
    <div className="mt-6">
      <h3 className="font-serif text-lg font-bold text-primary">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No data yet for this range.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">{keyLabel}</th>
                <th className="py-2 pr-3">Sessions</th>
                <th className="py-2 pr-3">Clicks</th>
                <th className="py-2 pr-3">PDF accesses</th>
                <th className="py-2 pr-3">Downloads</th>
                <th className="py-2">Download rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-accent/20">
                  <td className="py-2 pr-3 font-medium text-primary">{r.key}</td>
                  <td className="py-2 pr-3">{r.sessions}</td>
                  <td className="py-2 pr-3">{r.clicks}</td>
                  <td className="py-2 pr-3">{r.accesses}</td>
                  <td className="py-2 pr-3">{r.downloads}</td>
                  <td className="py-2">{pct(r.downloads, r.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Phase1Funnel({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<OkData | null>(null);
  const [sessionFunnel, setSessionFunnel] = useState<SessionFunnelData["funnel"] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publicationScope, setPublicationScope] = useState("all");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setProblem(null);
    try {
      const [r, sessionResult] = await Promise.all([
        adminPhase1Funnel({ data: { accessToken, days } }),
        adminPhase1SessionFunnel({ data: { accessToken, days } }),
      ]);
      if (r.ok) {
        setData(r);
        setSessionFunnel(sessionResult.funnel);
      } else {
        setData(null);
        setSessionFunnel(null);
        setProblem(r.reason);
      }
    } catch (e) {
      setData(null);
      setSessionFunnel(null);
      setProblem(e instanceof Error ? e.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const f = sessionFunnel;
  const publicationParshas = data
    ? Array.from(
        new Set(
          data.publications
            .map((publication) => publication.parsha)
            .filter((parsha): parsha is string => Boolean(parsha)),
        ),
      )
    : [];
  const selectedPublicationParsha = publicationScope === "all" ? null : publicationScope;
  const visiblePublications = data
    ? selectedPublicationParsha
      ? data.publications.filter((publication) => publication.parsha === selectedPublicationParsha)
      : data.publications
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-bold text-primary">Visitor Funnel</h2>
        <div className="flex items-center gap-2">
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
      {problem && (
        <p className="mt-3 text-sm text-muted-foreground">
          No funnel data available yet ({problem}).
        </p>
      )}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Unique visitors" value={String(data.totals.uniqueVisitors)} />
            <Card label="Engaged visitors" value={String(f?.engagedVisitors ?? 0)} />
            <Card label="Sessions" value={String(data.totals.sessions)} />
            <Card label="Engaged sessions" value={String(f?.engagedSessions ?? 0)} />
            <Card label="Low-confidence sessions" value={String(f?.lowConfidenceSessions ?? 0)} />
            <Card
              label="Returning visitors"
              value={String(f?.returningVisitors ?? data.totals.returningVisitors)}
            />
            <Card label="PDF accesses" value={String(data.totals.pdfAccesses)} />
            <Card label="Downloads" value={String(data.totals.downloads)} />
            <Card
              label="Session → download"
              value={`${Math.round(data.totals.conversionRate * 1000) / 10}%`}
            />
            <Card
              label="Avg active time / session"
              value={`${Math.round(data.totals.avgActiveSeconds)}s`}
            />
            <Card label="Events recorded" value={String(data.rawEventCount)} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Engaged = a positive interaction, heartbeat, 2+ page views, or at least 10 seconds of tracked activity. Low-confidence = under 10 seconds, no heartbeat or positive action, and at most one page view. Raw traffic is still retained.
          </p>

          {f && (
            <div className="mt-6">
              <h3 className="font-serif text-lg font-bold text-primary">Session activity</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Percentages below are each measured against all sessions. Visitors can open a PDF directly, so these are not forced into an artificial step-by-step funnel.
              </p>
              <div className="mt-2 space-y-1 text-sm">
                {[
                  { label: "Sessions", value: f.sessions },
                  { label: "Sessions that saw a publication", value: f.impressions },
                  { label: "Sessions that clicked a publication", value: f.clicks },
                  { label: "Sessions that accessed a PDF", value: f.accesses },
                  { label: "Sessions that downloaded", value: f.downloads },
                ].map((step) => (
                  <div
                    key={step.label}
                    className="flex items-center justify-between rounded-lg border border-accent/25 bg-background/50 px-3 py-2"
                  >
                    <span className="font-medium text-primary">{step.label}</span>
                    <span className="text-muted-foreground">
                      {step.value}
                      {step.label !== "Sessions" && <> · {pct(step.value, f.sessions)}</>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <BreakdownTable title="By source" keyLabel="Source" rows={data.bySource} />
          <BreakdownTable title="By device" keyLabel="Device" rows={data.byDevice} />

          <div className="mt-6">
            <h3 className="font-serif text-lg font-bold text-primary">New vs returning</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Visitor</th>
                    <th className="py-2 pr-3">Sessions</th>
                    <th className="py-2 pr-3">PDF accesses</th>
                    <th className="py-2 pr-3">Downloads</th>
                    <th className="py-2">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.newVsReturning.map((r) => (
                    <tr key={r.key} className="border-t border-accent/20">
                      <td className="py-2 pr-3 font-medium capitalize text-primary">{r.key}</td>
                      <td className="py-2 pr-3">{r.sessions}</td>
                      <td className="py-2 pr-3">{r.accesses}</td>
                      <td className="py-2 pr-3">{r.downloads}</td>
                      <td className="py-2">{pct(r.convertedSessions, r.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="font-serif text-lg font-bold text-primary">Publication performance</h3>
            {publicationParshas.length > 0 && (
              <label className="mt-3 flex w-full flex-col gap-1 text-sm font-medium text-primary sm:max-w-xs">
                <span>Show collection</span>
                <select
                  value={publicationScope}
                  onChange={(event) => setPublicationScope(event.target.value)}
                  className="w-full rounded-lg border border-accent/40 bg-background px-3 py-2 text-base text-primary"
                >
                  <option value="all">All collections</option>
                  {publicationParshas.map((parsha) => (
                    <option key={parsha} value={parsha}>
                      {parsha}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {visiblePublications.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No publication data yet for {selectedPublicationParsha ?? "this range"}.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Publication</th>
                      <th className="py-2 pr-3">Parsha</th>
                      <th className="py-2 pr-3">Impressions</th>
                      <th className="py-2 pr-3">Clicks</th>
                      <th className="py-2 pr-3">PDF accesses</th>
                      <th className="py-2 pr-3">Downloads</th>
                      <th className="py-2 pr-3">CTR</th>
                      <th className="py-2">Download rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePublications.map((p) => (
                      <tr key={p.id} className="border-t border-accent/20">
                        <td className="py-2 pr-3">
                          <span className="font-medium text-primary">{p.title}</span>
                          {(p.series || p.publisher) && (
                            <span className="block text-xs text-muted-foreground">
                              {[p.series, p.publisher].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{p.parsha ?? "—"}</td>
                        <td className="py-2 pr-3">{p.impressions}</td>
                        <td className="py-2 pr-3">{p.clicks}</td>
                        <td className="py-2 pr-3">{p.accesses}</td>
                        <td className="py-2 pr-3">{p.downloads}</td>
                        <td className="py-2 pr-3">{pct(p.clicks, p.impressions)}</td>
                        <td className="py-2">{pct(p.downloads, Math.max(p.clicks, p.accesses))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
