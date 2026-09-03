import { useEffect, useMemo, useState } from "react";
import { getThursdayProgress } from "@/integrations/supabase/api.functions";

const STEPS = [0, 25, 50, 75, 95, 100] as const;
type FillStep = (typeof STEPS)[number];
// The bar always shows 5 segments (one per non-zero threshold); 0% just
// means none of them are lit yet.
const SEGMENT_THRESHOLDS = [25, 50, 75, 95, 100] as const;

function formatEta(iso: string): string {
  const d = new Date(iso);
  const dayLabel = d.toLocaleDateString("en-US", { weekday: "long" });
  const timeLabel = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dayLabel}, ${timeLabel}`;
}

type HeadingValue = string | ((fillStep: FillStep) => string);
type AriaValue = string | ((fillStep: FillStep) => string);

type ThursdayProgressMeterProps = {
  heading?: HeadingValue;
  ariaLabel?: AriaValue;
  /** Hide the separate right-side percentage label (use when the heading already shows it). */
  showPercent?: boolean;
};

export function ThursdayProgressMeter({
  heading = "This Week's Upload Progress",
  ariaLabel = (fillStep) => `This week's Divrei Torah upload progress: ${fillStep}% complete`,
  showPercent = true,
}: ThursdayProgressMeterProps) {
  const [fillStep, setFillStep] = useState<FillStep | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getThursdayProgress();
        if (!cancelled) {
          setFillStep(p.fillStep);
          setEta(p.eta);
        }
      } catch {
        // silent — meter just doesn't render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showEta = useMemo(() => {
    if (!eta) return false;
    const etaTime = new Date(eta).getTime();
    return !Number.isNaN(etaTime) && etaTime > Date.now();
  }, [eta]);

  if (fillStep === null) return null;

  const activeCount = SEGMENT_THRESHOLDS.filter((t) => t <= fillStep).length;

  const headingText = typeof heading === "function" ? heading(fillStep) : heading;
  const ariaText = typeof ariaLabel === "function" ? ariaLabel(fillStep) : ariaLabel;

  return (
    <div
      className="mx-auto max-w-md rounded-lg border border-accent/40 bg-background/60 px-4 py-3"
      role="group"
      aria-label={ariaText}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {headingText}
        </span>
        {showPercent && (
          <span className="text-sm font-bold text-accent-readable">{fillStep}%</span>
        )}
      </div>

      <div className="mt-2 flex gap-1">
        {SEGMENT_THRESHOLDS.map((threshold, i) => (
          <div
            key={threshold}
            className={
              "h-2.5 flex-1 rounded-sm transition-colors duration-300 " +
              (i < activeCount ? "bg-primary" : "bg-accent/15")
            }
          />
        ))}
      </div>

      {showEta && eta && (
        <p className="mt-2 text-xs text-muted-foreground">Expected complete by {formatEta(eta)}</p>
      )}
    </div>
  );
}
