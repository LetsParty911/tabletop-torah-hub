import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { adminDownloadFeed } from "@/integrations/supabase/api.functions";
import { adminDownloadActionsTodayEt } from "@/integrations/supabase/admin-analytics-canonical";
import DownloadsByMinute from "@/components/DownloadsByMinute";

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
const RANGES: Array<{ label: string; days: number | null }> = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "All time", days: null },
];
const PAGE = 50;

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(iso));
}
function formatPlace(e: Ev): string {
  return [e.city, e.region, e.country].filter(Boolean).join(", ") || "—";
}

export default function DownloadsDashboard({ accessToken }: { accessToken: string }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(30);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const reqId = useRef(0);

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
      const [res, et] = await Promise.all([
        adminDownloadFeed({ data: { accessToken, days, search, limit: PAGE, offset: 0 } }),
        adminDownloadActionsTodayEt({ data: { accessToken } }),
      ]);
      if (my !== reqId.current) return;
      setTotals({ ...(res.totals as Totals), today: et.count });
      setEvents(res.events as Ev[]);
      setHasMore(Boolean(res.hasMore));
    } catch (e) {
      if (my === reqId.current)
        setError(e instanceof Error ? e.message : "Failed to load download audit");
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
      setEvents((old) => [...old, ...(res.events as Ev[])]);
      setHasMore(Boolean(res.hasMore));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const cards = [
    { label: "Download actions · all time", value: totals?.all },
    { label: "Download actions · 30 days", value: totals?.last30 },
    { label: "Download actions · 7 days", value: totals?.last7 },
    { label: "Download actions · today (ET)", value: totals?.today },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-primary">Raw download-action audit</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This section shows legacy/raw download events. One person or session can create multiple
          actions; use the canonical funnel above for conversion.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="mt-1 font-serif text-3xl font-bold text-primary">
              {c.value == null ? "—" : c.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <DownloadsByMinute accessToken={accessToken} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search publication, parsha, or location…"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-9 text-sm"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2"
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
              className={`rounded-full px-3 py-1.5 text-sm ${days === r.days ? "bg-primary text-primary-foreground" : "border border-border"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2 md:hidden">
        {events.map((e) => (
          <div key={e.id} className="rounded-xl border border-border p-3 text-sm">
            <div className="font-semibold text-primary">{e.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatWhen(e.at)} ET · {e.parsha ?? "—"}
              {e.jewishYear ? ` (${e.jewishYear})` : ""}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{formatPlace(e)}</div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-4 py-2">When (ET)</th>
              <th className="px-4 py-2">Publication</th>
              <th className="px-4 py-2">Parsha</th>
              <th className="px-4 py-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-border/70">
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {formatWhen(e.at)}
                </td>
                <td className="px-4 py-2">{e.title}</td>
                <td className="px-4 py-2">
                  {e.parsha ?? "—"}
                  {e.jewishYear ? ` (${e.jewishYear})` : ""}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatPlace(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && events.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          No download actions found for this range.
        </p>
      )}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}Load more
          </button>
        </div>
      )}
    </div>
  );
}
