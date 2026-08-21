import { adminGetWeeklyEmailPreview } from "@/integrations/supabase/api.functions";

export type WeeklyPreview = Awaited<ReturnType<typeof adminGetWeeklyEmailPreview>>;

export type WeeklySend = {
  id: string;
  parsha_key: string;
  jewish_year: number;
  subject: string;
  sent_at: string;
  sent_count: number;
  provider: string | null;
  notes: string | null;
};

type WeeklyEmailSectionProps = {
  weekly: WeeklyPreview | null;
  weeklyLoading: boolean;
  weeklySending: boolean;
  weeklyHistory: WeeklySend[];
  onSend: () => void;
};

export default function WeeklyEmailSection({
  weekly,
  weeklyLoading,
  weeklySending,
  weeklyHistory,
  onSend,
}: WeeklyEmailSectionProps) {
  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">
        Weekly Email
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Send this week's Divrei Torah collection to active subscribers.
        Manual send only — nothing goes out automatically.
      </p>

      {weeklyLoading && !weekly && (
        <p className="mt-4 text-muted-foreground">Loading…</p>
      )}

      {weekly && (
        <>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
              <div className="text-xs text-muted-foreground">Current week</div>
              <div className="font-medium text-foreground">{weekly.parshaLabel ?? "—"}</div>
            </div>
            <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
              <div className="text-xs text-muted-foreground">Jewish year</div>
              <div className="font-medium text-foreground">{weekly.jewishYear ?? "—"}</div>
            </div>
            <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
              <div className="text-xs text-muted-foreground">Published PDFs</div>
              <div className="font-medium text-foreground">{weekly.resources.length}</div>
            </div>
            <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
              <div className="text-xs text-muted-foreground">Active subscribers</div>
              <div className="font-medium text-foreground">{weekly.activeSubscriberCount}</div>
            </div>
          </div>

          {!weekly.emailConfigured && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Email not configured yet. Add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM_ADDRESS</code> as project secrets.
            </div>
          )}

          {weekly.alreadySent && (
            <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground">
              Already sent on {new Date(weekly.alreadySent.sentAt).toLocaleString()} to {weekly.alreadySent.sentCount} subscriber{weekly.alreadySent.sentCount === 1 ? "" : "s"}.
            </div>
          )}

          <div className="mt-5 rounded-md border-2 border-accent/50 bg-background/40 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Subject</div>
            <div className="font-medium text-foreground mt-1">{weekly.subject || "—"}</div>
            <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Intro</div>
            <p className="text-sm text-foreground mt-1">{weekly.intro}</p>
            <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
              Items ({weekly.resources.length})
            </div>
            {weekly.resources.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">No published PDFs for this week yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {weekly.resources.map((r) => (
                  <li key={r.id} className="text-sm">
                    <div className="font-medium text-foreground">{r.title}</div>
                    {r.subtitle && (
                      <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">View · Download</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-xs text-muted-foreground">Footer: Homepage · Archive · Unsubscribe</div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSend}
              disabled={weeklySending || !weekly.ready || Boolean(weekly.alreadySent)}
              className="rounded-full bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
            >
              {weeklySending
                ? "Sending…"
                : weekly.alreadySent
                  ? "Already Sent"
                  : "Send This Week's Email"}
            </button>
            {!weekly.ready && !weekly.alreadySent && weekly.reason && (
              <span className="text-sm text-muted-foreground">{weekly.reason}</span>
            )}
          </div>

          {weeklyHistory.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground">Recent sends</h3>
              <ul className="mt-2 divide-y divide-accent/30 text-sm">
                {weeklyHistory.slice(0, 8).map((h) => (
                  <li key={h.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{h.subject}</div>
                      <div className="text-xs text-muted-foreground">
                        {h.parsha_key} · {h.jewish_year} · sent to {h.sent_count}
                        {h.notes ? ` · ${h.notes}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {new Date(h.sent_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
