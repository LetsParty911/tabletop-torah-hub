import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { AUDIO_BOOK_BUCKET, audioBookDownloadName, validAudioBookPath, type AudioBook } from "@/lib/parsha-audio-book";

const json = (body: unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
export const Route = createFileRoute("/api/parsha-audio-book/$id")({
 server: {handlers: {
   GET: async ({ request, params }) => {
     const url = new URL(request.url);
     const kind = url.searchParams.get("action");
     if (kind !== "play" && kind !== "download") return json({error:"Invalid audio action"},400);
     const id = params.id;
     if (!/^[0-9a-f-]{36}$/.test(id)) return json({error:"Not found"},404);
     const client=getSupabaseAdmin();
     const {data,error}=await client.from("parsha_audio_books")
       .select("id,parsha_key,jewish_year,title,description,audio_path,published,created_at")
       .eq("id",id).eq("published",true).maybeSingle();
     if (error || !data) return json({error:"Not found"},404);
     const book=data as AudioBook;
     if (!validAudioBookPath(book.audio_path,book.jewish_year,book.parsha_key)) return json({error:"Not found"},404);
     const {data:signed,error:signError}=await client.storage.from(AUDIO_BOOK_BUCKET)
       .createSignedUrl(book.audio_path!,3600,kind==="download"?{download:audioBookDownloadName(book)}:undefined);
     if (signError || !signed?.signedUrl) return json({error:"Audio temporarily unavailable"},503);
     // Counts represent a requested play or download, not a completed listen or verified saved file.
     const {error:eventError}=await client.from("parsha_audio_book_events")
       .insert({book_id:id,event_type:kind});
     if (eventError) console.error("Audio event recording failed",eventError.message);
     if (kind==="download") return new Response(null,{status:302,headers:{
       Location:signed.signedUrl,"Cache-Control":"no-store","X-Robots-Tag":"noindex"
     }});
     return json({url:signed.signedUrl});
   },
 }},
});
