import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { verifyAdminAccessToken } from "@/lib/admin-auth.server";
import {
  canonicalSongParsha,
  MAX_SONG_COVER_BYTES,
  MAX_SONG_MP3_BYTES,
  SONG_MEDIA_BUCKET,
} from "@/lib/parsha-song";

/**
 * Upload through the site's own origin rather than transferring media from a
 * mobile browser directly to a different Supabase domain. Auth is verified
 * BEFORE reading the multipart body, and the service key stays server-side.
 */
function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

function validMagic(bytes: Uint8Array, kind: "audio" | "cover", extension: string): boolean {
  if (kind === "audio") {
    // ID3-tagged MP3, or a raw MPEG audio frame header.
    return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (extension === "png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, i) => bytes[i] === value);
  }
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export const Route = createFileRoute("/api/parsha-song-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return json({ error: "Please sign in to Admin again." }, 401);
        try {
          await verifyAdminAccessToken(auth.slice(7));
        } catch (error) {
          return json({ error: error instanceof Error && error.message === "Forbidden" ? "Not authorized" : "Session expired. Sign in again." },
            error instanceof Error && error.message === "Forbidden" ? 403 : 401);
        }

        // Reject obviously over-limit requests without buffering their contents.
        const length = Number(request.headers.get("Content-Length") ?? "0");
        if (length > MAX_SONG_MP3_BYTES + 1024 * 1024) {
          return json({ error: "Upload exceeds the 20 MB MP3 limit." }, 413);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Unable to read the selected file. Select it again and retry." }, 400);
        }
        const kind = form.get("kind");
        const parshaRaw = form.get("parshaKey");
        const yearRaw = form.get("jewishYear");
        const file = form.get("file");
        if ((kind !== "audio" && kind !== "cover") ||
            typeof parshaRaw !== "string" ||
            typeof yearRaw !== "string" ||
            !(file instanceof File)) {
          return json({ error: "Invalid upload form. Select the MP3 or cover again." }, 400);
        }
        const year = Number(yearRaw);
        if (!Number.isInteger(year) || year < 5000 || year > 7000) {
          return json({ error: "Invalid Jewish year." }, 400);
        }
        let parsha: string;
        try { parsha = canonicalSongParsha(parshaRaw); }
        catch { return json({ error: "Select a valid parsha." }, 400); }

        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        const ext = extension === "jpeg" ? "jpg" : extension;
        if ((kind === "audio" && ext !== "mp3") ||
            (kind === "cover" && ext !== "jpg" && ext !== "png")) {
          return json({ error: kind === "audio" ? "Choose an MP3 file." : "Choose a JPG or PNG cover." }, 400);
        }

        const max = kind === "audio" ? MAX_SONG_MP3_BYTES : MAX_SONG_COVER_BYTES;
        if (file.size < 128 || file.size > max) {
          return json({ error: kind === "audio" ? "MP3 must be between 128 bytes and 20 MB." : "Cover must be between 128 bytes and 5 MB." }, 413);
        }

        try {
          const contents = new Uint8Array(await file.arrayBuffer());
          if (!validMagic(contents, kind, ext)) {
            return json({ error: kind === "audio" ? "The selected file is not a recognized MP3." : "The cover is not a valid JPG/PNG file." }, 400);
          }
          const path = year + "/" + parsha + "/" + crypto.randomUUID() + "." + ext;
          const contentType = kind === "audio" ? "audio/mpeg" : ext === "png" ? "image/png" : "image/jpeg";
          const { error } = await getSupabaseAdmin().storage.from(SONG_MEDIA_BUCKET)
            .upload(path, contents, { contentType, upsert: false });
          if (error) {
            console.error("[parsha-song-upload] Supabase rejected upload", error.message);
            return json({ error: "Music storage could not save the file. Please retry." }, 502);
          }
          return json({ path });
        } catch (error) {
          console.error("[parsha-song-upload] upload failed", error);
          return json({ error: "Upload connection failed on the server. Please retry from Admin." }, 502);
        }
      },
    },
  },
});
