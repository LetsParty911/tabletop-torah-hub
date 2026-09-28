import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminListBlockedVisits } from "@/lib/blocked-visits.functions";
import { parseUserAgent, formatUaSummary } from "@/lib/ua-parse";

type Row = {
  id: string;
  created_at: string;
  ip_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  path: string | null;
  referrer: string | null;
  user_agent: string | null;
  block_reason: string;
  action: string;
};

export default function BlockedVisitsSection({ accessToken }: { accessToken: string | null }) {
  const list = useServerFn(adminListBlockedVisits);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const r = await list({ data: { accessToken } });
      setRows(r.rows as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <section className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Blocked Visits</h2>
          <p className="text-sm text-muted-foreground">
            Visitors from blocked locations shown the maintenance page. Kept out of all visitor, session,
            engagement and download reports. Latest 200 attempts.
          </p>
        </div>
        <button onClick={load} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No blocked attempts yet.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">Location</th>
                <th className="py-2 pr-3">Page</th>
                <th className="py-2 pr-3">Referrer</th>
                <th className="py-2 pr-3">Device</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.ip_address ?? "—"}</td>
                  <td className="py-2 pr-3">{[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="py-2 pr-3 break-all">{r.path ?? "—"}</td>
                  <td className="py-2 pr-3 break-all">{r.referrer ?? "—"}</td>
                  <td className="py-2 pr-3" title={r.user_agent ?? ""}>
                    {r.user_agent ? formatUaSummary(parseUserAgent(r.user_agent)) : "—"}
                  </td>
                  <td className="py-2 pr-3">{r.block_reason}</td>
                  <td className="py-2">{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
