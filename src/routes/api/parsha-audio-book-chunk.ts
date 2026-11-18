import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { verifyAdminAccessToken } from "@/lib/admin-auth.server";
import { AUDIO_BOOK_BUCKET, MAX_AUDIO_BOOK_BYTES, MAX_AUDIO_BOOK_COVER_BYTES, canonicalAudioParsha } from "@/lib/parsha-audio-book";

// The phone sends small same-origin requests. No browser-to-Supabase cross-origin
// upload is needed. Server uploads chunks to private storage and reassembles them.
const CHUNK_BYTES = 1024 * 1024;
const MAX_PARTS = 20;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
});
const nonEmptyString = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

type MediaKind = "audio" | "cover";
function mediaInfo(kind: string, extension: string, size: number) {
  if (kind !== "audio" && kind !== "cover") throw new Error("Invalid media type");
  const ext = extension.toLowerCase() === "jpeg" ? "jpg" : extension.toLowerCase();
  const max = kind === "audio" ? MAX_AUDIO_BOOK_BYTES : MAX_AUDIO_BOOK_COVER_BYTES;
  if (size < 128 || size > max) throw new Error("File size is outside upload limits");
  if (kind === "audio" && ext !== "mp3") throw new Error("Select a valid MP3");
  if (kind === "cover" && ext !== "jpg" && ext !== "png") throw new Error("Select a JPG or PNG cover");
  const mime = kind === "audio" ? "audio/mpeg" : ext === "png" ? "image/png" : "image/jpeg";
  return { kind: kind as MediaKind, ext, mime, max };
}
function recognizedFile(bytes: Uint8Array, kind: MediaKind, ext: string): boolean {
  if (kind === "audio")
    return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (ext === "png") return [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((b,i)=> bytes[i] === b);
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
function metadata(form: FormData) {
  const uploadId = nonEmptyString(form.get("uploadId")) || "";
  const kind = nonEmptyString(form.get("kind")) || "";
  const extension = nonEmptyString(form.get("extension")) || "";
  const year = Number(form.get("jewishYear"));
  const size = Number(form.get("fileSize"));
  const parsha = canonicalAudioParsha(nonEmptyString(form.get("parshaKey")) || "");
  if (!uuid.test(uploadId) || !Number.isInteger(year) || year < 5000 || year > 7000 ||
    !Number.isInteger(size)) throw new Error("Invalid upload request");
  const media = mediaInfo(kind, extension, size);
  return { uploadId, year, size, parsha, ...media,
    partCount: Math.ceil(size / CHUNK_BYTES),
    tempPrefix: "_pending/" + uploadId + "/",
  };
}

export const Route = createFileRoute("/api/parsha-audio-book-chunk")({
  server: { handlers: {
    POST: async ({ request }) => {
      const authorization = request.headers.get("authorization") || "";
      if (!authorization.startsWith("Bearer ")) return json({error:"Sign in to Admin again"},401);
      try { await verifyAdminAccessToken(authorization.slice(7)); }
      catch { return json({error:"Administrator session expired or access denied"},403); }
      const length = Number(request.headers.get("content-length") || "0");
      if (length > CHUNK_BYTES + 65536) return json({error:"Chunk exceeds upload limit"},413);
      let form: FormData;
      try { form = await request.formData(); } catch { return json({error:"Unable to read upload request"},400); }
      let m: ReturnType<typeof metadata>;
      try { m = metadata(form); }
      catch (e) { return json({error:e instanceof Error?e.message:"Invalid upload metadata"},400); }
      if (m.partCount < 1 || m.partCount > MAX_PARTS) return json({error:"File has too many parts"},413);
      const store = getSupabaseAdmin().storage.from(AUDIO_BOOK_BUCKET);
      const action = nonEmptyString(form.get("action"));

      if (action === "chunk") {
        const index = Number(form.get("index"));
        const blob = form.get("chunk");
        if (!(blob instanceof File) || !Number.isInteger(index) || index < 0 || index >= m.partCount)
          return json({error:"Invalid upload chunk"},400);
        const expected = index === m.partCount - 1 ? m.size - index * CHUNK_BYTES : CHUNK_BYTES;
        if (blob.size !== expected) return json({error:"Incorrect chunk size"},400);
        const partPath = m.tempPrefix + index + "." + m.ext;
        const {error} = await store.upload(partPath,new Uint8Array(await blob.arrayBuffer()),{
          contentType:m.mime, upsert:true,cacheControl:"60",
        });
        if (error) {
          console.error("[audiobook-chunk] upload failed",error.message);
          return json({error:"Storage could not accept this chunk"},502);
        }
        return json({ok:true,index});
      }

      if (action !== "complete") return json({error:"Invalid upload operation"},400);
      // All parts must be present and exactly the specified size.
      const buffer = new Uint8Array(m.size);
      let pos = 0;
      for (let index=0; index < m.partCount; index++) {
        const partPath = m.tempPrefix + index + "." + m.ext;
        const {data,error} = await store.download(partPath);
        if (error || !data) return json({error:"A portion of the upload is missing. Select the file and retry."},409);
        const part = new Uint8Array(await data.arrayBuffer());
        const expected = index === m.partCount - 1 ? m.size - index * CHUNK_BYTES : CHUNK_BYTES;
        if (part.length !== expected) return json({error:"An uploaded portion has the wrong size"},409);
        buffer.set(part,pos);pos += part.length;
      }
      if (pos !== m.size || !recognizedFile(buffer,m.kind,m.ext)) return json({error:"The uploaded file failed validation"},400);
      const finalPath = m.year + "/" + m.parsha + "/" +
        (m.kind === "cover" ? "cover-" : "") + crypto.randomUUID() + "." + m.ext;
      const {error:finalError} = await store.upload(finalPath,buffer,{
        contentType:m.mime,upsert:false,cacheControl:"3600",
      });
      if (finalError) {
        console.error("[audiobook-chunk] final storage upload failed",finalError.message);
        return json({error:"Storage could not finalize the audio file"},502);
      }
      const tempPaths = Array.from({length:m.partCount},(_,i)=>m.tempPrefix+i+"."+m.ext);
      const {error:cleanupError} = await store.remove(tempPaths);
      if (cleanupError) console.error("[audiobook-chunk] temp cleanup failed",cleanupError.message);
      return json({path:finalPath});
    },
  }},
});
