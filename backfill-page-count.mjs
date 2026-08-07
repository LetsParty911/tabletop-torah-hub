import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

const admin = createClient(process.env.EXT_SUPABASE_URL, process.env.EXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: rows, error } = await admin
  .from("pdfs")
  .select("id, title, file_path, page_count")
  .is("page_count", null);
if (error) throw error;
console.log("rows needing page_count:", rows.length);

let ok = 0, fail = 0;
for (const r of rows) {
  if (!r.file_path) { console.log("skip (no file_path):", r.id); fail++; continue; }
  try {
    const { data: blob, error: dErr } = await admin.storage.from("pdfs").download(r.file_path);
    if (dErr || !blob) throw dErr ?? new Error("no blob");
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), {
      updateMetadata: false, ignoreEncryption: true,
    });
    const n = doc.getPageCount();
    const { error: uErr } = await admin.from("pdfs").update({ page_count: n }).eq("id", r.id);
    if (uErr) throw uErr;
    ok++;
    console.log(`ok ${r.id} ${r.title} -> ${n}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${r.id} ${r.title}: ${e?.message ?? e}`);
  }
}
console.log(`done. updated=${ok} failed=${fail}`);
