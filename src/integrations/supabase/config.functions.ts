import { createServerFn } from "@tanstack/react-start";

export const getSupabaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.EXT_SUPABASE_URL;
  const publishableKey = process.env.EXT_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("EXT_SUPABASE_URL or EXT_SUPABASE_PUBLISHABLE_KEY is not configured");
  }
  return { url, publishableKey };
});
