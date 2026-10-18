import { useEffect, useState } from "react";
import type { AnalyticsReportRange } from "@/integrations/supabase/admin-analytics-canonical";
import { adminAnalyticsReport } from "@/integrations/supabase/admin-analytics-canonical";
import AnalyticsControlCenter, { type ReportData } from "@/components/admin/AnalyticsControlCenter";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekly operations: last 7 days, with Thursday (release) vs Friday (follow-up) highlighted. */
export default function WeeklyOperationsReport({ accessToken, range, report }: { accessToken: string; range: AnalyticsReportRange; report: ReportData }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminAnalyticsReport({ data: { accessToken, range: "7d" } }).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [accessToken]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="py-8 text-center text-muted-foreground">Preparing weekly report…</p>;
  const days = data.report.overview.trend.map((t) => {
    const wd = new Date(`${t.bucket.slice(0, 10)}T12:00:00Z`).getUTCDay();
    return { ...t, wd };
  });
  return <div className="space-y-8">
    <p className="rounded-md border border-border bg-muted/30 p-3 text-sm">Weekly comparison always covers the last seven days, regardless of the selected {range === "custom" ? "custom" : range} range. The summary below uses the selected period.</p>
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Day by day (New York time)</h3>
      <p className="text-xs text-muted-foreground">Thursday is release day and Friday is follow-up; both are highlighted. The oldest and today's rows may be partial days.</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-1">Day</th><th>Visitors</th><th>Visits</th><th>Pageviews</th><th>Counted PDF attempted opens</th></tr></thead>
        <tbody className="divide-y divide-border">{days.map((d) => <tr key={d.bucket} className={d.wd === 4 || d.wd === 5 ? "bg-accent/15 font-medium" : ""}><td className="py-1">{WEEKDAY[d.wd]} {d.bucket.slice(5, 10)}</td><td>{d.visitors}</td><td>{d.sessions}</td><td>{d.pageviews}</td><td>{d.pdfOpens}</td></tr>)}</tbody></table></div>
    </section>
    <div className="border-t border-border pt-6"><h3 className="mb-3 font-serif text-lg font-semibold text-primary">Selected-period overview</h3><AnalyticsControlCenter data={report} accessToken={accessToken} /></div>
  </div>;
}
