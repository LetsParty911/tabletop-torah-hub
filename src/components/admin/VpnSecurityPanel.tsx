export type VpnSecurity = {
  sampled: number; blocked: number; multi: number; unattributed: number;
  providers: Record<string, { detected: number; errors: number; quota: number; credentials: number }>;
  notifications: {
    blockSent: number; blockFailed: number; blockPending: number;
    failureSent: number; failureFailed: number; failurePending: number;
    recent: Array<{ created_at: string; kind: string; provider: string; status: string; attempts: number; location: string; last_error_category: string | null }>;
  };
  auditFailures: Array<{ created_at: string; error_category: string; decision: string; ip_address: string | null; city: string | null; region: string | null; country: string | null; detected_by: string[] }>;
  auditFailuresError: string | null;
};

const et = (d: string) => new Date(d).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET";
const num = (n: number) => n.toLocaleString();

export default function VpnSecurityPanel({ security, onTest, onRetry, message }: {
  security: VpnSecurity; onTest: () => void; onRetry: () => void; message: string | null;
}) {
  const n = security.notifications;
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <h3 className="font-semibold">Detectors &amp; alerts (selected range)</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([["Blocked attempts", security.blocked], ["Caught by 2+ detectors", security.multi], ["Blocked, no detector recorded (older rows)", security.unattributed], ["Audit write failures", security.auditFailures.length]] as const).map(([l, v]) => (
          <div key={l} className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-semibold text-xl">{num(v)}</div></div>
        ))}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 px-2">Detector</th><th className="px-2">Detections</th><th className="px-2">Errors</th><th className="px-2">Out of quota</th><th className="px-2">Key rejected</th></tr></thead>
        <tbody>{Object.entries(security.providers).sort((a, b) => b[1].detected - a[1].detected).map(([name, p]) => (
          <tr key={name} className="border-b"><td className="py-1 px-2">{name}</td><td className="px-2">{num(p.detected)}</td><td className="px-2">{num(p.errors)}</td><td className="px-2">{num(p.quota)}</td><td className="px-2">{num(p.credentials)}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="text-xs text-muted-foreground">From blocked and unknown-result checks in range (read {num(security.sampled)}, max 5,000). A visit caught by several detectors counts once for each. Checks recorded before attribution was added have no detector names.</p>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border p-3"><strong>Block alerts</strong><div>{n.blockSent} sent · {n.blockFailed} failed · {n.blockPending} pending</div></div>
        <div className="rounded-md border p-3"><strong>Provider failure alerts</strong><div>{n.failureSent} sent · {n.failureFailed} failed · {n.failurePending} pending</div></div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className="rounded border px-3 py-2 text-sm" onClick={onTest}>Send test alert</button>
        <button type="button" className="rounded border px-3 py-2 text-sm" onClick={onRetry}>Retry failed alerts</button>
        {message && <span className="text-sm">{message}</span>}
      </div>
      {n.recent.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">{["Time", "Type", "Detector / provider", "Location", "Status", "Tries", "Error"].map(x => <th key={x} className="py-1 px-2">{x}</th>)}</tr></thead>
        <tbody>{n.recent.map((r, i) => <tr key={i} className="border-b">
          <td className="py-1 px-2 whitespace-nowrap">{et(r.created_at)}</td><td className="px-2">{r.kind === "vpn_blocked" ? "Block" : "Provider failure"}</td>
          <td className="px-2">{r.provider}</td><td className="px-2">{r.location || "—"}</td><td className="px-2">{r.status}</td><td className="px-2">{r.attempts}</td><td className="px-2">{r.last_error_category ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>}
      {security.auditFailures.length > 0 && <div><h4 className="font-semibold text-sm">Audit write failures (backup log)</h4><ul className="text-sm space-y-1">
        {security.auditFailures.map((f, i) => <li key={i}>{et(f.created_at)} — {f.decision} — <span className="font-mono text-xs">{f.ip_address ?? "—"}</span> — {[f.city, f.region, f.country].filter(Boolean).join(", ") || "Location unknown"} — {f.detected_by.join(", ") || "—"} — {f.error_category}</li>)}
      </ul></div>}
      {security.auditFailuresError && <p className="text-sm text-destructive">Backup log unavailable: {security.auditFailuresError}</p>}
    </div>
  );
}
