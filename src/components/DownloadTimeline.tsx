import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { day: string; count: number };

export function DownloadTimeline({
  days,
  byDay,
  pdfs,
  events,
}: {
  days: number;
  byDay: Point[];
  pdfs: Array<{ key?: string; id: string | null; title: string }>;
  events?: Array<{ key: string; at: string }>;
}) {
  const [pdfKey, setPdfKey] = useState<string>("");
  const [avgWindow, setAvgWindow] = useState<0 | 3 | 7>(0);

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
    }> = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        day: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        total: totals.get(key) ?? 0,
        ...(pdfKey ? { pdf: pdfTotals.get(key) ?? 0 } : {}),
      });
    }

    if (avgWindow > 0) {
      for (let i = 0; i < out.length; i++) {
        const start = Math.max(0, i - avgWindow + 1);
        const slice = out.slice(start, i + 1);
        const sum = slice.reduce((s, p) => s + p.total, 0);
        out[i].avg = Math.round((sum / slice.length) * 10) / 10;
      }
    }

    return out;
  }, [byDay, days, events, pdfKey, avgWindow]);

  const peak = series.reduce((m, p) => (p.total > m.total ? p : m), series[0] ?? { day: "", total: 0 });


  return (
    <div className="mb-6 rounded-md border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Download timeline</h3>
          {peak?.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Peak: {peak.total} on {peak.day}
            </p>
          )}
        </div>
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
              strokeWidth={2}
              fill="url(#dlTotal)"
            />
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
    </div>
  );
}
