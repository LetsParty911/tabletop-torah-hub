import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminDownloadMinutes } from "@/integrations/supabase/api.functions";

type Point = { minute: string; count: number };

const WINDOWS: Array<{ label: string; minutes: number }> = [
  { label: "15 min", minutes: 15 },
  { label: "60 min", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "12 hours", minutes: 720 },
  { label: "24 hours", minutes: 1440 },
];

function formatTick(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function DownloadsByMinute({ accessToken }: { accessToken: string }) {
  const [minutes, setMinutes] = useState(60);
  const [series, setSeries] = useState<Point[]>([]);
  const [total, setTotal] = useState(0);
  const [peak, setPeak] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const my = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await adminDownloadMinutes({ data: { accessToken, minutes } });
      if (my !== reqId.current) return;
      setSeries((res.series ?? []) as Point[]);
      setTotal(res.total ?? 0);
      setPeak(res.peak ?? 0);
    } catch (e) {
      if (my !== reqId.current) return;
      setError(e instanceof Error ? e.message : "Failed to load minute data");
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [accessToken, minutes]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the short window feeling live without hammering the server.
  useEffect(() => {
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold">Downloads by minute</h3>
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} downloads · peak {peak.toLocaleString()}/min in this window
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.minutes}
              onClick={() => setMinutes(w.minutes)}
              className={
                "rounded-full px-3 py-1.5 text-sm transition-colors " +
                (minutes === w.minutes
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-foreground hover:bg-muted")
              }
            >
              {w.label}
            </button>
          ))}
          <button
            onClick={() => void load()}
            aria-label="Refresh minute chart"
            className="ml-1 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-destructive">{error}</p>
      ) : series.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="minute"
              tickFormatter={formatTick}
              minTickGap={24}
              tick={{ fontSize: 12 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => formatTick(String(v))}
              formatter={(v) => [String(v), "Downloads"]}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
