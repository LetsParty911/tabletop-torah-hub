import { useEffect, useState } from "react";
import { getThursdayProgress } from "@/integrations/supabase/api.functions";
import { getProgressVisibility } from "@/integrations/supabase/progress-visibility.functions";

type ThursdayProgressMeterProps = {
  heading?: string;
};

/**
 * Public update notice only. Precise percentages and ETA remain available
 * to administrators via ThursdayProgressForm.
 */
export function ThursdayProgressMeter({
  heading = "This week's Divrei Torah",
}: ThursdayProgressMeterProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [progress, visibility] = await Promise.all([
          getThursdayProgress(),
          getProgressVisibility(),
        ]);
        if (!cancelled) {
          setActive(visibility.visible && progress.fillStep > 0 && progress.fillStep < 100);
        }
      } catch {
        if (!cancelled) setActive(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!active) return null;

  return (
    <div
      className="mx-auto max-w-md rounded-lg border border-accent/35 bg-accent/5 px-4 py-3 text-center"
      role="status"
      aria-label={`${heading}: new Divrei Torah are being added`}
    >
      <p className="font-serif text-sm font-semibold text-primary sm:text-base">
        Now updating
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        More Divrei Torah are being added. Check back for new selections.
      </p>
    </div>
  );
}
