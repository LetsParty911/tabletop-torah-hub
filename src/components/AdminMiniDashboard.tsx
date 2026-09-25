import { useEffect, useState } from "react";
import { adminMiniDashboard } from "@/integrations/supabase/api.functions";
import { adminCanonicalSinceLast } from "@/integrations/supabase/admin-analytics-canonical";

type DashboardData = Awaited<ReturnType<typeof adminMiniDashboard>>;
type CanonicalData = Awaited<ReturnType<typeof adminCanonicalSinceLast>>;
const SITE_TZ = "America/New_York";

function formatAnchor(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: SITE_TZ,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
function Tile({
  label,
  children,
  quiet = false,
}: {
  label: string;
  children: React.ReactNode;
  quiet?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border-2 p-5 sm:p-6 ${quiet ? "border-accent/30 bg-background/40" : "border-accent/60 bg-background/70"}`}
    >
      <div className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
function BigNumber({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-serif text-5xl font-bold leading-none text-primary sm:text-6xl">
      {children}
    </div>
  );
}
function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-lg text-muted-foreground">{children}</p>;
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
  const [canonical, setCanonical] = useState<CanonicalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Never leave the card stuck on "Gathering your update…": if the backend
    // takes too long we surface a real message instead of spinning forever.
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("This is taking too long — try refreshing.")), ms),
        ),
      ]);
    (async () => {
      if (!accessToken) return;
      try {
        const r = await withTimeout(adminMiniDashboard({ data: { accessToken } }), 20000);
        if (cancelled) return;
        setData(r);
        // Normalize whatever the anchor looks like (DB timestamps can carry a
        // "+00:00" offset or a space separator) into a strict ISO string.
        const parsed = r.anchorIso ? new Date(r.anchorIso) : null;
        const since =
          parsed && !Number.isNaN(parsed.getTime())
            ? parsed.toISOString()
            : new Date(Date.now() - 7 * 86400000).toISOString();
        const c = await withTimeout(
          adminCanonicalSinceLast({ data: { accessToken, since } }),
          20000,
        );
        if (!cancelled) setCanonical(c);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);


  const remaining = Math.max(0, checklist.countableTotal - checklist.uploadedCount);
  const nothingNew =
    !!data &&
    !!canonical &&
    data.newSubscriberCount === 0 &&
    canonical.downloadActions === 0 &&
    data.newContactCount === 0 &&
    canonical.sessions === 0;

  return (
    <section className="parchment-frame">
      <div className="parchment-panel">
        <header className="text-center sm:text-left">
          <h2 className="font-serif text-3xl font-bold text-primary sm:text-4xl">
            Since you were last here
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {!data
              ? error
                ? "Couldn't load your update."
                : "Gathering your update…"
              : data.fallbackWindow || !data.anchorIso
                ? "In the last 7 days"
                : `Since ${formatAnchor(data.anchorIso)}`}
          </p>
          {canonical && canonical.sessions > 0 && (
            <p className="mt-2 font-serif text-base text-foreground">
              <b>{canonical.uniqueVisitors}</b> unique visitors across <b>{canonical.sessions}</b>{" "}
              sessions · {canonical.engagedSessions} engaged sessions
              {canonical.sources[0] ? ` · top source ${canonical.sources[0].label}` : ""}.
            </p>
          )}
          {canonical && (
            <p className="mt-1 text-xs text-muted-foreground">
              Headline audience metrics are human-qualified · {canonical.filteredAutomationSessions} suspected automated sessions filtered
            </p>
          )}
          {canonical && canonical.filteredInternalSessions > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {canonical.filteredInternalSessions} internal/test sessions filtered
            </p>
          )}
        </header>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {data && canonical && nothingNew && (
          <p className="mt-6 font-serif text-xl text-foreground">
            No new visitor activity, downloads, subscribers, or contact messages in this period.
          </p>
        )}
        {data && !nothingNew && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            {canonical && (
              <Tile label="Audience since last visit" quiet={canonical.sessions === 0}>
                {canonical.sessions === 0 ? (
                  <Quiet>No visitor sessions</Quiet>
                ) : (
                  <>
                    <BigNumber>{canonical.uniqueVisitors}</BigNumber>
                    <p className="mt-3 text-sm">
                      unique visitors · {canonical.sessions} sessions · {canonical.engagedSessions}{" "}
                      engaged
                    </p>
                  </>
                )}
              </Tile>
            )}
            {canonical && (
            <Tile label="Download activity" quiet={canonical.downloadActions === 0}>

              {canonical.downloadActions === 0 ? (
                <Quiet>No download actions</Quiet>
              ) : (
                <>
                  <BigNumber>{canonical.downloadActions}</BigNumber>
                  <p className="mt-3 text-sm">
                    download actions · {canonical.downloadingSessions} downloading sessions ·{" "}
                    {canonical.uniquePdfDownloads} unique session+PDF downloads
                  </p>
                </>
              )}
            </Tile>
            )}

            <Tile label="New subscribers" quiet={data.newSubscriberCount === 0}>
              {data.newSubscriberCount === 0 ? (
                <Quiet>No new subscribers</Quiet>
              ) : (
                <>
                  <BigNumber>{data.newSubscriberCount}</BigNumber>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {data.totalSubscribers} subscribers in total
                  </p>
                </>
              )}
            </Tile>
            <Tile label={`This week's checklist — ${checklist.parshaLabel}`}>
              {checklist.countableTotal > 0 && remaining === 0 ? (
                <p className="font-serif text-2xl font-semibold text-primary sm:text-3xl">
                  All {checklist.countableTotal} in — you're done for this week.
                </p>
              ) : (
                <>
                  <p className="font-serif text-2xl font-semibold text-primary sm:text-3xl">
                    {checklist.uploadedCount} of {checklist.countableTotal} uploaded{" "}
                    <span className="font-normal text-muted-foreground">
                      — {remaining} remaining
                    </span>
                  </p>
                  {checklist.missingTitles.length > 0 && (
                    <p className="mt-3 text-sm">
                      Still to come: {checklist.missingTitles.join(", ")}
                    </p>
                  )}
                </>
              )}
            </Tile>
            <Tile label="New contact messages" quiet={data.newContactCount === 0}>
              {data.newContactCount === 0 ? (
                <Quiet>No new messages</Quiet>
              ) : (
                <>
                  <BigNumber>{data.newContactCount}</BigNumber>
                  <p className="mt-3 text-sm">
                    From {data.newContactNames.join(", ")}
                    {data.newContactCount > data.newContactNames.length
                      ? ` and ${data.newContactCount - data.newContactNames.length} more`
                      : ""}
                  </p>
                </>
              )}
            </Tile>
          </div>
        )}
      </div>
    </section>
  );
}
