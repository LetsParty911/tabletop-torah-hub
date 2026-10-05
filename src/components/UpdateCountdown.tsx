import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type UpdateCountdownProps = {
  /** True only when this week's collection is actually live. */
  contentLive?: boolean;
  /** The current weekly reading label, e.g. "Parshas Bereishis". */
  liveParshaLabel?: string | null;
  /** ISO date (YYYY-MM-DD) of the upcoming Shabbos, when available. */
  readingDate?: string | null;
};

const NEW_YORK_TIME_ZONE = "America/New_York";
const RELEASE_HOUR = 20;

const YOM_TOV_LABELS = new Set([
  "Rosh Hashanah",
  "Yom Kippur",
  "Sukkos",
  "Shemini Atzeres",
  "Simchas Torah",
  "Pesach",
  "Shavuos",
]);

function displayReadingLabel(value: string): string {
  if (/^Parshas\s+/i.test(value) || YOM_TOV_LABELS.has(value)) return value;
  return `Parshas ${value}`;
}

function datePartsInNewYork(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === 24 ? 0 : get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Convert a New York wall-clock date/time to a UTC Date without hard-coding
 * EST/EDT. Two passes handle the offset correctly across DST.
 */
function newYorkWallTimeToUtc(dateISO: string, hour: number): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  let guess = new Date(desiredAsUtc);

  for (let i = 0; i < 2; i += 1) {
    const actual = datePartsInNewYork(guess);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess = new Date(guess.getTime() + (desiredAsUtc - actualAsUtc));
  }

  return guess;
}

function releaseDateForReading(readingDate?: string | null): Date | null {
  if (!readingDate) return null;
  const shabbos = new Date(`${readingDate}T12:00:00Z`);
  if (Number.isNaN(shabbos.getTime())) return null;

  shabbos.setUTCDate(shabbos.getUTCDate() - 2);
  const thursday = shabbos.toISOString().slice(0, 10);
  return newYorkWallTimeToUtc(thursday, RELEASE_HOUR);
}

function formatRemaining(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}

export function UpdateCountdown({
  contentLive = false,
  liveParshaLabel,
  readingDate,
}: UpdateCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const releaseAt = useMemo(() => releaseDateForReading(readingDate), [readingDate]);

  if (!liveParshaLabel) return null;

  const label = displayReadingLabel(liveParshaLabel);
  const remaining = releaseAt ? releaseAt.getTime() - now : null;
  const countdown = remaining !== null && remaining > 0 ? formatRemaining(remaining) : null;

  const scrollToCollection = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document
      .getElementById("this-weeks-collection")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (contentLive) {
    return (
      <section
        aria-label="Weekly collection status"
        className="rounded-xl border border-accent/45 bg-accent/10 px-4 py-3 text-center shadow-sm sm:px-6"
      >
        <div className="flex items-center justify-center gap-2 text-primary">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="font-serif text-base font-bold sm:text-lg">{label} is now available</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Choose. Print. Enjoy.</p>
        <a
          href="#this-weeks-collection"
          onClick={scrollToCollection}
          className="mt-2 inline-flex rounded-full border border-accent bg-background px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          View this week&apos;s collection
        </a>
      </section>
    );
  }

  if (!releaseAt) return null;

  return (
    <section
      aria-label="Weekly collection status"
      className="rounded-xl border border-accent/45 bg-accent/10 px-4 py-3 text-center shadow-sm sm:px-6"
    >
      <div className="flex items-center justify-center gap-2 text-primary">
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="font-serif text-base font-bold sm:text-lg">{label} is coming this Thursday</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        We&apos;re preparing this week&apos;s Divrei Torah for your Shabbos table.
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Next collection publishes Thursday at 8:00 PM ET.
      </p>

      {countdown ? (
        <div
          className="mt-2 flex items-baseline justify-center gap-1.5 font-mono text-sm font-semibold text-primary sm:text-base"
          aria-live="polite"
          aria-label={`${countdown.days} days, ${countdown.hours} hours, and ${countdown.minutes} minutes until the next collection`}
        >
          <span>{countdown.days}d</span>
          <span aria-hidden="true">·</span>
          <span>{countdown.hours}h</span>
          <span aria-hidden="true">·</span>
          <span>{countdown.minutes}m</span>
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-primary" aria-live="polite">
          Scheduled for today — the banner will switch to available as soon as the collection is live.
        </p>
      )}
    </section>
  );
}
