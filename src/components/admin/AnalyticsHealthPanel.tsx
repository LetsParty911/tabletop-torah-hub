import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminAnalyticsHealth } from "@/integrations/supabase/admin-analytics-canonical";

type HealthData = Awaited<ReturnType<typeof adminAnalyticsHealth>>;

const STATUS_LABEL: Record<string, string> = {
  healthy: "Healthy",
  warning: "Worth a look",
  not_enough_data: "Not enough data",
};

/** Evidence-based checks over the last 7 days of real canonical events. */
export default function AnalyticsHealthPanel({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminAnalyticsHealth({ data: { accessToken } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run the checks.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-primary">Analytics health</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Checks run against the last 7 days of recorded activity. Each result reports what was
            observed, not a pass or fail verdict.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          {loading ? "Checking…" : "Re-check"}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {data && (
        <ul className="mt-4 divide-y divide-border text-sm">
          {data.checks.map((check) => (
            <li key={check.name} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{check.name}</span>
                <span
                  className={
                    check.status === "healthy"
                      ? "text-xs font-semibold text-primary"
                      : check.status === "warning"
                        ? "text-xs font-semibold text-destructive"
                        : "text-xs font-semibold text-muted-foreground"
                  }
                >
                  {STATUS_LABEL[check.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
