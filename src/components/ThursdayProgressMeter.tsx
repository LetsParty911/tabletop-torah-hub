import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { getThursdayProgress } from '@/integrations/supabase/api.functions';
import { getProgressVisibility } from '@/integrations/supabase/progress-visibility.functions';
import { weeklyAdditionsPhase } from '@/lib/weekly-additions-notice';

type Props = {
  readingDate: string | null;
  isFallback: boolean;
  currentPublishedCount: number;
  progressFillStep: number | null;
  progressEta: string | null;
  isYomTov: boolean;
  initialNow?: number;
};

/** Compact public notice; private percentages and ETA remain in the admin. */
export function ThursdayProgressMeter(props: Props) {
  const [visible, setVisible] = useState(false);
  const [now, setNow] = useState(props.initialNow ?? 0);
  const [progress, setProgress] = useState({ fillStep: props.progressFillStep, eta: props.progressEta });

  useEffect(() => {
    setProgress({ fillStep: props.progressFillStep, eta: props.progressEta });
  }, [props.progressFillStep, props.progressEta]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [visibility, currentProgress] = await Promise.allSettled([
        getProgressVisibility(),
        getThursdayProgress(),
      ]);
      if (cancelled) return;
      if (visibility.status === 'fulfilled') setVisible(visibility.value.visible);
      if (currentProgress.status === 'fulfilled') {
        setProgress({ fillStep: currentProgress.value.fillStep, eta: currentProgress.value.eta });
      }
    };
    setNow(Date.now());
    void refresh();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const phase = weeklyAdditionsPhase({
    readingDate: props.readingDate,
    isFallback: props.isFallback,
    currentPublishedCount: props.currentPublishedCount,
    progressFillStep: progress.fillStep,
    progressEta: progress.eta,
    visible,
    isYomTov: props.isYomTov,
    now,
  });
  if (!phase) return null;

  return (
    <aside aria-label="More weekly Divrei Torah coming" className="rounded-xl border border-accent/50 bg-card px-4 py-3 text-center shadow-sm sm:px-6 sm:py-4">
      <div className="flex items-center justify-center gap-2 text-primary">
        <BookOpen className="h-4 w-4 shrink-0 text-accent-readable" aria-hidden="true" />
        <p className="font-serif text-base font-bold sm:text-lg">More Divrei Torah Are on the Way!</p>
      </div>
      <p className="mx-auto mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {phase === 'before-thursday'
          ? "We're adding many more selections for this week's Parsha! Check back Thursday evening for even more inspiring Divrei Torah to print, enjoy, and share at your Shabbos table."
          : "We're continuing to add selections for this week's Parsha. Check back before Shabbos for more Divrei Torah to read, print, and share."}
      </p>
    </aside>
  );
}
