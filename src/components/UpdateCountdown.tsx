import { CalendarDays } from "lucide-react";

type UpdateCountdownProps = {
  /** True when the currently displayed collection is this week's live content. */
  contentLive?: boolean;
  /** Label of the collection that is actually live right now. */
  liveParshaLabel?: string | null;
};

export function UpdateCountdown({
  contentLive = false,
  liveParshaLabel,
}: UpdateCountdownProps) {
  // Only announce once the new week's collection is actually live. Hebcal rolls
  // the active parsha forward after Shabbos, so this hides itself automatically
  // until the next week's content goes up.
  if (!contentLive || !liveParshaLabel) return null;

  const label = liveParshaLabel.startsWith("Parshas")
    ? liveParshaLabel
    : `Parshas ${liveParshaLabel}`;

  return (
    <div className="flex justify-center px-4 pt-3">
      <a
        href="#this-weeks-collection"
        onClick={(e) => {
          e.preventDefault();
          document
            .getElementById("this-weeks-collection")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 shadow-sm border border-primary/20 max-w-full hover:opacity-90 transition-opacity"
        style={{ backgroundColor: "#F5E6A8" }}
      >
        <CalendarDays
          className="h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span className="text-xs sm:text-sm font-bold text-primary tracking-wide leading-snug">
          <span className="block">The website has been updated for {label}.</span>
          <span className="block">Enjoy your visit!</span>
        </span>
      </a>
    </div>
  );
}
