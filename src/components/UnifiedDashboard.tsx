import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Loader2, Minus, RefreshCw } from "lucide-react";
import { adminDownloadStats, adminGa4Summary } from "@/integrations/supabase/api.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;
const RANGES = [7, 30, 90] as const;

type Totals = {
  users: number;
  sessions: number;
  views: number;
  pdfDownloads: number;
  newsletterSignups: number;
  popupShown: number;
};

type Ga4Result =
  | {
      configured: true;
      totals: Totals;
      previousTotals: Totals;
      daily: Array<{ date: string; sessions: number; users: number; views: number }>;
      topEvents: Array<{ name: string; count: number }>;
    }
  | { configured: false; error: string };

type DownloadStats = {
  events?: Array<{ key: string; at: string; who: string | null }>;
};

const isoDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

const fmtNum = (n: number) => n.toLocaleString();

function pctChange(cur: number, prev: number): number | null {
  if (!prev) return cur ? 100 : null;
  return ((cur - prev) / prev) * 100;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> no prior data
      </span>
    );
  }
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-emerald-700" : "text-destructive",
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(0)}% vs. prior period
    </span>
  );
}

function Tile({
  label,
  value,
  delta,
  hint,
  muted,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/70 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-serif text-2xl font-bold",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </div>
      {delta !== undefined ? <div className="mt-1"><Delta value={delta} /></div> : null}
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function UnifiedDashboard({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState<number>(30);
  const [ga4, setGa4] = useState<Ga4Result | null>(null);
  const [downloads, setDownloads] = useState<DownloadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * DAY_MS);
    return { startDate: isoDay(start), endDate: isoDay(end) };
  }, [days]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [g, d] = await Promise.all([
        adminGa4Summary({ data: { accessToken, startDate, endDate } }) as Promise<Ga4Result>,
        adminDownloadStats({ data: { accessToken, days: days * 2 } }) as Promise<DownloadStats>,
      ]);
      setGa4(g);
      setDownloads(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [accessToken, startDate, endDate, days]);

  useEffect(() => {
    void load();
  }, [load]);

  // In-app downloads split into current / previous windows.
  const dl = useMemo(() => {
    const events = downloads?.events ?? [];
    const endMs = new Date(`${endDate}T23:59:59`).getTime();
    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const prevStartMs = startMs - days * DAY_MS;

    let current = 0;
    let previous = 0;
    const byDay = new Map<string, number>();
    for (const e of events) {
      const t = new Date(e.at).getTime();
      if (t >= startMs && t <= endMs) {
        current += 1;
        const day = isoDay(new Date(t));
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      } else if (t >= prevStartMs && t < startMs) {
        previous += 1;
      }
    }
    return { current, previous, byDay };
  }, [downloads, startDate, endDate, days]);

  const chartData = useMemo(() => {
    const rows: Array<{ date: string; sessions: number; downloads: number }> = [];
    const ga4Daily = ga4 && ga4.configured ? ga4.daily : [];
    const sessionsByDay = new Map(ga4Daily.map((r) => [r.date, r.sessions]));
    for (let i = 0; i < days; i += 1) {
      const d = new Date(new Date(`${startDate}T12:00:00`).getTime() + i * DAY_MS);
      const key = isoDay(d);
      rows.push({
        date: key,
        sessions: sessionsByDay.get(key) ?? 0,
        downloads: dl.byDay.get(key) ?? 0,
      });
    }
    return rows;
  }, [ga4, dl, days, startDate]);

  const configured = !!ga4 && ga4.configured;
  const totals = configured ? (ga4 as Extract<Ga4Result, { configured: true }>).totals : null;
  const prev = configured
    ? (ga4 as Extract<Ga4Result, { configured: true }>).previousTotals
    : null;
  const topEvents = configured
    ? (ga4 as Extract<Ga4Result, { configured: true }>).topEvents
    : [];

  const popupRate =
    totals && totals.popupShown > 0
      ? (totals.newsletterSignups / totals.popupShown) * 100
      : null;
  const prevPopupRate =
    prev && prev.popupShown > 0 ? (prev.newsletterSignups / prev.popupShown) * 100 : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-foreground">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Site traffic (GA4) and in-app downloads in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-background/70 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                className={cn(
                  "rounded px-3 py-1 text-sm transition-colors",
                  days === r
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {ga4 && !ga4.configured ? (
        <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <strong className="text-foreground">GA4 not connected.</strong> {ga4.error} In-app
          download metrics below are still live.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          label="Users"
          value={totals ? fmtNum(totals.users) : "—"}
          delta={totals && prev ? pctChange(totals.users, prev.users) : undefined}
          muted={!totals}
          hint={totals ? undefined : "GA4"}
        />
        <Tile
          label="Sessions"
          value={totals ? fmtNum(totals.sessions) : "—"}
          delta={totals && prev ? pctChange(totals.sessions, prev.sessions) : undefined}
          muted={!totals}
          hint={totals ? undefined : "GA4"}
        />
        <Tile
          label="Page views"
          value={totals ? fmtNum(totals.views) : "—"}
          delta={totals && prev ? pctChange(totals.views, prev.views) : undefined}
          muted={!totals}
          hint={totals ? undefined : "GA4"}
        />
        <Tile
          label="pdf_download events (GA4)"
          value={totals ? fmtNum(totals.pdfDownloads) : "—"}
          delta={totals && prev ? pctChange(totals.pdfDownloads, prev.pdfDownloads) : undefined}
          muted={!totals}
          hint={totals ? undefined : "GA4"}
        />
        <Tile
          label="Downloads recorded (in-app)"
          value={fmtNum(dl.current)}
          delta={pctChange(dl.current, dl.previous)}
          hint="From download_events"
        />
        <Tile
          label="Newsletter signups"
          value={totals ? fmtNum(totals.newsletterSignups) : "—"}
          delta={
            totals && prev ? pctChange(totals.newsletterSignups, prev.newsletterSignups) : undefined
          }
          muted={!totals}
          hint={
            popupRate !== null
              ? `Popup conversion ${popupRate.toFixed(1)}%${
                  prevPopupRate !== null ? ` (was ${prevPopupRate.toFixed(1)}%)` : ""
                }`
              : "GA4"
          }
        />
      </div>

      <div className="mt-6 rounded-md border border-border bg-background/70 p-4">
        <h3 className="font-serif text-base font-bold text-foreground">
          Sessions vs. downloads
        </h3>
        <div className="mt-3 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="sessions"
                name="Sessions (GA4)"
                stroke="hsl(var(--accent))"
                fill="hsl(var(--accent))"
                fillOpacity={0.18}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="downloads"
                name="Downloads (in-app)"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Gold area = GA4 sessions. Line = downloads recorded by the app.
        </p>
      </div>

      {topEvents.length > 0 ? (
        <div className="mt-6 rounded-md border border-border bg-background/70 p-4">
          <h3 className="font-serif text-base font-bold text-foreground">Top GA4 events</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Event</th>
                  <th className="py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {topEvents.map((e) => (
                  <tr key={e.name} className="border-b border-border/50">
                    <td className="py-2 font-medium text-foreground">{e.name}</td>
                    <td className="py-2 text-right tabular-nums">{fmtNum(e.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
