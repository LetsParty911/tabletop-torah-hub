import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
const admin = createClient(process.env.EXT_SUPABASE_URL, process.env.EXT_SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const key = process.env.LOVABLE_API_KEY;
const MODEL = process.argv[2] || "google/gemini-2.5-flash";
const { data: rows } = await admin.from("pdfs").select("id,title,subtitle,file_path,page_count").is("description", null).order("created_at",{ascending:false});
console.log("rows:", rows.length, "model:", MODEL);
for (const row of rows) {
  const { data: blob, error } = await admin.storage.from("pdfs").download(row.file_path);
  if (error) { console.log("DL FAIL", row.title, error.message); continue; }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let pc = null; try { pc = (await PDFDocument.load(bytes,{ignoreEncryption:true})).getPageCount(); } catch {}
  const b64 = Buffer.from(bytes).toString("base64");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({model:MODEL,response_format:{type:"json_object"},messages:[{role:"system",content:`Respond ONLY with JSON: {"description": string (one short sentence, max 200 chars, describing the publication's style/content), "audience": one of "Adults"|"Families"|"Children", "format_type": one of "Short Vorts"|"Stories"|"Halacha"|"Essays"}`},{role:"user",content:[{type:"file",file:{filename:"p.pdf",file_data:"data:application/pdf;base64,"+b64}},{type:"text",text:`Publication title: ${row.title}. Analyze the attached PDF and return the JSON.`}]}]})});
  if(!res.ok){ console.log("AI FAIL",row.title,res.status,(await res.text()).slice(0,200)); continue; }
  const j = await res.json();
  let p; try { p = JSON.parse((j.choices?.[0]?.message?.content||"").trim().replace(/^```(?:json)?/,"").replace(/```$/,"")); } catch { console.log("PARSE FAIL",row.title); continue; }
  const up = {};
  if (p.description) up.description = String(p.description).slice(0,500);
  if (["Adults","Families","Children"].includes(p.audience)) up.audience = p.audience;
  if (["Short Vorts","Stories","Halacha","Essays"].includes(p.format_type)) up.format_type = p.format_type;
  if (pc && !row.page_count) up.page_count = pc;
  const { error: ue } = await admin.from("pdfs").update(up).eq("id", row.id);
  console.log(ue ? "UPDATE FAIL "+ue.message : "OK", row.title, "|", up.audience, "|", (up.description||"").slice(0,60));
}
