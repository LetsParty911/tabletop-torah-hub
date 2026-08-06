import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { day: string; count: number };

const dayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function DownloadTimeline({
  from,
  to,
  byDay,
  pdfs,
  events,
}: {
  from: Date;
  to: Date;
  byDay: Point[];
  pdfs: Array<{ key?: string; id: string | null; title: string }>;
  events?: Array<{ key: string; at: string }>;
}) {
  const [pdfKey, setPdfKey] = useState<string>("");
  const [avgWindow, setAvgWindow] = useState<0 | 3 | 7>(0);
  const [spikes, setSpikes] = useState(false);

  const fromTime = from.getTime();
  const toTime = to.getTime();

  const series = useMemo(() => {
    const totals = new Map(byDay.map((d) => [d.day, d.count]));

    const pdfTotals = new Map<string, number>();
    if (pdfKey) {
      for (const e of events ?? []) {
        if (e.key !== pdfKey) continue;
        const day = new Date(e.at).toISOString().slice(0, 10);
        pdfTotals.set(day, (pdfTotals.get(day) ?? 0) + 1);
      }
    }

    const out: Array<{
      day: string;
      label: string;
      total: number;
      pdf?: number;
      avg?: number;
      spike?: boolean;
      z?: number;
    }> = [];
    const start = new Date(fromTime);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toTime);
    end.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      out.push({
        day: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        total: totals.get(key) ?? 0,
        ...(pdfKey ? { pdf: pdfTotals.get(key) ?? 0 } : {}),
      });
    }

    if (avgWindow > 0) {
      for (let i = 0; i < out.length; i++) {
        const s = Math.max(0, i - avgWindow + 1);
        const slice = out.slice(s, i + 1);
        const sum = slice.reduce((acc, p) => acc + p.total, 0);
        out[i].avg = Math.round((sum / slice.length) * 10) / 10;
      }
    }

    if (spikes) {
      const W = 7;
      for (let i = 0; i < out.length; i++) {
        const base = out.slice(Math.max(0, i - W), i).map((p) => p.total);
        if (base.length < 3) continue;
        const mean = base.reduce((a, b) => a + b, 0) / base.length;
        const variance =
          base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length;
        const sd = Math.sqrt(variance);
        // Guard against zero-variance baselines (all-equal history)
        const denom = sd > 0 ? sd : Math.max(1, Math.sqrt(Math.max(mean, 1)));
        const z = (out[i].total - mean) / denom;
        out[i].z = Math.round(z * 10) / 10;
        if (z >= 2 && out[i].total >= Math.max(3, mean + 2)) out[i].spike = true;
      }
    }

    return out;
  }, [byDay, fromTime, toTime, events, pdfKey, avgWindow, spikes]);

  const spikeDays = useMemo(() => series.filter((p) => p.spike), [series]);

  const peak = series.reduce((m, p) => (p.total > m.total ? p : m), series[0] ?? { day: "", total: 0 });

  // 95th-percentile clamp: keeps a single huge day from flattening the rest.
  const p95 = useMemo(() => {
    const vals = series.map((p) => p.total).sort((a, b) => a - b);
    if (vals.length === 0) return 0;
    const idx = Math.min(vals.length - 1, Math.floor(0.95 * (vals.length - 1)));
    return Math.max(1, vals[idx]);
  }, [series]);

  const outliers = useMemo(
    () => (clamp ? series.filter((p) => p.total > p95) : []),
    [clamp, series, p95],
  );

  const yDomain: [number, number | "auto"] = clamp
    ? [0, Math.ceil(p95 * 1.15)]
    : [0, "auto"];



  return (
    <div className="mb-6 rounded-md border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Download timeline</h3>
          {peak?.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Peak: {peak.total} on {peak.day}
              {spikes &&
                ` · ${spikeDays.length} spike${spikeDays.length === 1 ? "" : "s"} detected`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
          {([0, 3, 7] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setAvgWindow(w)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                avgWindow === w
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w === 0 ? "Raw" : `${w}-day avg`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSpikes((v) => !v)}
          aria-pressed={spikes}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            spikes
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Highlight days more than 2 standard deviations above the trailing 7-day baseline"
        >
          Spike detection
        </button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Compare PDF
          <select
            value={pdfKey}
            onChange={(e) => setPdfKey(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
          >
            <option value="">None</option>
            {pdfs.map((p) => (
              <option key={p.key ?? p.id ?? p.title} value={p.key ?? p.id ?? `title:${p.title}`}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="dlTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              interval="preserveStartEnd"
              minTickGap={20}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(_l, p) => (p?.[0]?.payload as { day?: string })?.day ?? ""}
            />
            <Area
              type="monotone"
              dataKey="total"
              name="All downloads"
              stroke="hsl(var(--accent))"
              strokeWidth={avgWindow ? 1 : 2}
              strokeOpacity={avgWindow ? 0.45 : 1}
              fill="url(#dlTotal)"
              fillOpacity={avgWindow ? 0.35 : 1}
            />
            {avgWindow > 0 && (
              <Line
                type="monotone"
                dataKey="avg"
                name={`${avgWindow}-day average`}
                stroke="hsl(var(--accent))"
                strokeWidth={2.5}
                dot={false}
              />
            )}
            {spikes &&
              spikeDays.map((p) => (
                <ReferenceDot
                  key={p.day}
                  x={p.label}
                  y={p.total}
                  r={5}
                  fill="hsl(var(--destructive))"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                />
              ))}
            {pdfKey && (
              <Line
                type="monotone"
                dataKey="pdf"
                name="Selected PDF"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {spikes && (
        <div className="mt-3 border-t border-border pt-2 text-xs">
          {spikeDays.length === 0 ? (
            <p className="text-muted-foreground">
              No statistically significant surges in this range (threshold: 2σ above the
              trailing 7-day baseline).
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {spikeDays.map((p) => (
                <li
                  key={p.day}
                  className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-foreground"
                >
                  {p.day}: {p.total} downloads ({p.z}σ)
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
