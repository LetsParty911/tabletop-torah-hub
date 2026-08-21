import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type PublishResult = { id: string; title: string; status: "pending" | "ok" | "error"; error?: string };

type PublishProgressProps = {
  publishResults: PublishResult[] | null;
  publishingWeek: boolean;
  onDismiss: () => void;
};

export default function PublishProgress({ publishResults, publishingWeek, onDismiss }: PublishProgressProps) {
  if (!publishResults) return null;
  const total = publishResults.length;
  const done = publishResults.filter((r) => r.status !== "pending").length;
  const okCount = publishResults.filter((r) => r.status === "ok").length;
  const errCount = publishResults.filter((r) => r.status === "error").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="mt-4 w-full rounded-lg border border-accent/40 bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3 text-sm font-medium">
        <span>
          {publishingWeek ? "Publishing…" : "Publish complete"} — {done}/{total}
        </span>
        <span className="text-muted-foreground font-normal">
          {okCount} published{errCount > 0 ? ` · ${errCount} failed` : ""}
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-accent/20"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1.5">
        {publishResults.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-sm">
            {r.status === "pending" && (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            )}
            {r.status === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            {r.status === "error" && (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <span className="min-w-0 flex-1">
              <span className={r.status === "error" ? "text-destructive" : ""}>{r.title}</span>
              {r.status === "error" && r.error && (
                <span className="block text-xs text-destructive/80">{r.error}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!publishingWeek && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 text-xs font-semibold text-muted-foreground underline hover:text-foreground"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
