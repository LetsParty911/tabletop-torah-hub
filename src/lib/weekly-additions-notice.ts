import { isCollectionComplete, isProgressForReading } from '@/lib/collection-status';
import { weeklyReleaseAt } from '@/lib/weekly-release';

export type WeeklyAdditionsPhase = 'before-thursday' | 'after-thursday';

export type WeeklyAdditionsOptions = {
  readingDate: string | null;
  isFallback: boolean;
  currentPublishedCount: number;
  progressFillStep: number | null;
  progressEta: string | null;
  visible: boolean;
  isYomTov: boolean;
  now: number;
};

/** Never show this-week claims over a fallback collection, or past Shabbos. */
export function weeklyAdditionsPhase(options: WeeklyAdditionsOptions): WeeklyAdditionsPhase | null {
  if (!options.visible || !options.readingDate || options.isFallback || options.isYomTov || !Number.isFinite(options.now)) {
    return null;
  }
  const releaseAt = weeklyReleaseAt(options.readingDate);
  if (!releaseAt) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(options.now));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  const today = [part('year'), part('month'), part('day')].join('-');
  const daysToShabbos = Math.round(
    (Date.parse(options.readingDate + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86_400_000,
  );
  if (daysToShabbos < 1 || daysToShabbos > 6) return null;

  // This progress row is global. Only the ETA can bind its 100% value
  // to the current reading, so last week's 100% must not hide this notice.
  const progress = isProgressForReading(options.progressEta, options.readingDate)
    ? options.progressFillStep : null;
  if (isCollectionComplete(progress, options.isFallback, options.currentPublishedCount)) return null;

  return options.now < releaseAt.getTime() ? 'before-thursday' : 'after-thursday';
}
