import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminDownloadFeed } from "@/integrations/supabase/api.functions";

type Ev = {
  id: string;
  at: string;
  title: string;
  parsha: string | null;
  jewishYear: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

type Totals = { all: number; last7: number; last30: number; today: number };
type Point = { date: string; count: number };
type Slice = { name: string; count: number };

const RANGES: Array<{ label: string; days: number | null }> = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "All time", days: null },
];

const PAGE = 50;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPlace(e: Ev): string {
  const parts = [e.city, e.region, e.country].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : "—";
}

export default function DownloadsDashboard({ accessToken }: { accessToken: string }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [series, setSeries] = useState<Point[]>([]);
  const [byCountry, setByCountry] = useState<Slice[]>([]);
  const [byRegion, setByRegion] = useState<Slice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(30);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const reqId = useRef(0);

  // Debounce typing so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const my = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await adminDownloadFeed({
        data: { accessToken, days, search, limit: PAGE, offset: 0 },
      });
      if (my !== reqId.current) return;
      setTotals(res.totals as Totals);
      setEvents(res.events as Ev[]);
      setSeries((res.series ?? []) as Point[]);
      setByCountry((res.byCountry ?? []) as Slice[]);
      setByRegion((res.byRegion ?? []) as Slice[]);
      setHasMore(Boolean(res.hasMore));
    } catch (e) {
      if (my !== reqId.current) return;
      setError(e instanceof Error ? e.message : "Failed to load downloads");
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [accessToken, days, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await adminDownloadFeed({
        data: { accessToken, days, search, limit: PAGE, offset: events.length },
      });
      setEvents((prev) => [...prev, ...(res.events as Ev[])]);
      setHasMore(Boolean(res.hasMore));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const cards: Array<{ label: string; value: number | undefined }> = [
    { label: "Total downloads", value: totals?.all },
    { label: "Last 30 days", value: totals?.last30 },
    { label: "Last 7 days", value: totals?.last7 },
    { label: "Today", value: totals?.today },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="mt-1 font-serif text-3xl font-bold text-primary">
              {c.value == null ? "—" : c.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-serif text-lg font-semibold">Downloads over time</h3>
        {series.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No download data for this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="dlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5).replace("-", "/")}
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(d) => String(d)}
                formatter={(v) => [String(v), "Downloads"]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#dlFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {([
          { title: "Top countries", rows: byCountry },
          { title: "Top regions", rows: byRegion },
        ] as const).map((panel) => (
          <div key={panel.title} className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 font-serif text-lg font-semibold">{panel.title}</h3>
            {panel.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No location data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, panel.rows.length * 34)}>
                <BarChart data={panel.rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v) => [String(v), "Downloads"]}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>



      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by publication, parsha, or location…"
            aria-label="Search downloads"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-9 text-sm"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setDays(r.days)}
              className={
                "rounded-full px-3 py-1.5 text-sm transition-colors " +
                (days === r.days
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-foreground hover:bg-muted")
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">When</th>
              <th className="px-4 py-2 font-semibold">Publication</th>
              <th className="px-4 py-2 font-semibold">Parsha</th>
              <th className="px-4 py-2 font-semibold">Location</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-border/70">
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatWhen(e.at)}</td>
                <td className="px-4 py-2">{e.title}</td>
                <td className="whitespace-nowrap px-4 py-2">
                  {e.parsha ?? "—"}
                  {e.jewishYear ? <span className="text-muted-foreground"> ({e.jewishYear})</span> : null}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatPlace(e)}</td>
              </tr>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No downloads found for this range.
                </td>
              </tr>
            )}
            {loading && events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
