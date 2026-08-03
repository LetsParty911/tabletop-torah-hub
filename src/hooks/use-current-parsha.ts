import { useEffect, useState } from "react";
import { resolveHebcalParsha } from "@/lib/hebcal";
import { getParshaOverride } from "@/integrations/supabase/api.functions";

export type CurrentParsha = {
  parshaKey: string | null;
  displayLabel: string;
  loading: boolean;
};

const KNOWN_YOM_TOV = [
  "Rosh Hashanah",
  "Yom Kippur",
  "Sukkos",
  "Shemini Atzeres",
  "Simchas Torah",
  "Pesach",
  "Shavuos",
];

export function useCurrentParsha(): CurrentParsha {
  const [state, setState] = useState<CurrentParsha>({
    parshaKey: null,
    displayLabel: "Loading…",
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let displayLabel = "Parshas Hashavua";
      let parshaKey: string | null = null;

      try {
        const o = await getParshaOverride();
        if (o.override && o.isActive) {
          parshaKey = o.override;
          displayLabel = o.override.startsWith("Parshas")
            ? o.override
            : `Parshas ${o.override}`;
          if (KNOWN_YOM_TOV.includes(o.override)) displayLabel = o.override;
        }
      } catch {
        // ignore
      }

      if (!parshaKey) {
        try {
          const res = await fetch(
            "https://www.hebcal.com/shabbat?cfg=json&geonameid=5128581&M=on",
          );
          const data = await res.json();
          const items: Array<{
            title: string;
            category: string;
            subcat?: string;
            date: string;
          }> = data?.items ?? [];

          const parsha = items.find((i) => i.category === "parashat");
          const yomTovOnShabbos = parsha
            ? items.find(
                (i) =>
                  i.category === "holiday" &&
                  i.subcat === "major" &&
                  i.date.slice(0, 10) === parsha.date.slice(0, 10),
              )
            : undefined;

          if (yomTovOnShabbos) {
            const ytKey = hebcalYomTovToKey(yomTovOnShabbos.title);
            parshaKey = ytKey ?? yomTovOnShabbos.title;
            displayLabel = parshaKey;
          } else if (parsha) {
            parshaKey = hebcalToParshaKey(parsha.title);
            displayLabel = `Parshas ${parshaKey}`;
          }
        } catch {
          // ignore
        }
      }

      if (!cancelled) {
        setState({ parshaKey, displayLabel, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
