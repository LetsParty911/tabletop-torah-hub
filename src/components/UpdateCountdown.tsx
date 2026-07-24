import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { hebcalToParshaKey, hebcalYomTovToKey } from "@/lib/parshiyos";

const KNOWN_YOM_TOV = [
  "Rosh Hashanah",
  "Yom Kippur",
  "Sukkos",
  "Shemini Atzeres",
  "Simchas Torah",
  "Pesach",
  "Shavuos",
];

async function fetchParshaLabelForDate(target: Date): Promise<string | null> {
  const gy = target.getFullYear();
  const gm = String(target.getMonth() + 1).padStart(2, "0");
  const gd = String(target.getDate()).padStart(2, "0");
  try {
    const res = await fetch(
      `https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on&gy=${gy}&gm=${gm}&gd=${gd}`,
    );
    const data = await res.json();
    const items: Array<{
      title: string;
      category: string;
      subcat?: string;
      date: string;
    }> = data?.items ?? [];

    const parsha = items.find((i) => i.category === "parashat");
    const yomTov = parsha
      ? items.find(
          (i) =>
            i.category === "holiday" &&
            i.subcat === "major" &&
            i.date.slice(0, 10) === parsha.date.slice(0, 10),
        )
      : undefined;

    if (yomTov) {
      const key = hebcalYomTovToKey(yomTov.title) ?? yomTov.title;
      return KNOWN_YOM_TOV.includes(key) ? key : key;
    }
    if (parsha) {
      return `Parshas ${hebcalToParshaKey(parsha.title)}`;
    }
  } catch {
    // ignore
  }
  return null;
}

export function UpdateCountdown() {
  const [message, setMessage] = useState<string | null>(null);
  const [isUpdateDay, setIsUpdateDay] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const today = now.getDay();
      const daysUntilThursday = (4 - today + 7) % 7;

      // Only show from Sunday (0) through Thursday (4). Hide on Fri/Sat.
      if (today === 5 || today === 6) {
        return;
      }

      // Target Shabbos = Thursday + 2 days
      const target = new Date(now);
      target.setDate(now.getDate() + daysUntilThursday + 2);

      const parshaLabel = await fetchParshaLabelForDate(target);
      const suffix = parshaLabel ? `, featuring ${parshaLabel}` : "";

      if (cancelled) return;


      if (daysUntilThursday === 0) {
        setIsUpdateDay(true);
        const forPart = parshaLabel ? ` for ${parshaLabel}` : "";
        setMessage(
          `It's update day! Check out this week's new content${forPart}.`,
        );
      } else {
        setIsUpdateDay(false);
        const dayWord = daysUntilThursday === 1 ? "day" : "days";
        setMessage(
          `We're only ${daysUntilThursday} ${dayWord} away from our Thursday update${suffix}.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
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
