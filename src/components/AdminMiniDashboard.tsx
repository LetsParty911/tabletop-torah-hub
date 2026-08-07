import { useEffect, useState } from "react";
import { adminMiniDashboard } from "@/integrations/supabase/api.functions";

type DashboardData = Awaited<ReturnType<typeof adminMiniDashboard>>;

const SITE_TZ = "America/New_York";

function formatAnchor(iso: string): string {
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: SITE_TZ,
    }).format(d);
    const time = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: SITE_TZ,
    }).format(d);
    return `${date} at ${time}`;
  } catch {
    return iso;
  }
}

function isSameSiteDay(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: SITE_TZ,
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return fmt.format(d) === fmt.format(now);
  } catch {
    return false;
  }
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    const sameDay = isSameSiteDay(iso);
    const time = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: SITE_TZ,
    }).format(d);
    if (sameDay) return time;
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: SITE_TZ,
    }).format(d);
    return `${weekday} ${time}`;
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
      className={
        "rounded-2xl border-2 p-5 sm:p-6 " +
        (quiet
          ? "border-accent/30 bg-background/40"
          : "border-accent/60 bg-background/70")
      }
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
    <div className="font-serif text-5xl sm:text-6xl font-bold leading-none text-primary">
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

  const remaining = Math.max(0, checklist.countableTotal - checklist.uploadedCount);
  const change = data ? data.currentParshaDownloads - data.previousParshaDownloads : 0;
  const nothingNew =
    !!data &&
    data.newSubscriberCount === 0 &&
    data.downloadsSince === 0 &&
    data.newContactCount === 0 &&
    (data.visitorsSince ?? 0) === 0;

  return (
    <section className="parchment-frame">
      <div className="parchment-panel">
        <header className="text-center sm:text-left">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-primary">
            Since you were last here
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {!data
              ? error
                ? "Couldn't load your update."
                : "Gathering the good news…"
              : data.fallbackWindow || !data.lastSeenAt || !data.anchorIso
                ? "In the last 7 days"
                : `Last visit ${formatShortTime(data.lastSeenAt)} · comparing since ${formatShortTime(data.anchorIso)}`}
          </p>
          {data && (data.visitorsSince ?? 0) > 0 && (
            <p className="mt-2 font-serif text-base text-foreground">
              {data.visitorsSince} {data.visitorsSince === 1 ? "visitor" : "visitors"} came by
              {data.topSourceSince ? ` — mostly from ${data.topSourceSince}` : ""}.
            </p>
          )}
        </header>


        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {data && nothingNew && (
          <p className="mt-6 font-serif text-xl text-foreground">
            {data.anchorIso
              ? `All quiet since ${formatAnchor(data.anchorIso)} — nothing new to catch up on.`
              : "All quiet in the last 7 days — nothing new to catch up on."}
          </p>
        )}

        {data && !nothingNew && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* 1 — New subscribers */}
            <Tile label="New subscribers" quiet={data.newSubscriberCount === 0}>
              {data.newSubscriberCount === 0 ? (
                <Quiet>No new subscribers</Quiet>
              ) : (
                <>
                  <BigNumber>{data.newSubscriberCount}</BigNumber>
                  <ul className="mt-3 space-y-1 text-sm text-foreground break-all">
                    {data.newSubscriberEmails.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {data.newSubscriberCount > data.newSubscriberEmails.length && (
                      <li className="text-muted-foreground">
                        and {data.newSubscriberCount - data.newSubscriberEmails.length} more
                      </li>
                    )}
                  </ul>
                </>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {data.totalSubscribers} subscribers in total
              </p>
            </Tile>

            {/* 2 — Downloads since last visit */}
            <Tile label="Downloads since your last visit" quiet={data.downloadsSince === 0}>
              {data.downloadsSince === 0 ? (
                <Quiet>No downloads yet</Quiet>
              ) : (
                <>
                  <BigNumber>{data.downloadsSince}</BigNumber>
                  {data.topSincePdfs.length > 0 && (
                    <p className="mt-3 text-sm text-foreground">
                      Mostly{" "}
                      {data.topSincePdfs
                        .map((p) => `${p.title} (${p.count})`)
                        .join(", ")}
                    </p>
                  )}
                </>
              )}
            </Tile>

            {/* 3 — This week's checklist */}
            <Tile label={`This week's checklist — ${checklist.parshaLabel}`}>
              {checklist.countableTotal > 0 && remaining === 0 ? (
                <p className="font-serif text-2xl sm:text-3xl font-semibold text-primary">
                  All {checklist.countableTotal} in — you're done for this week.
                </p>
              ) : (
                <>
                  <p className="font-serif text-2xl sm:text-3xl font-semibold text-primary">
                    {checklist.uploadedCount} of {checklist.countableTotal} uploaded
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      — {remaining} remaining
                    </span>
                  </p>
                  {checklist.missingTitles.length > 0 && (
                    <p className="mt-3 text-sm text-foreground">
                      Still to come: {checklist.missingTitles.join(", ")}
                    </p>
                  )}
                </>
              )}
            </Tile>

            {/* 4 — New contact messages */}
            <Tile label="New contact messages" quiet={data.newContactCount === 0}>
              {data.newContactCount === 0 ? (
                <Quiet>No new messages</Quiet>
              ) : (
                <>
                  <BigNumber>{data.newContactCount}</BigNumber>
                  <p className="mt-3 text-sm text-foreground">
                    From {data.newContactNames.join(", ")}
                    {data.newContactCount > data.newContactNames.length
                      ? ` and ${data.newContactCount - data.newContactNames.length} more`
                      : ""}
                  </p>
                </>
              )}
            </Tile>

            {/* 5 — This parsha vs last */}
            <Tile label="This parsha vs last" quiet={data.currentParshaDownloads === 0}>
              <p className="font-serif text-2xl sm:text-3xl font-semibold text-primary">
                {data.currentParshaDownloads}
                <span className="text-muted-foreground font-normal text-lg">
                  {" "}
                  vs {data.previousParshaDownloads} last parsha
                </span>{" "}
                <span
                  className={
                    change > 0
                      ? "text-accent-foreground"
                      : change < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }
                >
                  {change > 0 ? `▲ +${change}` : change < 0 ? `▼ −${Math.abs(change)}` : "→ even"}
                </span>
              </p>
            </Tile>
          </div>
        )}
      </div>
    </section>
  );
}
