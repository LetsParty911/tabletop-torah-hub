import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDownloadStats } from "@/integrations/supabase/api.functions";
import { ArrowDown, ArrowUp, Loader2, RefreshCw } from "lucide-react";

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
  }>;
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
    const lines = ["type,key,count,last,last_downloader"];
    for (const d of stats.byDay) lines.push(`day,${d.day},${d.count},,`);
    for (const p of stats.byPdf)
      lines.push(
        `pdf,"${p.title.replace(/"/g, '""')}",${p.count},${p.last},"${(p.lastWho ?? "").replace(/"/g, '""')}"`,
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
              <h3 className="text-sm font-medium mb-2">Downloads per PDF</h3>
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
                    {sortedByPdf.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-3 text-muted-foreground">
                          No downloads yet.
                        </td>
                      </tr>
                    )}
                    {sortedByPdf.map((p) => (
                      <tr
                        key={p.id ?? p.title}
                        className="border-b border-border/60 last:border-0 align-top"
                      >
                        <td className="px-3 py-2 font-medium">{p.title}</td>
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
    </div>
  );
}
