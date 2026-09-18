import React, { useCallback, useEffect, useMemo, useState } from "react";
import { adminVisitorActivity } from "@/integrations/supabase/admin-analytics-canonical";
import { formatUaSummary, parseUserAgent } from "@/lib/ua-parse";

type VisitorActivityData = Awaited<ReturnType<typeof adminVisitorActivity>>;
type Visitor = VisitorActivityData["visitors"][number];

const RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
type RangeKey = (typeof RANGES)[number];

const NOT_CAPTURED = "Not captured";

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function clockLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-words text-sm text-foreground/90">{value}</div>
    </div>
  );
}

function VisitorRow({ visitor }: { visitor: Visitor }) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(
    () => parseUserAgent(visitor.latestUserAgent, visitor.latestDeviceType),
    [visitor.latestUserAgent, visitor.latestDeviceType],
  );

  return (
    <li className="rounded-md border border-border/60 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-3 text-left"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{timeLabel(visitor.lastSeenInRange)}</span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
            {visitor.likelyReturning ? "Returning" : visitor.likelyNew ? "New" : "Unknown"}
          </span>
          {visitor.suspectedSessions > 0 && (
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
              Suspected ({visitor.suspectedSessions})
            </span>
          )}
          {visitor.signups > 0 && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-foreground">
              Signed up
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{open ? "Hide" : "Details"}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{visitor.sources.join(", ")}</span>
          <span>{visitor.devices.join(", ")}</span>
          <span>{formatUaSummary(parsed)}</span>
          <span>{visitor.geo.label || "Unknown location"}</span>
          <span>IP {visitor.latestIp ?? NOT_CAPTURED}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/80">
          <span>{visitor.sessionsInRange} sessions</span>
          <span>{visitor.pageviews} pageviews</span>
          <span>{visitor.pdfOpens} PDF opens</span>
          <span>{visitor.downloads} downloads</span>
          <span className="text-muted-foreground">{shortId(visitor.visitorId)}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 px-3 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Visitor ID" value={<code className="text-xs">{visitor.visitorId}</code>} />
            <Field
              label="First / last activity"
              value={`${timeLabel(visitor.firstSeenInRange)} → ${timeLabel(visitor.lastSeenInRange)}`}
            />
            <Field
              label={`IP addresses (${visitor.distinctIpCount})`}
              value={visitor.ips.length ? visitor.ips.join(", ") : NOT_CAPTURED}
            />
            <Field
              label="Browser / OS"
              value={`${parsed.browser} ${parsed.browserVersion} · ${parsed.os} ${parsed.osVersion} · ${parsed.deviceCategory}`}
            />
            <Field
              label={`Raw User-Agent (${visitor.distinctUserAgentCount} distinct)`}
              value={
                <code className="text-[11px] leading-snug">
                  {visitor.latestUserAgent ?? NOT_CAPTURED}
                </code>
              }
            />
            <Field
              label="Location"
              value={
                [visitor.geo.label, visitor.geo.postalCode].filter(Boolean).join(" · ") ||
                "Unknown"
              }
            />
            <Field
              label="Referrer"
              value={visitor.referrerUrl || visitor.referrerHost || "None recorded"}
            />
            <Field
              label="UTM"
              value={
                [visitor.utmSource, visitor.utmMedium, visitor.utmCampaign]
                  .filter(Boolean)
                  .join(" / ") || "None"
              }
            />
          </div>

          {visitor.suspicionReasons.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Suspicion reasons
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm text-destructive">
                {visitor.suspicionReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {visitor.publicationActions.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Publication actions
              </div>
              <ul className="mt-1 space-y-1 text-sm text-foreground/90">
                {visitor.publicationActions.map((a, i) => (
                  <li key={`${a.at}-${i}`}>
                    <span className="text-muted-foreground">{clockLabel(a.at)}</span> {a.action}:{" "}
                    {a.publication}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visitor.searchTerms.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Searches
              </div>
              <ul className="mt-1 space-y-1 text-sm text-foreground/90">
                {visitor.searchTerms.map((s, i) => (
                  <li key={`${s.at}-${i}`}>
                    <span className="text-muted-foreground">{clockLabel(s.at)}</span> “{s.term}”
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visitor.filterChangeDetails.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Filter changes
              </div>
              <ul className="mt-1 space-y-1 text-sm text-foreground/90">
                {visitor.filterChangeDetails.map((f, i) => (
                  <li key={`${f.at}-${i}`}>
                    <span className="text-muted-foreground">{clockLabel(f.at)}</span> {f.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visitor.paths.length > 0 && (
            <Field label="Pages viewed" value={visitor.paths.join(", ")} />
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Session timeline
            </div>
            <div className="mt-1 space-y-3">
              {visitor.sessions.map((s) => (
                <div
                  key={s.sessionId}
                  className="rounded border border-border/50 bg-background/30 p-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <code className="text-[11px]">{shortId(s.sessionId)}</code>
                    <span className="text-muted-foreground">
                      {timeLabel(s.startedAt)} → {clockLabel(s.endedAt)}
                    </span>
                    <span className="text-muted-foreground">{s.pageviews} pageviews</span>
                    {s.suspected && (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                        Suspected
                      </span>
                    )}
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-foreground/85">
                    {s.timeline.map((e, i) => (
                      <li key={`${e.at}-${i}`}>
                        <span className="text-muted-foreground">{clockLabel(e.at)}</span>{" "}
                        {e.event}
                        {e.path ? ` · ${e.path}` : ""}
                        {e.publication ? ` · ${e.publication}` : ""}
                        {e.detail ? ` · ${e.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export default function VisitorActivitySection({ accessToken }: { accessToken: string | null }) {
  const [range, setRange] = useState<RangeKey>("24h");
  const [data, setData] = useState<VisitorActivityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextRange: RangeKey) => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const result = await adminVisitorActivity({ data: { accessToken, range: nextRange } });
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load visitor activity.");
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void load(range);
  }, [load, range]);

  if (!accessToken) return null;

  const totals = data?.totals;

  return (
    <section className="parchment-frame">
      <div className="parchment-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl font-semibold text-primary">Visitor Activity</h2>
          <button
            onClick={() => void load(range)}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1 text-sm text-foreground disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Individual visitor sessions for investigating traffic. Suspected automated sessions are
          labelled, not hidden.
        </p>

        <div className="mt-3 flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md border px-3 py-1 text-sm ${
                r === range
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {totals && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Visitors" value={totals.visitors} />
            <Stat label="Sessions" value={totals.sessions} />
            <Stat label="Pageviews" value={totals.pageviews} />
            <Stat label="PDF opens" value={totals.pdfOpens} />
            <Stat label="Downloads" value={totals.downloads} />
            <Stat label="Signups" value={totals.signups} />
            <Stat label="Suspected" value={totals.suspectedSessions} />
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          IP address and browser details are only available for traffic recorded after the recent
          collection update; older events show “{NOT_CAPTURED}”. Showing the most recent{" "}
          {data?.cap ?? 100} visitors.
        </p>

        {loading && !data ? (
          <p className="mt-4 text-muted-foreground">Loading visitor activity…</p>
        ) : data && data.visitors.length === 0 ? (
          <p className="mt-4 text-muted-foreground">No visitor activity in this range.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data?.visitors.map((v) => <VisitorRow key={v.visitorId} visitor={v} />)}
          </ul>
        )}
      </div>
    </section>
  );
}
