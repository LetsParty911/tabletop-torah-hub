import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Admin-only control that marks the current browser as an internal/test device.
 *
 * The marker is a signed, HttpOnly first-party cookie issued only after the
 * server verifies the signed-in admin. A visitor cannot mark themselves
 * internal by editing storage or the event payload.
 */
export default function InternalDeviceControl({ accessToken }: { accessToken: string }) {
  const [internal, setInternal] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/internal-device", { credentials: "same-origin" });
      const body = (await response.json()) as { internal?: boolean };
      setInternal(Boolean(body.internal));
    } catch {
      setInternal(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = async (action: "mark" | "unmark") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ accessToken, action }),
      });
      if (!response.ok) throw new Error("This account is not allowed to change the marker.");
      const body = (await response.json()) as { internal?: boolean };
      setInternal(Boolean(body.internal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this device.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-md border border-border p-4">
      <h3 className="font-serif text-lg font-semibold text-primary">This device</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {internal === true
          ? "This browser is marked internal. Its visits are still recorded for diagnostics, but they are kept out of the headline reader numbers."
          : "Mark this browser as internal so your own testing does not count as reader activity. It applies to this browser only."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || internal === true} onClick={() => void apply("mark")}>
          Mark this device as internal
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || internal !== true}
          onClick={() => void apply("unmark")}
        >
          Unmark
        </Button>
        <span className="text-xs text-muted-foreground">
          {internal === null ? "Checking…" : internal ? "Currently internal" : "Currently counted as a reader"}
        </span>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
