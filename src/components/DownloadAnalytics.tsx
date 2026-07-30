import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDownloadStats } from "@/integrations/supabase/api.functions";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Search, X } from "lucide-react";

type Stats = {
  days: number;
  total: number;
  byDay: Array<{ day: string; count: number }>;
  byPdf: Array<{
    id: string | null;
    title: string;
    count: number;
    last: string;
    lastWho?: string | null;
    key?: string;
  }>;
  events?: Array<{ key: string; at: string; who: string | null }>;
};

type SortKey = "count" | "last";
type SortDir = "asc" | "desc";

const RANGES = [7, 30, 90] as const;

export function DownloadAnalytics({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });
  const [search, setSearch] = useState("");

  const load = useCallback(
    async (range: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = (await adminDownloadStats({ data: { accessToken, days: range } })) as Stats;
        setStats(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load download stats");
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const maxDay = stats?.byDay.reduce((m, d) => Math.max(m, d.count), 0) ?? 0;

  const sortedByPdf = useMemo(() => {
    if (!stats) return [];
    const list = [...stats.byPdf];
    list.sort((a, b) => {
      if (sort.key === "count") {
        return sort.dir === "asc" ? a.count - b.count : b.count - a.count;
      }
      return sort.dir === "asc"
        ? a.last.localeCompare(b.last)
        : b.last.localeCompare(a.last);
    });
    return list;
  }, [stats, sort]);

  const filteredByPdf = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedByPdf;
    return sortedByPdf.filter((p) => p.title.toLowerCase().includes(q));
  }, [sortedByPdf, search]);

  const [selected, setSelected] = useState<{ key: string; title: string } | null>(null);

  const drilldown = useMemo(() => {
    if (!stats || !selected) return null;
    const evs = (stats.events ?? [])
      .filter((e) => e.key === selected.key)
      .sort((a, b) => b.at.localeCompare(a.at));
    const dayMap = new Map<string, number>();
    for (const e of evs) {
      const day = new Date(e.at).toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    const byDay = Array.from(dayMap.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
    const max = byDay.reduce((m, d) => Math.max(m, d.count), 0);
    return { events: evs, byDay, max };
  }, [stats, selected]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <ArrowUp className="h-3 w-3 opacity-30" />;
    return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const exportCsv = () => {
    if (!stats) return;
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push("Downloads per day");
    lines.push("Day,Downloads");
    for (const d of stats.byDay) lines.push(`${d.day},${d.count}`);
    lines.push("");
    lines.push("Downloads per PDF");
    lines.push("PDF Title,Downloads,Last download,Last downloader");
    for (const p of filteredByPdf)
      lines.push(
        `${escape(p.title)},${p.count},${p.last},${escape(p.lastWho ?? "Anonymous")}`,
      );
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `downloads-${stats.days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">Download analytics</h2>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                days === r
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:border-accent"
              }`}
            >
              {r}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load(days)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent"
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
            disabled={!stats}
            className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
          >
            CSV
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      {stats && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            <span className="font-semibold text-foreground">{stats.total}</span> downloads in the
            last {stats.days} days across{" "}
            <span className="font-semibold text-foreground">{stats.byPdf.length}</span> PDFs.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium mb-2">Downloads per day</h3>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {stats.byDay.length === 0 && (
                      <tr>
                        <td className="p-3 text-muted-foreground">No downloads yet.</td>
                      </tr>
                    )}
                    {stats.byDay.map((d) => (
                      <tr key={d.day} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">{d.day}</td>
                        <td className="px-3 py-2 w-full">
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-accent"
                              style={{ width: `${maxDay ? (d.count / maxDay) * 100 : 0}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                <h3 className="text-sm font-medium">Downloads per PDF</h3>
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter by PDF title…"
                    className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-7 text-sm focus:border-accent focus:outline-none"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Clear filter"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {search && (
                  <span className="text-xs text-muted-foreground">
                    {filteredByPdf.length} of {sortedByPdf.length}
                  </span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-3 py-2 text-left font-medium">PDF</th>
                      <th className="px-3 py-2 text-right font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("count")}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          Downloads <SortIcon active={sort.key === "count"} dir={sort.dir} />
                        </button>
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("last")}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          Last download <SortIcon active={sort.key === "last"} dir={sort.dir} />
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Last downloader</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredByPdf.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-3 text-muted-foreground">
                          {search ? "No PDFs match your filter." : "No downloads yet."}
                        </td>
                      </tr>
                    )}
                    {filteredByPdf.map((p) => (
                      <tr
                        key={p.id ?? p.title}
                        className="border-b border-border/60 last:border-0 align-top"
                      >
                        <td className="px-3 py-2 font-medium">
                          <button
                            type="button"
                            onClick={() =>
                              setSelected({ key: p.key ?? p.id ?? `title:${p.title}`, title: p.title })
                            }
                            className="text-left underline decoration-dotted underline-offset-4 hover:text-accent"
                          >
                            {p.title}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {p.count}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {new Date(p.last).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.lastWho ?? "Anonymous"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {selected && drilldown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
              <div>
                <h3 className="font-semibold">{selected.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {drilldown.events.length} downloads in the last {stats?.days} days
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-5">
              <div>
                <h4 className="text-sm font-medium mb-2">Daily breakdown</h4>
                {drilldown.byDay.length === 0 && (
                  <p className="text-sm text-muted-foreground">No downloads in this range.</p>
                )}
                <div className="space-y-1">
                  {drilldown.byDay.map((d) => (
                    <div key={d.day} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{d.day}</span>
                      <div className="h-2 flex-1 rounded bg-muted">
                        <div
                          className="h-2 rounded bg-accent"
                          style={{ width: `${drilldown.max ? (d.count / drilldown.max) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-semibold tabular-nums">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Exact timestamps</h4>
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-3 py-2 text-left font-medium">When</th>
                      <th className="px-3 py-2 text-left font-medium">Downloader</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.events.map((e, i) => (
                      <tr key={`${e.at}-${i}`} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-1.5 tabular-nums">{new Date(e.at).toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{e.who ?? "Anonymous"}</td>
                      </tr>
                    ))}
                    {drilldown.events.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-muted-foreground">
                          No events.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
