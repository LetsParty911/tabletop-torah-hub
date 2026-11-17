import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { verifyAdminAccessToken } from "@/lib/admin-auth.server";
import { AUDIO_BOOK_BUCKET, MAX_AUDIO_BOOK_BYTES, canonicalAudioParsha } from "@/lib/parsha-audio-book";

const json = (body: unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export const Route = createFileRoute("/api/parsha-audio-book-upload")({
 server: { handlers: {
  POST: async ({ request }) => {
   const auth = request.headers.get("authorization") || "";
   if (!auth.startsWith("Bearer ")) return json({error:"Please sign in to Admin"},401);
   try { await verifyAdminAccessToken(auth.slice(7)); }
   catch { return json({error:"Not authorized to upload"},403); }
   const bytesHeader = Number(request.headers.get("content-length") || "0");
   if (bytesHeader > MAX_AUDIO_BOOK_BYTES + 1048576) return json({error:"MP3 exceeds 20 MB"},413);
   let form: FormData;
   try { form = await request.formData(); }
   catch { return json({error:"Unable to read MP3; select it again"},400); }
   const file=form.get("file"), year=Number(form.get("jewishYear"));
   const parshaInput=form.get("parshaKey");
   if (!(file instanceof File) || typeof parshaInput !== "string" || !Number.isInteger(year) || year<5000 || year>7000)
     return json({error:"Invalid upload details"},400);
   let parsha: string;
   try { parsha=canonicalAudioParsha(parshaInput); } catch { return json({error:"Invalid parsha"},400); }
   if (!file.name.toLowerCase().endsWith(".mp3") || file.size < 128 || file.size>MAX_AUDIO_BOOK_BYTES)
     return json({error:"Choose an MP3 under 20 MB"},413);
   try {
     const bytes = new Uint8Array(await file.arrayBuffer());
     if (!((bytes[0]===0x49 && bytes[1]===0x44 && bytes[2]===0x33) || (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0)))
       return json({error:"Not a recognized MP3 file"},400);
     const path=year+"/"+parsha+"/"+crypto.randomUUID()+".mp3";
     const { error } = await getSupabaseAdmin().storage.from(AUDIO_BOOK_BUCKET)
       .upload(path,bytes,{contentType:"audio/mpeg",upsert:false});
     if (error) return json({error:"Storage upload failed"},502);
     return json({path});
   } catch {return json({error:"Unable to upload MP3"},502);}
  },
 }},
});
