import { useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import {
  adminGetWeeklyEmailPreview,
  adminSendWeeklyEmailTestToSelf,
} from "@/integrations/supabase/api.functions";
import { adminSendPersonalizedWeeklyEmail } from "@/integrations/supabase/personalized-weekly-email.functions";

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
}: WeeklyEmailSectionProps) {
  const { session } = useAuth();
  const [personalizedSending, setPersonalizedSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Sends exactly one email to the signed-in admin. Never touches subscribers
  // and never records the week as sent.
  const handleTestSend = async () => {
    const accessToken = session?.access_token;
    if (!accessToken) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const result = await adminSendWeeklyEmailTestToSelf({ data: { accessToken } });
      setTestResult(
        result.ok
          ? `Test email sent to ${result.to}${result.messageId ? ` (id ${result.messageId})` : ""}.`
          : `Test send failed — ${result.error}`,
      );
    } catch (error) {
      setTestResult(
        `Test send failed — ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setTestSending(false);
    }
  };


  const handlePersonalizedSend = async () => {
    const accessToken = session?.access_token;
    if (!accessToken || !weekly?.ready || weekly.alreadySent) return;

    if (
      !confirm(
        `Send this week's email to ${weekly.activeSubscriberCount} active subscriber${weekly.activeSubscriberCount === 1 ? "" : "s"}? Subscribers with My Table preferences will receive personalized selections; everyone else will receive the standard collection.`,
      )
    ) {
      return;
    }

    setPersonalizedSending(true);
    try {
      const result = await adminSendPersonalizedWeeklyEmail({ data: { accessToken } });
      if (!result.ok) {
        alert(result.error ?? "Could not send this week's email.");
        return;
      }

      const parts = [
        `Sent to ${result.sentCount} subscriber${result.sentCount === 1 ? "" : "s"}.`,
        `${result.personalizedCount} personalized.`,
        `${result.standardCount} standard.`,
        result.fallbackCount
          ? `${result.fallbackCount} personalized recipient${result.fallbackCount === 1 ? "" : "s"} received closest-match fallback picks.`
          : null,
        result.failedCount ? `${result.failedCount} failed.` : null,
      ].filter(Boolean);

      alert(parts.join(" "));
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not send this week's email.");
    } finally {
      setPersonalizedSending(false);
    }
  };

  const sending = personalizedSending || weeklySending;

  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">
        Weekly Email
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Send this week's Divrei Torah to active subscribers. Readers who have set My Table preferences receive a curated subset; everyone else receives the standard weekly collection. Manual send only — nothing goes out automatically.
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
            <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Standard-email intro</div>
            <p className="text-sm text-foreground mt-1">{weekly.intro}</p>
            <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
              Full weekly collection ({weekly.resources.length})
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
            <div className="mt-3 text-xs text-muted-foreground">
              Personalized readers receive only matching selections when available. Footer: Homepage · Archive · Manage My Table · Unsubscribe
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePersonalizedSend}
              disabled={sending || !weekly.ready || Boolean(weekly.alreadySent)}
              className="rounded-full bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
            >
              {sending
                ? "Sending…"
                : weekly.alreadySent
                  ? "Already Sent"
                  : "Send Personalized Weekly Email"}
            </button>
            <button
              type="button"
              onClick={handleTestSend}
              disabled={testSending || weekly.resources.length === 0 || !weekly.emailConfigured}
              className="rounded-full border-2 border-accent/60 px-6 py-2 text-foreground disabled:opacity-50"
            >
              {testSending ? "Sending test…" : "Send Test Email to Me"}
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
