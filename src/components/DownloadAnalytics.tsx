import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDownloadStats } from "@/integrations/supabase/api.functions";
import { ArrowDown, ArrowUp, Loader2, Minus, RefreshCw, Search, X } from "lucide-react";

type Ev = { key: string; at: string; who: string | null; parsha: string | null; title: string };

type Stats = {
  days: number;
  total: number;
  byPdf: Array<{ id: string | null; title: string; count: number; last: string; key?: string }>;
  events?: Ev[];
  parshas?: string[];
};

export function DownloadAnalytics({ accessToken }: { accessToken: string }) {
  const [raw, setRaw] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [parsha, setParsha] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await adminDownloadStats({
        data: { accessToken, days: 365 },
      })) as Stats;
      setRaw(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load download stats");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const parshas = raw?.parshas ?? [];

  // Default to the current (most recent) parsha week.
  useEffect(() => {
    if (parsha === null && parshas.length) setParsha(parshas[0]!);
  }, [parsha, parshas]);

  const prevParsha = useMemo(() => {
    if (!parsha) return null;
    const i = parshas.indexOf(parsha);
    return i >= 0 && i + 1 < parshas.length ? parshas[i + 1]! : null;
  }, [parsha, parshas]);

  const eventsFor = useCallback(
    (p: string | null) => (raw?.events ?? []).filter((e) => p && e.parsha === p),
    [raw],
  );

  const weekEvents = useMemo(() => eventsFor(parsha), [eventsFor, parsha]);
  const prevEvents = useMemo(() => eventsFor(prevParsha), [eventsFor, prevParsha]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of weekEvents) {
      const day = new Date(e.at).toISOString().slice(0, 10);
      m.set(day, (m.get(day) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [weekEvents]);

  const maxDay = byDay.reduce((m, d) => Math.max(m, d.count), 0);

  const countByTitle = (evs: Ev[]) => {
    const m = new Map<string, number>();
    for (const e of evs) m.set(e.title, (m.get(e.title) ?? 0) + 1);
    return m;
  };

  const rows = useMemo(() => {
    const cur = countByTitle(weekEvents);
    const prev = countByTitle(prevEvents);
    return Array.from(cur.entries())
      .map(([title, count]) => ({ title, count, prev: prev.get(title) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [weekEvents, prevEvents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q));
  }, [rows, search]);

  const total = weekEvents.length;

  const exportCsv = () => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(`Downloads for Parshas ${parsha ?? ""}`);
    lines.push("Downloads per day");
    lines.push("Day,Downloads");
    for (const d of byDay) lines.push(`${d.day},${d.count}`);
    lines.push("");
    lines.push("Downloads per PDF");
    lines.push("PDF Title,This week,Last week,Change");
    for (const r of filtered)
      lines.push(`${escape(r.title)},${r.count},${r.prev},${r.count - r.prev}`);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `downloads-${(parsha ?? "week").replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">Download analytics</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="parsha-select">
            Parsha week
          </label>
          <select
            id="parsha-select"
            value={parsha ?? ""}
            onChange={(e) => setParsha(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-accent focus:outline-none"
          >
            {parshas.length === 0 && <option value="">No data</option>}
            {parshas.map((p) => (
              <option key={p} value={p}>
                Parshas {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
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
            disabled={!raw}
            className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
          >
            CSV
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      {raw && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            <span className="font-semibold text-foreground">{total}</span> downloads for{" "}
            <span className="font-semibold text-foreground">Parshas {parsha ?? "—"}</span> across{" "}
            <span className="font-semibold text-foreground">{rows.length}</span> PDFs.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-sm font-medium mb-2">Downloads per day</h3>
              <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[18rem] text-sm">
                  <tbody>
                    {byDay.length === 0 && (
                      <tr>
                        <td className="p-3 text-muted-foreground">No downloads yet.</td>
                      </tr>
                    )}
                    {byDay.map((d) => (
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
                        <td className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                          {d.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                <h3 className="text-sm font-medium whitespace-nowrap">
                  Downloads per PDF
                </h3>
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
              </div>
              <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-md border border-border [scrollbar-width:thin]">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-3 py-2 text-left font-medium">PDF</th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        This week
                      </th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {prevParsha ? `Parshas ${prevParsha}` : "Last week"}
                      </th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        Change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-3 text-muted-foreground">
                          {search ? "No PDFs match your filter." : "No downloads yet."}
                        </td>
                      </tr>
                    )}
                    {filtered.map((r) => {
                      const diff = r.count - r.prev;
                      return (
                        <tr
                          key={r.title}
                          className="border-b border-border/60 last:border-0 align-top"
                        >
                          <td className="px-3 py-2 font-medium">{r.title}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {r.count}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {r.prev}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 ${
                                diff > 0
                                  ? "text-emerald-600"
                                  : diff < 0
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {diff > 0 ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : diff < 0 ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <Minus className="h-3 w-3" />
                              )}
                              {diff === 0 ? "0" : `${diff > 0 ? "+" : ""}${diff}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-muted-foreground md:hidden">
                Swipe sideways to see all columns →
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
