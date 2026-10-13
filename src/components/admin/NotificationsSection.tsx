import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CATEGORIES, CATEGORY_LABEL, IMPLEMENTED, type Settings } from "@/lib/notifications/core";
import {
  adminNotificationStatus, adminRetryFailedNotifications, adminRunNotifications,
  adminSaveNotificationSettings, adminSendTestNotification,
} from "@/lib/notifications.functions";

type Status = Awaited<ReturnType<typeof adminNotificationStatus>>;

export function NotificationsSection({ accessToken }: { accessToken: string | null }) {
  const [st, setSt] = useState<Status | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const s = await adminNotificationStatus({ data: { accessToken } });
      setSt(s); setDraft(s.settings);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not load"); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg(await fn()); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (!accessToken) return null;
  if (!st || !draft) return <p className="text-muted-foreground">Loading notifications…</p>;

  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <section className="parchment-frame"><div className="parchment-panel space-y-6">
      <div>
        <h2 className="font-serif text-2xl text-primary">Alerts & Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          New owner alerts. Your existing first-visit alert and VPN alerts are separate and unchanged.
          “Accepted” means Pushover took the message — not that your phone showed it.
        </p>
        {!st.installed && (
          <p className="mt-3 rounded border border-accent bg-accent/10 p-3 text-sm">
            Storage for these alerts isn't installed in the analytics database yet. Settings can't be saved and nothing will send until it is.
          </p>
        )}
        {!st.pushoverConfigured && <p className="mt-2 text-sm text-destructive">Pushover keys not available to this server.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded border p-3">
          <span><strong>Send real alerts</strong><br /><span className="text-xs text-muted-foreground">Off = nothing sends</span></span>
          <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded border p-3">
          <span><strong>Practice mode</strong><br /><span className="text-xs text-muted-foreground">Records alerts without sending</span></span>
          <Switch checked={draft.dryRun} onCheckedChange={(v) => setDraft({ ...draft, dryRun: v })} />
        </label>
        <label className="rounded border p-3 text-sm">Mode
          <select className="ml-2 rounded border bg-background p-1" value={draft.mode}
            onChange={(e) => setDraft({ ...draft, mode: e.target.value as Settings["mode"] })}>
            <option value="quiet">Quiet</option><option value="balanced">Balanced</option><option value="active">Active</option>
          </select>
        </label>
        <div className="rounded border p-3 text-sm">Quiet hours (ET)
          {(["quietStart", "quietEnd"] as const).map((k) => (
            <select key={k} className="ml-2 rounded border bg-background p-1" value={draft[k] ?? ""}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">—</option>{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          ))}
        </div>
      </div>

      <ul className="divide-y rounded border">
        {CATEGORIES.map((c) => {
          const counts = st.counts[c] ?? {};
          const ready = IMPLEMENTED.has(c);
          return (
            <li key={c} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <div className="font-medium">{CATEGORY_LABEL[c]}{!ready && <span className="ml-2 text-xs text-muted-foreground">(coming later)</span>}</div>
                <div className="text-xs text-muted-foreground">
                  7 days: {Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}
                </div>
              </div>
              <Switch disabled={!ready} checked={draft.categories[c]}
                onCheckedChange={(v) => setDraft({ ...draft, categories: { ...draft.categories, [c]: v } })} />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !st.installed} onClick={() => act(async () => {
          await adminSaveNotificationSettings({ data: { accessToken, settings: draft } }); return "Saved.";
        })}>Save settings</Button>
        <Button variant="outline" disabled={busy || !st.installed} onClick={() => act(async () => {
          const r = await adminRunNotifications({ data: { accessToken } });
          return `Checked ${r.ingest.scanned} engaged visits (${r.ingest.queued} new, ${r.ingest.excluded} excluded). Sent ${r.tally.sent}, practice ${r.tally.dry_run}, failed ${r.tally.failed}.`;
        })}>Check & send now</Button>
        <Button variant="outline" disabled={busy || !st.installed} onClick={() => act(async () => {
          const r = await adminRetryFailedNotifications({ data: { accessToken } }); return `Re-queued ${r.requeued}.`;
        })}>Retry failed</Button>
        <Button variant="outline" disabled={busy} onClick={() => act(async () => {
          const r = await adminSendTestNotification({ data: { accessToken } });
          return r.accepted ? "Test accepted by Pushover — check your phone." : `Test not accepted (${r.error}).`;
        })}>Send test</Button>
      </div>
      {msg && <p className="text-sm" role="status">{msg}</p>}

      <div>
        <h3 className="font-medium">Recent deliveries</h3>
        <ul className="mt-2 text-sm">
          {st.recent.length === 0 && <li className="text-muted-foreground">None yet.</li>}
          {st.recent.map((r: { created_at: string; category: string; outcome: string; detail: string | null }, i: number) => (
            <li key={i}>{new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET — {r.category} — {r.outcome}{r.detail ? ` (${r.detail})` : ""}</li>
          ))}
        </ul>
      </div>
    </div></section>
  );
}
