import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminWhatsAppLinkAnalytics } from "@/integrations/supabase/whatsapp-link-analytics";

type Report = Awaited<ReturnType<typeof adminWhatsAppLinkAnalytics>>;

function dateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " ET";
}

/** Redirect request counters are separate from qualified website visitor analytics. */
export default function WhatsAppLinksPanel({
  accessToken,
  start,
  end,
}: {
  accessToken: string;
  start: string;
  end: string;
}) {
  const [data, setData] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const report = await adminWhatsAppLinkAnalytics({
        data: { accessToken, start, end },
      });
      setData(report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load WhatsApp links.");
    } finally {
      setBusy(false);
    }
  }, [accessToken, start, end]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-semibold text-primary">WhatsApp link requests and visits by group</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Link requests, probable previews, qualified website sessions, and actual Open PDF actions.
            Uses the report's selected time period.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
          <RefreshCw className={busy ? "animate-spin" : ""} />
          {busy ? "Updating…" : "Refresh"}
        </Button>
      </header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading short-link activity…</p>}
      {data && <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-semibold">Group / link</th>
                <th className="p-2 text-right font-semibold">Browser-like requests</th>
                <th className="p-2 text-right font-semibold">Preview / bot requests</th>
                <th className="p-2 text-right font-semibold">Qualified visits</th>
                <th className="p-2 text-right font-semibold">Visitors</th>
                <th className="p-2 text-right font-semibold">Open PDF clicks</th>
                <th className="p-2 text-right font-semibold">PDF viewer loads</th>
                <th className="p-2 text-right font-semibold">Download actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((row) => (
                <tr key={row.code}>
                  <td className="p-2 font-medium">
                    {row.label}
                    <span className="block text-xs font-normal text-muted-foreground">/{row.code}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">Last request: {dateTime(row.lastRequestAt)}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">Last visit: {dateTime(row.lastVisitAt)}</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{row.browserLikeHits}</td>
                  <td className="p-2 text-right tabular-nums">{row.botOrPreviewHits}</td>
                  <td className="p-2 text-right tabular-nums">{row.websiteSessions}</td>
                  <td className="p-2 text-right tabular-nums">{row.uniqueWebsiteVisitors}</td>
                  <td className="p-2 text-right tabular-nums">{row.pdfOpenClicks}</td>
                  <td className="p-2 text-right tabular-nums">{row.pdfViewerLoads}</td>
                  <td className="p-2 text-right tabular-nums">{row.downloadActions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{data.note}</p>
      </>}
    </section>
  );
}
