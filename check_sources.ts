import { createClient } from "@supabase/supabase-js";

const url = process.env.EXT_SUPABASE_URL;
const key = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing EXT_SUPABASE_URL or EXT_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
});

async function main() {
  const { data, error } = await admin
    .from("checklist_sources")
    .select("id, title, sort_order, active")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

main();
