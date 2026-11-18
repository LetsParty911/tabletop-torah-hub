import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { verifyAdminAccessToken } from "@/lib/admin-auth.server";
import { AUDIO_BOOK_BUCKET, MAX_AUDIO_BOOK_BYTES, MAX_AUDIO_BOOK_COVER_BYTES, canonicalAudioParsha } from "@/lib/parsha-audio-book";

const json = (body: unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export const Route = createFileRoute("/api/parsha-audio-book-upload")({
 server: { handlers: {
  POST: async ({ request }) => {
   const auth = request.headers.get("authorization") || "";
   if (!auth.startsWith("Bearer ")) return json({error:"Please sign in to Admin"},401);
   try { await verifyAdminAccessToken(auth.slice(7)); }
   catch { return json({error:"Not authorized to upload"},403); }
   const bytesHeader = Number(request.headers.get("content-length") || "0");
   if (bytesHeader > MAX_AUDIO_BOOK_BYTES + 1048576) return json({error:"Upload exceeds 20 MB"},413);
   let form: FormData;
   try { form = await request.formData(); }
   catch { return json({error:"Unable to read file; select it again"},400); }
   const file=form.get("file"), year=Number(form.get("jewishYear"));
   const parshaInput=form.get("parshaKey");
   const rawKind = form.get("kind");
   const kind = rawKind === null ? "audio" : rawKind;
   if ((kind !== "audio" && kind !== "cover") || !(file instanceof File) || typeof parshaInput !== "string" || !Number.isInteger(year) || year<5000 || year>7000)
     return json({error:"Invalid upload details"},400);
   let parsha: string;
   try { parsha=canonicalAudioParsha(parshaInput); } catch { return json({error:"Invalid parsha"},400); }
   const ext=file.name.toLowerCase().split(".").pop();
   const validExt = kind === "audio" ? ext === "mp3" : ["jpg","jpeg","png"].includes(ext || "");
   const maxBytes = kind === "audio" ? MAX_AUDIO_BOOK_BYTES : MAX_AUDIO_BOOK_COVER_BYTES;
   if (!validExt || file.size < 128 || file.size > maxBytes)
     return json({error:kind === "audio"?"Choose an MP3 no larger than 20 MB":"Choose a JPG or PNG cover no larger than 5 MB"},413);
   try {
     const bytes = new Uint8Array(await file.arrayBuffer());
     const audioMagic = (bytes[0]===0x49 && bytes[1]===0x44 && bytes[2]===0x33) || (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0);
     const pngMagic = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((b,i)=>bytes[i]===b);
     const jpgMagic = bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
     if (kind === "audio" ? !audioMagic : (ext==="png" ? !pngMagic : !jpgMagic))
       return json({error:kind === "audio"?"Not a recognized MP3 file":"Not a recognized JPG or PNG cover"},400);
     const actualExt = kind === "audio" ? "mp3" : ext === "png" ? "png" : "jpg";
     const path=year+"/"+parsha+"/"+(kind === "cover" ? "cover-" : "")+crypto.randomUUID()+"."+actualExt;
     const contentType=kind==="audio"?"audio/mpeg":actualExt==="png"?"image/png":"image/jpeg";
     const { error } = await getSupabaseAdmin().storage.from(AUDIO_BOOK_BUCKET)
       .upload(path,bytes,{contentType,upsert:false});
     if (error) return json({error:"Storage upload failed"},502);
     return json({path});
   } catch {return json({error:"Unable to upload file"},502);}
  },
 }},
});
