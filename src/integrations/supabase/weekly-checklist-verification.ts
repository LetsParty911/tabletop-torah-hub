import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { toParshaComparableKey } from "@/lib/parsha-normalize";

export const getWeeklyChecklistPublishedTitles = createServerFn({ method: "POST" })
  .inputValidator((input: { parshaKey: string }) =>
    z.object({ parshaKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("pdfs")
      .select("title, parsha_key, jewish_year, published, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const target = toParshaComparableKey(data.parshaKey);
    const matching = (rows ?? []).filter(
      (row: any) => toParshaComparableKey(String(row.parsha_key ?? "")) === target,
    );

    const newestYear = matching.find((row: any) => typeof row.jewish_year === "number")
      ?.jewish_year as number | undefined;

    const currentRows =
      typeof newestYear === "number"
        ? matching.filter((row: any) => row.jewish_year === newestYear)
        : matching;

    return {
      titles: currentRows
        .map((row: any) => String(row.title ?? "").trim())
        .filter(Boolean),
      jewishYear: newestYear ?? null,
    };
  });
