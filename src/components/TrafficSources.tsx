import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminTrafficSources } from "@/integrations/supabase/api.functions";

type Row = { name: string; count: number };
type Group = {
  total: number;
  referrers: Row[];
  landingPages: Row[];
  campaigns: Row[];
  downloadPages?: Row[];
};
type FunnelRow = { name: string; sessions: number; downloads: number; rate: number };
type Funnel = {
  sessions: number;
  converted: number;
  rate: number;
  matchedDownloads: number;
  byReferrer: FunnelRow[];
  byLandingPage: FunnelRow[];
  byCampaign: FunnelRow[];
};
type Data = { visits: Group; downloads: Group; funnel?: Funnel };

const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;

function FunnelPanel({ title, note, rows }: { title: string; note?: string; rows: FunnelRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="font-serif text-base font-semibold">{title}</h4>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-1 text-left font-medium">Source</th>
              <th className="pb-1 text-right font-medium">Visits</th>
              <th className="pb-1 text-right font-medium">Downloads</th>
              <th className="pb-1 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-border/60">
                <td className="max-w-[14rem] truncate py-1.5" title={r.name}>
                  {r.name}
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.sessions.toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{r.downloads.toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Panel({ title, note, rows }: { title: string; note?: string; rows: Row[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="font-serif text-base font-semibold">{title}</h4>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate" title={r.name}>
                  {r.name}
                </span>
                <span className="tabular-nums font-semibold">{r.count.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TrafficSources({
  accessToken,
  days,
}: {
  accessToken: string;
  days: number | null;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminTrafficSources({ data: { accessToken, days } });
      setData(res as unknown as Data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load traffic sources");
    } finally {
      setLoading(false);
    }
  }, [accessToken, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-serif text-xl font-semibold">Traffic sources</h3>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {data?.funnel && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Visit-to-download funnel
          </p>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Visits (sessions)", value: data.funnel.sessions.toLocaleString() },
              { label: "Sessions that downloaded", value: data.funnel.converted.toLocaleString() },
              { label: "Conversion rate", value: pct(data.funnel.rate) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <FunnelPanel title="By referrer" note="First-touch source of the visit" rows={data.funnel.byReferrer} />
            <FunnelPanel title="By landing page" note="First page of the visit" rows={data.funnel.byLandingPage} />
            <FunnelPanel title="By campaign" note="utm_source / medium — campaign" rows={data.funnel.byCampaign} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sessions are matched to downloads recorded from the same browsing session; downloads from before this
            report went live are not matched.
          </p>
        </div>
      )}

      {data && (
        <>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Sources that drive downloads ({data.downloads.total.toLocaleString()} tracked downloads)
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Top referrers" note="Where the visitor came from" rows={data.downloads.referrers} />
              <Panel title="Top landing pages" note="First page of the visit" rows={data.downloads.landingPages} />
              <Panel
                title="Top download pages"
                note="Page the download happened on"
                rows={data.downloads.downloadPages ?? []}
              />
            </div>
            {data.downloads.campaigns.length > 0 && (
              <div className="mt-4">
                <Panel title="Top campaigns" note="utm_source / medium — campaign" rows={data.downloads.campaigns} />
              </div>
            )}
            {data.downloads.total === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Source attribution starts collecting from the next publish — older downloads have no referrer data.
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              All site visits ({data.visits.total.toLocaleString()} pageviews)
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Top referrers" rows={data.visits.referrers} />
              <Panel title="Top landing pages" rows={data.visits.landingPages} />
              <Panel title="Top campaigns" rows={data.visits.campaigns} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
