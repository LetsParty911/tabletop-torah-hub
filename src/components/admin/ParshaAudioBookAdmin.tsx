import { useEffect, useState } from "react";
import { adminListAudioBooks, adminSaveAudioBook, adminCreateAudioBookUploadUrl } from "@/integrations/supabase/parsha-audio-books.functions";
import { MAX_AUDIO_BOOK_BYTES, MAX_AUDIO_BOOK_COVER_BYTES, canonicalAudioParsha, type AudioBook } from "@/lib/parsha-audio-book";
import { PARSHIYOS } from "@/lib/parshiyos";

export function ParshaAudioBookAdmin({accessToken}:{accessToken:string}) {
 const [parsha,setParsha]=useState("Vayetzei"),[year,setYear]=useState(5787);
 const [title,setTitle]=useState("Parsha Audio Book — Parshas Vayetzei");
 const [description,setDescription]=useState("A captivating narrated retelling of Parshas Vayetzei, based on the Chumash with explanations from Rashi.");
 const [file,setFile]=useState<File|null>(null),[path,setPath]=useState<string|null>(null);
 const [coverFile,setCoverFile]=useState<File|null>(null),[coverPath,setCoverPath]=useState<string|null>(null);
 const [books,setBooks]=useState<AudioBook[]>([]);
 const [counts,setCounts]=useState<Record<string,{plays:number;downloads:number}>>({});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const [published,setPublished]=useState(false);
 async function refresh() {
   const data=await adminListAudioBooks({data:{accessToken}});
   setBooks(data.books);setCounts(data.counts);
 }
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:"Could not load audio books"));},[accessToken]);
 function pick(book:AudioBook) {
   setParsha(PARSHIYOS.find((item)=>canonicalAudioParsha(item)===book.parsha_key) || "Vayetzei");setYear(book.jewish_year);setTitle(book.title);
   setDescription(book.description||"");setPath(book.audio_path);setCoverPath(book.cover_path);setCoverFile(null);
   setFile(null);setPublished(book.published);setError("");setNotice("");
 }
 async function uploadMedia(selected:File,kind:"audio"|"cover"):Promise<string> {
   const label=kind==="audio"?"audiobook MP3":"cover image";
   const planned=await adminCreateAudioBookUploadUrl({data:{
     accessToken,parshaKey:parsha,jewishYear:year,kind,
     filename:selected.name,fileSize:selected.size,
   }});
   setNotice("Uploading "+label+" directly to secure storage…");
   let response:Response;
   try {
     response=await fetch(planned.signedUrl,{
       method:"PUT",headers:{"Content-Type":planned.contentType},body:selected,
     });
   } catch {
     throw new Error("Could not connect to secure audio storage. Check the connection or try Chrome. No publication was changed.");
   }
   if (!response.ok) {
     const detail=await response.text().catch(()=>"");
     let msg="";
     try {const parsed=JSON.parse(detail) as {message?:string;error?:string};msg=parsed.message||parsed.error||"";}catch {msg=detail.slice(0,160);}
     throw new Error("Storage rejected "+label+" ("+response.status+"). "+msg);
   }
   return planned.path;
 }
 async function submit(publish:boolean) {
   setBusy(true);setError("");setNotice("");
   try {
     let next=path;
     if(file) {
       if(file.size<128||file.size>MAX_AUDIO_BOOK_BYTES||!file.name.toLowerCase().endsWith(".mp3")) throw new Error("Choose an MP3 no larger than 20 MB");
       next=await uploadMedia(file,"audio");setPath(next);
     }
     let nextCover=coverPath;
     if(coverFile) {
       const ext=coverFile.name.toLowerCase().split(".").pop();
       if(coverFile.size<128||coverFile.size>MAX_AUDIO_BOOK_COVER_BYTES||!["jpg","jpeg","png"].includes(ext||""))
         throw new Error("Choose a JPG or PNG cover under 5 MB");
       nextCover=await uploadMedia(coverFile,"cover");setCoverPath(nextCover);
     }
     setNotice("Verifying files and saving audiobook details…");
     const saved=await adminSaveAudioBook({data:{
       accessToken,parshaKey:parsha,jewishYear:year,title,description,audioPath:next,coverPath:nextCover,published:publish,
     }});
     setPublished(saved.published);setFile(null);setCoverFile(null);
     await refresh();setNotice(publish?"Published successfully. Check the public Audio Book page.":"Saved as a private draft.");
   } catch(e) {setError(e instanceof Error?e.message:"Unable to save audio book");setNotice("");}
   finally {setBusy(false);}
 }
 const existing=books.find(b=>b.parsha_key===canonicalAudioParsha(parsha)&&b.jewish_year===year);
 return <section className="parchment-frame"><div className="parchment-panel space-y-5">
   <h2 className="font-serif text-2xl font-semibold text-primary">Parsha Audio Book</h2>
   <p className="text-sm text-muted-foreground">An independent audio-only series. Publish one MP3 per parsha/year. No video or song listing is involved.</p>
   {books.length>0&&<label className="block text-sm">Edit an existing recording
    <select className="mt-1 w-full rounded-md border bg-background p-3" value="" onChange={e=>{const book=books.find(b=>b.id===e.target.value);if(book)pick(book);}}>
      <option value="">Choose a recording</option>
      {books.map(b=><option key={b.id} value={b.id}>{b.title} · {b.jewish_year}{b.published?" (published)":""}</option>)}
    </select>
   </label>}
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm">Parsha
      <select className="mt-1 w-full rounded-md border bg-background p-3" value={parsha}
        onChange={e=>{setParsha(e.target.value);setPath(null);setCoverPath(null);setFile(null);setCoverFile(null);setPublished(false);}}>
        {PARSHIYOS.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
    </label>
    <label className="text-sm">Jewish Year
      <input type="number" min={5000} max={7000} value={year} className="mt-1 w-full rounded-md border bg-background p-3"
        onChange={e=>{setYear(Number(e.target.value));setPath(null);setCoverPath(null);setFile(null);setCoverFile(null);setPublished(false);}}/>
    </label>
   </div>
   <label className="block text-sm">Title
      <input value={title} maxLength={180} className="mt-1 w-full rounded-md border bg-background p-3" onChange={e=>setTitle(e.target.value)}/>
   </label>
   <label className="block text-sm">Description
      <textarea value={description} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border bg-background p-3" onChange={e=>setDescription(e.target.value)}/>
   </label>
   <label className="block text-sm">MP3 recording (20 MB maximum)
     <input type="file" accept=".mp3,audio/mpeg" className="mt-2 block w-full" onChange={e=>setFile(e.target.files?.[0]||null)}/>
     {path&&<span className="text-muted-foreground">An MP3 is already stored; choose a new file only to replace it.</span>}
   </label>
   <label className="block text-sm">Cover image for the online player (JPG or PNG; maximum 5 MB)
     <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="mt-2 block w-full" onChange={e=>setCoverFile(e.target.files?.[0]||null)}/>
     {coverPath&&<span className="block text-muted-foreground">Cover uploaded. Select a different image only to replace it.</span>}
   </label>
   <p className="text-xs text-muted-foreground">The cover upload displays the picture on the website. For offline artwork, upload an MP3 that already contains the cover in its ID3 tags.</p>
   {existing&&<p className="text-sm">Current recording: {existing.published?"Published":"Draft"} · Plays requested: {counts[existing.id]?.plays||0} · Downloads requested: {counts[existing.id]?.downloads||0}</p>}
   {published&&<p className="text-sm">Published. Save as Draft to hide it from visitors.</p>}
   {notice&&<p role="status" className="text-sm text-primary">{notice}</p>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   <div className="flex flex-wrap gap-3">
    <button type="button" disabled={busy||!title.trim()} onClick={()=>void submit(false)}
      className="min-h-11 rounded-full border-2 border-primary px-5 py-2 font-semibold text-primary disabled:opacity-50">Save as Draft</button>
    <button type="button" disabled={busy||!title.trim()||!(file||path)} onClick={()=>void submit(true)}
      className="min-h-11 rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">{busy?"Working…":"Upload & Publish"}</button>
   </div>
 </div></section>;
}
