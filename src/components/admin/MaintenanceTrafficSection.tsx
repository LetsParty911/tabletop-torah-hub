import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminMaintenanceTraffic } from "@/lib/maintenance-traffic.functions";

type Report = Awaited<ReturnType<typeof adminMaintenanceTraffic>>;

function nyToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const LABEL: Record<string, string> = { likely_human: "Likely human", automation: "Automation", unknown: "Unknown" };

function List({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return (
    <div className="rounded-md border p-3">
      <h4 className="text-sm font-semibold text-primary mb-2">{title}</h4>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : (
        <ul className="text-sm space-y-1">
          {items.map((i) => (
            <li key={i.label} className="flex justify-between gap-2"><span className="break-all">{i.label}</span><span className="tabular-nums">{i.count}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MaintenanceTrafficSection({ accessToken }: { accessToken: string }) {
  const fetchReport = useServerFn(adminMaintenanceTraffic);
  const [from, setFrom] = useState(nyToday(-6));
  const [to, setTo] = useState(nyToday());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchReport({ data: { accessToken, from, to } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accessToken]);

  const s = report?.summary;
  return (
    <section id="maintenance-traffic" className="rounded-lg border bg-card p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-bold text-primary">Maintenance traffic</h2>
        <p className="text-sm text-muted-foreground">
          Page requests that were shown the “Closed for Maintenance” screen. Recorded server-side only after this
          tracker was deployed — no earlier history. Kept completely separate from visitor, session and PDF figures;
          blocked-city requests appear only under Blocked Visits. Times are New York (Eastern).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-2 py-1 bg-background" /></label>
        <label className="flex flex-col">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-2 py-1 bg-background" /></label>
        <button onClick={load} disabled={loading} className="rounded-md border px-3 py-1.5 hover:bg-muted">{loading ? "Loading…" : "Apply"}</button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {report && s && (
        <>
          <p className="text-xs text-muted-foreground">{report.rangeStartNy} – {report.rangeEndNy}{report.truncated ? " · showing the latest 5,000 requests only" : ""}</p>
          {s.totalRequests === 0 ? (
            <p className="text-sm text-muted-foreground">No maintenance-screen requests recorded in this range.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  ["All page requests", s.totalRequests],
                  ["Estimated unique visitors", s.estimatedUniqueVisitors],
                  ["Likely human requests", s.likelyHuman],
                  ["Likely human (est. unique)", s.likelyHumanEstimatedUnique],
                  ["Automation", s.automation],
                  ["Unknown", s.unknown],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold tabular-nums">{v}</div></div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Unique visitors are estimates (browser cookie when present, otherwise a one-day anonymous hash) — not exact people. “Unknown” is not counted as human.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <List title="By day (New York)" items={s.byDay} />
                <List title="By hour (New York)" items={s.byHourNy} />
                <List title="Device" items={s.devices} />
                <List title="Country" items={s.countries} />
                <List title="City (when known)" items={s.cities} />
                <List title="Referring site" items={s.referrers} />
                <List title="Page requested" items={s.paths} />
              </div>
              <div className="overflow-x-auto">
                <h4 className="text-sm font-semibold text-primary mb-2">Recent attempts (latest 50)</h4>
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-1 pr-3">Time (ET)</th><th className="py-1 pr-3">Page</th><th className="py-1 pr-3">Location</th><th className="py-1 pr-3">Device</th><th className="py-1 pr-3">Referrer</th><th className="py-1">Type</th></tr></thead>
                  <tbody>
                    {report.recent.map((r, i) => (
                      <tr key={i} className="border-b align-top"><td className="py-1 pr-3 whitespace-nowrap">{r.timeNy}</td><td className="py-1 pr-3 break-all">{r.path}</td><td className="py-1 pr-3">{r.location}</td><td className="py-1 pr-3">{r.device}</td><td className="py-1 pr-3">{r.referrer ?? "—"}</td><td className="py-1">{LABEL[r.classification] ?? r.classification}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
