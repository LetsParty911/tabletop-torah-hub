import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { verifyAdminAccessToken } from "@/lib/admin-auth.server";
import { AUDIO_BOOK_BUCKET, MAX_AUDIO_BOOK_BYTES, MAX_AUDIO_BOOK_COVER_BYTES, canonicalAudioParsha, validAudioBookPath, validAudioBookCoverPath, type AudioBook } from "@/lib/parsha-audio-book";

const columns = "id,parsha_key,jewish_year,title,description,audio_path,cover_path,published,created_at";

export const listPublishedAudioBooks = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await getSupabaseAdmin().from("parsha_audio_books")
    .select(columns).eq("published", true).order("jewish_year", { ascending: false })
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Unable to load Parsha Audio Books");
  return ((data || []) as AudioBook[]).filter(book => validAudioBookPath(book.audio_path, book.jewish_year, book.parsha_key));
});

export const adminListAudioBooks = createServerFn({ method: "POST" })
 .inputValidator((data: { accessToken: string }) => z.object({ accessToken: z.string().min(10) }).parse(data))
 .handler(async ({ data }) => {
   await verifyAdminAccessToken(data.accessToken);
   const admin = getSupabaseAdmin();
   const { data: books, error } = await admin.from("parsha_audio_books").select(columns)
     .order("jewish_year", { ascending: false }).order("created_at", { ascending: false });
   if (error) throw new Error("Unable to load audio books");
   const { data: totals, error: countError } = await admin.from("parsha_audio_book_counts")
     .select("book_id,plays,downloads");
   if (countError) throw new Error("Unable to load audio engagement totals");
   const counts: Record<string, { plays: number; downloads: number }> = {};
   for (const row of totals || []) {
     counts[row.book_id] = { plays: Number(row.plays), downloads: Number(row.downloads) };
   }
   return { books: (books || []) as AudioBook[], counts };
 });


/**
 * Prepare a signed upload to external Supabase Storage.
 * The browser sends media directly to Storage, not through Lovable/Vercel's
 * application server. Only verified administrators can mint upload tokens.
 */
const uploadRequestSchema = z.object({
  accessToken: z.string().min(10),
  parshaKey: z.string().min(2).max(120),
  jewishYear: z.number().int().min(5000).max(7000),
  kind: z.enum(["audio", "cover"]),
  filename: z.string().min(5).max(240),
  fileSize: z.number().int().min(128),
});

export const adminCreateAudioBookUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof uploadRequestSchema>) => uploadRequestSchema.parse(input))
  .handler(async ({ data }) => {
    await verifyAdminAccessToken(data.accessToken);
    const parsha = canonicalAudioParsha(data.parshaKey);
    const suffix = data.filename.trim().toLowerCase().split(".").pop() || "";
    const isAudio = data.kind === "audio";
    const isPng = suffix === "png";
    const isJpeg = suffix === "jpg" || suffix === "jpeg";
    const isValid = isAudio ? suffix === "mp3" : (isPng || isJpeg);
    const limit = isAudio ? MAX_AUDIO_BOOK_BYTES : MAX_AUDIO_BOOK_COVER_BYTES;
    if (!isValid || data.fileSize > limit) {
      throw new Error(isAudio ? "Choose an MP3 no larger than 20 MB" : "Choose a JPG or PNG under 5 MB");
    }
    const ext = isAudio ? "mp3" : isPng ? "png" : "jpg";
    const contentType = isAudio ? "audio/mpeg" : isPng ? "image/png" : "image/jpeg";
    const prefix = data.jewishYear + "/" + parsha + "/";
    const path = prefix + (isAudio ? "" : "cover-") + crypto.randomUUID() + "." + ext;
    const { data: signed, error } = await getSupabaseAdmin().storage.from(AUDIO_BOOK_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed?.signedUrl) {
      throw new Error("Could not start the direct storage upload");
    }
    return { path, signedUrl: signed.signedUrl as string, contentType };
  });

const saveSchema = z.object({
 accessToken: z.string().min(10), parshaKey: z.string().min(2).max(120),
 jewishYear: z.number().int().min(5000).max(7000),
 title: z.string().trim().min(1).max(180),
 description: z.string().trim().max(1000),
 audioPath: z.string().max(240).nullable(),
 coverPath: z.string().max(240).nullable(),
 published: z.boolean(),
});

export const adminSaveAudioBook = createServerFn({ method: "POST" })
 .inputValidator((input: z.input<typeof saveSchema>) => saveSchema.parse(input))
 .handler(async ({ data }) => {
    await verifyAdminAccessToken(data.accessToken);
    const parsha = canonicalAudioParsha(data.parshaKey);
    const admin = getSupabaseAdmin();
    const { data: existing, error: fetchError } = await admin.from("parsha_audio_books")
      .select("audio_path,cover_path").eq("parsha_key", parsha).eq("jewish_year", data.jewishYear).maybeSingle();
    if (fetchError) throw new Error("Unable to verify the existing audio book");
    const path = data.audioPath || existing?.audio_path || null;
    const coverPath = data.coverPath || existing?.cover_path || null;
    if (path && !validAudioBookPath(path, data.jewishYear, parsha)) throw new Error("Unexpected audio path");
    if (coverPath && !validAudioBookCoverPath(coverPath, data.jewishYear, parsha)) throw new Error("Unexpected cover image path");
    if (data.published && !path) throw new Error("Upload an MP3 before publishing");
    if (path) {
      const i = path.lastIndexOf("/");
      const { data: objects, error } = await admin.storage.from(AUDIO_BOOK_BUCKET)
        .list(path.slice(0,i),{search:path.slice(i+1),limit:100});
      if (error || !(objects || []).some((o: {name:string}) => o.name === path.slice(i+1)))
        throw new Error("The MP3 could not be found in storage");
    }
    if (coverPath) {
      const i = coverPath.lastIndexOf("/");
      const { data: objects, error } = await admin.storage.from(AUDIO_BOOK_BUCKET)
        .list(coverPath.slice(0,i),{search:coverPath.slice(i+1),limit:100});
      if (error || !(objects || []).some((o: {name:string}) => o.name === coverPath.slice(i+1)))
        throw new Error("The cover image could not be found in storage");
    }
    const { data: saved, error } = await admin.from("parsha_audio_books").upsert({
      parsha_key: parsha, jewish_year: data.jewishYear, title: data.title.trim(),
      description: data.description.trim() || null, audio_path: path, cover_path: coverPath, published: data.published,
      updated_at: new Date().toISOString(),
    }, {onConflict:"parsha_key,jewish_year"}).select(columns).single();
    if (error) throw new Error("Unable to save audiobook: "+error.message);
    return saved as AudioBook;
 });
