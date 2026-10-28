import { CalendarDays, ChevronRight, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { weeklyReleaseAt, weeklyReleaseState } from "@/lib/weekly-release";

type UpdateCountdownProps = {
  /** True only when this week's collection is actually live. */
  contentLive?: boolean;
  /** The current weekly reading label, e.g. "Parshas Bereishis". */
  liveParshaLabel?: string | null;
  /** ISO date (YYYY-MM-DD) of the upcoming Shabbos, when available. */
  readingDate?: string | null;
  /** Number of Divrei Torah currently published for the live collection. */
  availableCount?: number | null;
  /** True when the admin progress meter is at 100% for the live collection. */
  collectionComplete?: boolean;
  /** Loader snapshot keeps SSR and the first client render on the same second. */
  initialNow?: number;
};

const NEW_YORK_TIME_ZONE = "America/New_York";

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

function formatReleaseDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export function UpdateCountdown({
  contentLive = false,
  liveParshaLabel,
  readingDate,
  availableCount,
  collectionComplete = false,
  initialNow = 0,
}: UpdateCountdownProps) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const releaseAt = useMemo(() => weeklyReleaseAt(readingDate), [readingDate]);

  if (!liveParshaLabel) return null;

  const label = displayReadingLabel(liveParshaLabel);
  const remaining = releaseAt ? releaseAt.getTime() - now : null;
  const countdown = remaining !== null && remaining > 0 ? formatRemaining(remaining) : null;
  const releaseDateLabel = releaseAt ? formatReleaseDate(releaseAt) : null;

  const scrollToCollection = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document
      .getElementById("this-weeks-collection")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToSignup = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const signup = document.getElementById("weekly-email-signup");
    signup?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    signup?.querySelector<HTMLInputElement>('input[type="email"]')?.focus({ preventScroll: true });
  };

  const status = weeklyReleaseState(readingDate, contentLive && typeof availableCount === "number" ? availableCount : 0, now);

  if (status === "published") {
    return (
      <section
        aria-label="Weekly collection status"
        className="rounded-xl border border-accent/45 bg-accent/10 px-4 py-3 text-center shadow-sm sm:px-6"
      >
        <div className="flex items-center justify-center gap-2 text-primary">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="font-serif text-base font-bold sm:text-lg">{label} is now available</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {!collectionComplete && remaining !== null && remaining > 0 && typeof availableCount === "number" && availableCount > 0
            ? `${availableCount} ${availableCount === 1 ? "Dvar Torah posted" : "Divrei Torah posted"} so far — more coming.`
            : collectionComplete && typeof availableCount === "number" && availableCount > 0
              ? `All ${availableCount} ${availableCount === 1 ? "Dvar Torah is" : "Divrei Torah are"} posted — the collection is complete.`
              : "Choose. Print. Enjoy."}
        </p>
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
      <div className="flex items-center justify-center gap-3 text-accent-readable">
        <span aria-hidden="true" className="h-px w-10 bg-accent/55 sm:w-16" />
        <p className="font-serif text-sm italic font-medium tracking-normal sm:text-base">
          Welcome to TorahForTheTable.com
        </p>
        <span aria-hidden="true" className="h-px w-10 bg-accent/55 sm:w-16" />
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-primary">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p className="font-serif text-[1.05rem] font-bold leading-tight sm:text-xl">
          {status === "delayed" ? `${label} publication is delayed` : `${label} is coming ${releaseDateLabel} at 8:00 PM Eastern Time`}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {status === "delayed" ? "This week’s collection is not published yet. We’re still preparing the Divrei Torah for your table." : "We’re preparing this week’s Divrei Torah for your Shabbos table."}
      </p>

      {countdown ? (
        <div
          className="mx-auto mt-2 grid w-full max-w-[22rem] grid-cols-4 overflow-hidden rounded-lg border border-accent/30 bg-background/55 sm:max-w-[26rem]"
          role="timer"
          aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, and ${countdown.seconds} seconds until the next collection`}
        >
          {[
            ["Days", countdown.days],
            ["Hours", countdown.hours],
            ["Minutes", countdown.minutes],
            ["Seconds", countdown.seconds],
          ].map(([unit, value], index) => (
            <div
              key={unit}
              className={`px-1 py-1.5 text-center sm:py-2 ${index > 0 ? "border-l border-accent/25" : ""}`}
            >
              <span className="mx-auto block min-w-[2ch] font-serif text-base font-bold leading-none text-primary tabular-nums sm:text-lg">
                {value}
              </span>
              <span className="mt-0.5 block text-[0.55rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:text-[0.6rem]">
                {unit}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-primary" aria-live="polite">
          The collection will appear when it is published.
        </p>
      )}

      <a
        href="#weekly-email-signup"
        onClick={scrollToSignup}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#b8790b] bg-gradient-to-b from-[#ffd96b] to-[#f1b52f] px-6 py-3 font-serif text-lg font-bold text-[#082c55] shadow-[0_5px_16px_rgba(184,121,11,0.22)] transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:w-auto sm:min-w-72"
      >
        <Mail className="h-5 w-5" aria-hidden="true" />
        <span>Subscribe</span>
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </a>
      <p className="mt-2 text-sm text-muted-foreground">
        Be the first to know when this week&apos;s collection is published.
      </p>
    </section>
  );
}
