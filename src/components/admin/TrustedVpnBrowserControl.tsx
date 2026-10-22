import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldOff } from "lucide-react";

type BrowserState = { trusted: boolean; expiresAt: number | null; available?: boolean };
export default function TrustedVpnBrowserControl({ accessToken }: { accessToken: string | null }) {
  const [state, setState] = useState<BrowserState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let ignore = false;
    fetch("/api/trusted-vpn-browser", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Unable to check trusted browser status"); return response.json() as Promise<BrowserState>; })
      .then(value => { if (!ignore) setState(value); })
      .catch(() => { if (!ignore) setError("Unable to check trusted browser status"); });
    return () => { ignore = true; };
  }, [accessToken]);
  async function change(action: "enable" | "revoke") {
    if (!accessToken) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/trusted-vpn-browser", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update this browser");
      setState(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update this browser"); }
    finally { setBusy(false); }
  }
  return <div className="border-b pb-5 space-y-3">
    <h3 className="font-semibold">Trusted VPN browser</h3>
    <p className="text-sm text-muted-foreground">Applies only to this browser profile for 90 days. A different browser or cleared cookies requires enrollment again.</p>
    <p className="text-sm text-muted-foreground">Skips only VPN/proxy/Tor checks. Does not mark analytics internal or bypass geo/city/IP restrictions, maintenance, Shabbos/holiday closure, or PDF authorization.</p>
    <p role="status" className="text-sm">{state ? state.trusted ? `Enabled for this browser until ${new Date(state.expiresAt ?? 0).toLocaleDateString()}` : "Not enabled for this browser" : error ? "Status unavailable" : "Checking this browser…"}</p>
    {state?.available === false && <p className="text-sm text-destructive">Signing secret unavailable; enrollment is disabled.</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={busy || !accessToken || !state || state.trusted || state.available === false} onClick={() => change("enable")}><ShieldCheck aria-hidden="true" /> Enable for this browser</Button>
      <Button type="button" variant="outline" disabled={busy || !accessToken || !state?.trusted} onClick={() => change("revoke")}><ShieldOff aria-hidden="true" /> Revoke this browser</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}