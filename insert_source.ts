import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.EXT_SUPABASE_URL;
  const key = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing EXT_SUPABASE_URL or EXT_SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const title = "Peninei Mechkerei Eretz — Harav Hagaon Rachamim Moshe Shayo, Shlita";

  const { data, error } = await supabase
    .from("checklist_sources")
    .insert({ title, sort_order: 170, active: true })
    .select();

  if (error) {
    console.error("Insert failed:", error);
    process.exit(1);
  }

  console.log("Inserted:", JSON.stringify(data, null, 2));
}

main();
