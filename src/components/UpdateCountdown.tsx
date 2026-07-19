import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

export function UpdateCountdown() {
  const [message, setMessage] = useState<string | null>(null);
  const [isUpdateDay, setIsUpdateDay] = useState(false);

  useEffect(() => {
    const now = new Date();
    const today = now.getDay(); // 0 = Sunday, ..., 4 = Thursday
    const daysUntilThursday = (4 - today + 7) % 7;

    if (daysUntilThursday === 0) {
      setIsUpdateDay(true);
      setMessage("It's update day! Check out this week's new content.");
    } else {
      setIsUpdateDay(false);
      const dayWord = daysUntilThursday === 1 ? "day" : "days";
      setMessage(
        `We're only ${daysUntilThursday} ${dayWord} away from our Thursday update.`,
      );
    }
  }, []);

  if (!message) return null;

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
        <span className="text-xs sm:text-sm font-semibold text-primary tracking-wide">
          {isUpdateDay ? (
            <span className="font-bold">{message}</span>
          ) : (
            <>
              <span className="uppercase text-[0.65rem] sm:text-xs mr-2 opacity-80">
                Next Update
              </span>
              <span className="font-medium">{message}</span>
            </>
          )}
        </span>
      </a>
    </div>
  );
}
