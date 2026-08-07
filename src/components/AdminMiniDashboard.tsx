import { useEffect, useState } from "react";
import { adminMiniDashboard } from "@/integrations/supabase/api.functions";

type DashboardData = Awaited<ReturnType<typeof adminMiniDashboard>>;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.round(ms / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks ago`;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-accent/50 bg-background/60 p-5">
      <h3 className="font-serif text-lg font-semibold text-primary">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="font-serif text-3xl font-bold text-primary leading-none">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default function AdminMiniDashboard({
  accessToken,
  checklist,
}: {
  accessToken: string | null;
  checklist: {
    uploadedCount: number;
    countableTotal: number;
    missingTitles: string[];
    parshaLabel: string;
  };
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken) return;
      try {
        const r = await adminMiniDashboard({ data: { accessToken } });
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const change = data ? data.currentParshaDownloads - data.previousParshaDownloads : 0;

  return (
    <section className="parchment-frame">
      <div className="parchment-panel">
        <h2 className="font-serif text-2xl font-semibold text-primary">At a glance</h2>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {!data && !error && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}

        {data && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CARD 1 */}
            <Card
              title="Since your last visit"
              subtitle={relativeTime(data.sinceIso)}
            >
              <div>
                <Stat value={data.newSubscriberCount} label="New subscribers" />
                {data.newSubscriberCount === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">No new subscribers since then.</p>
                ) : (
                  <ul className="mt-2 space-y-0.5 text-sm text-foreground break-all">
                    {data.newSubscriberEmails.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {data.newSubscriberCount > data.newSubscriberEmails.length && (
                      <li className="text-muted-foreground">
                        +{data.newSubscriberCount - data.newSubscriberEmails.length} more
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <div className="border-t border-accent/40 pt-4">
                <Stat value={data.downloadsSince} label="Downloads" />
                {data.topSincePdfs.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {data.topSincePdfs.map((p) => (
                      <li key={p.title} className="flex justify-between gap-3">
                        <span className="text-foreground">{p.title}</span>
                        <span className="font-medium text-primary tabular-nums">{p.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            {/* CARD 2 */}
            <Card title="This week" subtitle={checklist.parshaLabel}>
              <div>
                <div className="flex items-baseline gap-3">
                  <Stat value={data.currentParshaDownloads} label="Downloads this parsha" />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Last parsha: <span className="text-foreground font-medium">{data.previousParshaDownloads}</span>{" "}
                  <span
                    className={
                      change > 0
                        ? "text-primary font-medium"
                        : change < 0
                          ? "text-destructive font-medium"
                          : "text-muted-foreground"
                    }
                  >
                    {change > 0 ? "▲ +" : change < 0 ? "▼ −" : "→ "}
                    {change === 0 ? "0" : Math.abs(change)}
                  </span>
                </p>
              </div>

              <div className="border-t border-accent/40 pt-4">
                <Stat
                  value={`${checklist.uploadedCount} of ${checklist.countableTotal}`}
                  label="Uploaded this week"
                />
                {checklist.missingTitles.length > 0 ? (
                  <div className="mt-2 text-sm">
                    <div className="text-muted-foreground">Still missing:</div>
                    <ul className="mt-1 space-y-0.5 text-foreground">
                      {checklist.missingTitles.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">Everything is uploaded. 🎉</p>
                )}
              </div>
            </Card>

            {/* CARD 3 */}
            <Card title="All time">
              <Stat value={data.totalSubscribers} label="Total subscribers" />
              <div className="border-t border-accent/40 pt-4">
                <Stat value={data.totalDownloads} label="Total downloads" />
              </div>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
