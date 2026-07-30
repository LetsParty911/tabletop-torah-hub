import { useCallback, useEffect, useState } from "react";
import { adminDownloadStats } from "@/integrations/supabase/api.functions";
import { Loader2, RefreshCw } from "lucide-react";

type Stats = {
  days: number;
  total: number;
  byDay: Array<{ day: string; count: number }>;
  byPdf: Array<{ id: string | null; title: string; count: number; last: string }>;
};

const RANGES = [7, 30, 90] as const;

export function DownloadAnalytics({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const exportCsv = () => {
    if (!stats) return;
    const lines = ["type,key,count,last"];
    for (const d of stats.byDay) lines.push(`day,${d.day},${d.count},`);
    for (const p of stats.byPdf)
      lines.push(`pdf,"${p.title.replace(/"/g, '""')}",${p.count},${p.last}`);
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
                      <th className="px-3 py-2 text-right font-medium">Downloads</th>
                      <th className="px-3 py-2 text-right font-medium">Last download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byPdf.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-3 text-muted-foreground">
                          No downloads yet.
                        </td>
                      </tr>
                    )}
                    {stats.byPdf.map((p) => (
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
