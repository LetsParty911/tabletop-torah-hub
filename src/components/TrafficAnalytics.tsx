import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { adminSiteTraffic } from "@/integrations/supabase/api.functions";

type Traffic = Awaited<ReturnType<typeof adminSiteTraffic>>;

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function Change({ current, prev }: { current: number; prev: number }) {
  const diff = current - prev;
  const cls =
    diff > 0 ? "text-accent-foreground" : diff < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`text-xs font-semibold ${cls}`}>
      {diff > 0 ? `▲ +${diff}` : diff < 0 ? `▼ −${Math.abs(diff)}` : "→ even"}
      <span className="text-muted-foreground font-normal"> vs last week ({prev})</span>
    </span>
  );
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

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function List({
  items,
  empty,
}: {
  items: Array<{ label: string; count: number }>;
  empty: string;
}) {
  if (items.length === 0) return <Quiet>{empty}</Quiet>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((i) => (
        <li key={i.label} className="flex items-baseline justify-between gap-3">
          <span className="truncate text-foreground">{i.label}</span>
          <span className="shrink-0 font-semibold text-primary">{i.count}</span>
        </li>
      ))}
    </ul>
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
        const r = await adminSiteTraffic({ data: { accessToken, parsha: p } });
        setData(r);
        setParsha(r.selectedParsha);
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

  const exportCsv = () => {
    if (!data) return;
    const escape = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "created_at",
      "path",
      "referrer_host",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "session_id",
      "visitor_id",
      "is_new_visitor",
      "device_type",
      "city",
      "region",
      "country",
    ];
    const lines = [headers.join(",")];
    for (const r of data.rawRows) {
      lines.push(headers.map((h) => escape((r as Record<string, unknown>)[h] as string)).join(","));
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pageviews-${(data.selectedParsha ?? "week").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cur = data?.current;
  const prev = data?.previous_;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">Site traffic</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="traffic-parsha-select">
            Parsha week
          </label>
          <select
            id="traffic-parsha-select"
            value={parsha ?? ""}
            onChange={(e) => void load(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            {(!data || data.parshas.length === 0) && <option value="">No data</option>}
            {data?.parshas.map((p) => (
              <option key={p} value={p}>
                Parshas {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(parsha)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent"
            aria-label="Refresh"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
          >
            CSV
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      {data && cur && prev && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Parshas <span className="font-semibold text-foreground">{data.selectedParsha ?? "—"}</span>{" "}
            compared with{" "}
            <span className="font-semibold text-foreground">
              {data.previousParsha ? `Parshas ${data.previousParsha}` : "no earlier week"}
            </span>
            .
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1 — Visitors and pageviews */}
            <Tile title="Visitors and pageviews">
              {cur.pageviews === 0 ? (
                <Quiet>No visits recorded this week</Quiet>
              ) : (
                <>
                  <p className="font-serif text-3xl font-bold text-primary">
                    {cur.visitors}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      visitors · {cur.pageviews} pageviews
                    </span>
                  </p>
                  <div className="mt-1">
                    <Change current={cur.visitors} prev={prev.visitors} />
                  </div>
                </>
              )}
            </Tile>

            {/* 2 — Traffic sources */}
            <Tile title="Traffic sources">
              <List items={cur.sources.slice(0, 10)} empty="No sources yet" />
            </Tile>

            {/* 3 — Top pages */}
            <Tile title="Top pages">
              <List items={cur.topPages} empty="No pageviews yet" />
            </Tile>

            {/* 4 — Visit-to-download rate */}
            <Tile title="Visit-to-download rate">
              {cur.visitors === 0 ? (
                <Quiet>No visits to measure</Quiet>
              ) : (
                <>
                  <p className="font-serif text-3xl font-bold text-primary">
                    {pct(data.currentDownloads, cur.visitors)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.currentDownloads} downloads from {cur.visitors} visits · last week{" "}
                    {pct(data.previousDownloads, prev.visitors)}
                  </p>
                </>
              )}
            </Tile>

            {/* 5 — Visit-to-subscriber rate */}
            <Tile title="Visit-to-subscriber rate">
              {cur.visitors === 0 ? (
                <Quiet>No visits to measure</Quiet>
              ) : (
                <>
                  <p className="font-serif text-3xl font-bold text-primary">
                    {pct(data.currentSubscribers, cur.visitors)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.currentSubscribers} new subscribers · last week{" "}
                    {pct(data.previousSubscribers, prev.visitors)}
                  </p>
                </>
              )}
            </Tile>

            {/* 6 — Returning rate */}
            <Tile title="Returning visitors">
              {cur.uniqueVisitors === 0 ? (
                <Quiet>No visitors yet</Quiet>
              ) : (
                <>
                  <p className="font-serif text-3xl font-bold text-primary">
                    {pct(cur.returningVisitors, cur.uniqueVisitors)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cur.returningVisitors} of {cur.uniqueVisitors} were returning · last week{" "}
                    {pct(prev.returningVisitors, prev.uniqueVisitors)}
                  </p>
                </>
              )}
            </Tile>

            {/* 7 — Top cities */}
            <Tile title="Top cities">
              <List items={cur.topCities} empty="No location data yet" />
            </Tile>

            {/* 8 — Mobile vs desktop */}
            <Tile title="Mobile vs desktop">
              {cur.visitors === 0 ? (
                <Quiet>No visits to measure</Quiet>
              ) : (
                <ul className="space-y-1 text-sm">
                  {cur.devices.map((d) => (
                    <li key={d.label} className="flex items-baseline justify-between gap-3">
                      <span className="capitalize text-foreground">{d.label}</span>
                      <span className="font-semibold text-primary">
                        {pct(d.count, cur.visitors)}
                        <span className="font-normal text-muted-foreground"> ({d.count})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tile>
          </div>

          {/* Searches */}
          <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
            <div className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Searches this week
            </div>
            {data.searches.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No searches this week</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.searches.map((s) => (
                  <li key={s.query} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-foreground">
                      {s.query}
                      {s.count > 1 && (
                        <span className="text-muted-foreground"> ×{s.count}</span>
                      )}
                    </span>
                    <span
                      className={
                        s.results === 0
                          ? "shrink-0 font-semibold text-destructive"
                          : "shrink-0 font-semibold text-primary"
                      }
                    >
                      {s.results === 0 ? "no results" : `${s.results} results`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
