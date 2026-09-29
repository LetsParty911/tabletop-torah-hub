import { useEffect, useState } from "react";
import { adminGetMaintenance, adminSetMaintenance } from "@/lib/maintenance.functions";

type State = { enabled: boolean; updatedAt: string | null; updatedBy: string | null };

export default function MaintenanceModeControl({ accessToken }: { accessToken: string | null }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    adminGetMaintenance({ data: { accessToken } })
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const change = async (enabled: boolean) => {
    if (!accessToken) return;
    const msg = enabled
      ? "Turn maintenance mode ON? The public site will show the maintenance page."
      : "Turn maintenance mode OFF? The full public site will be visible to everyone.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminSetMaintenance({
        data: { accessToken, enabled, confirm: "CHANGE_MAINTENANCE_MODE" },
      });
      setState(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-serif text-2xl font-bold text-primary">Maintenance mode</h2>
      {!state && !error && <p className="text-sm text-muted-foreground">Loading current state…</p>}
      {state && (
        <>
          <p className="text-base">
            Public site is currently:{" "}
            <strong className={state.enabled ? "text-destructive" : "text-primary"}>
              {state.enabled ? "ON — showing the maintenance page" : "OFF — site is live"}
            </strong>
          </p>
          {state.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last changed {new Date(state.updatedAt).toLocaleString()}
              {state.updatedBy ? ` by ${state.updatedBy}` : ""}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => change(!state.enabled)}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Saving…" : state.enabled ? "Turn maintenance OFF" : "Turn maintenance ON"}
          </button>
          <p className="text-xs text-muted-foreground">
            Admin pages stay available either way. Publishing site updates never changes this setting.
          </p>
        </>
      )}
      {error && <p className="text-sm text-destructive">Could not load or save: {error}</p>}
    </div>
  );
}
