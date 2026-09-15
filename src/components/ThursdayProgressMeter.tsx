import { useEffect, useMemo, useState } from "react";
import { getThursdayProgress } from "@/integrations/supabase/api.functions";
import { getProgressVisibility } from "@/integrations/supabase/progress-visibility.functions";

const STEPS = [0, 25, 50, 75, 95, 100] as const;
type FillStep = (typeof STEPS)[number];
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
  /** Hide the separate right-side percentage label. */
  showPercent?: boolean;
  /** Optional explanatory copy shown beneath the upcoming reading at 0%. */
  message?: string;
  /** Optional destination shown when the upload reaches 100%. */
  completeHref?: string;
  /** Optional CTA text shown when the upload reaches 100%. */
  completeCtaLabel?: string;
};

export function ThursdayProgressMeter({
  heading = "Upcoming Divrei Torah",
  ariaLabel = (fillStep) => `Upcoming Divrei Torah upload progress: ${fillStep}% complete`,
  showPercent = true,
  message,
  completeHref,
  completeCtaLabel = "Browse the new collection",
}: ThursdayProgressMeterProps) {
  const [fillStep, setFillStep] = useState<FillStep | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, visibility] = await Promise.all([
          getThursdayProgress(),
          getProgressVisibility(),
        ]);
        if (!cancelled) {
          setFillStep(p.fillStep);
          setEta(p.eta);
          setVisible(visibility.visible);
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

  if (fillStep === null || visible !== true) return null;

  const activeCount = SEGMENT_THRESHOLDS.filter((t) => t <= fillStep).length;
  const headingText = typeof heading === "function" ? heading(fillStep) : heading;
  const displayHeading = headingText.replace(/^Upcoming(?::\s*|\s+)/i, "");
  const ariaText = typeof ariaLabel === "function" ? ariaLabel(fillStep) : ariaLabel;
  const inProgress = fillStep > 0 && fillStep < 100;

  return (
    <div
      className="mx-auto max-w-md rounded-xl border-2 border-primary/35 bg-background/70 px-4 py-5 shadow-sm sm:px-5 sm:py-6"
      role="group"
      aria-label={ariaText}
    >
      <div className="text-center">
        <span className="inline-flex rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-sans text-[0.65rem] font-bold uppercase tracking-[0.22em] text-accent-readable sm:text-xs">
          Upcoming
        </span>
        <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-primary sm:text-3xl">
          {displayHeading}
        </h2>

        {fillStep === 0 && (
          <>
            <p className="mt-4 font-sans text-base font-bold text-primary sm:text-lg">
              Next update: Thursday evening
            </p>
            <p className="mt-1 font-sans text-sm leading-relaxed text-muted-foreground sm:text-base">
              {message ?? "New Divrei Torah will be added then."}
            </p>
          </>
        )}

        {fillStep === 100 && (
          <div className="mt-4">
            <p className="font-sans text-base font-bold text-primary sm:text-lg">
              Updated — new Divrei Torah are ready
            </p>
            {completeHref && (
              <a
                href={completeHref}
                className="mt-3 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 font-serif text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {completeCtaLabel}
              </a>
            )}
          </div>
        )}
      </div>

      {inProgress && (
        <>
          <div className="mt-5 flex items-baseline justify-between border-t border-accent/25 pt-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Upload Progress
            </span>
            {showPercent && <span className="text-base font-bold text-accent-readable">{fillStep}%</span>}
          </div>

          <div className="mt-2 flex gap-1.5" aria-hidden="true">
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
        </>
      )}

      {showEta && eta && inProgress && (
        <p className="mt-2 text-xs text-muted-foreground">Expected complete by {formatEta(eta)}</p>
      )}
    </div>
  );
}
