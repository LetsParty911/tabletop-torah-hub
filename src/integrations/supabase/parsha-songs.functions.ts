import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { verifyAdminAccessToken } from "@/lib/admin-auth.server";
import { getCurrentJewishYear } from "@/lib/jewish-year";
import {
  SONG_MEDIA_BUCKET, MAX_SONG_MP3_BYTES, MAX_SONG_COVER_BYTES,
  canonicalSongParsha, safeSongMediaPath,
  type AdminSong, type ParshaSong,
} from "@/lib/parsha-song";

const FIELDS = "id,parsha_key,jewish_year,title,description,lyrics,audio_path,cover_path,published";
const PUBLIC_FIELDS = FIELDS + ",created_at";

function toPublicSong(row: AdminSong & { created_at: string }): ParshaSong | null {
  if (!row.published || !row.audio_path || !row.cover_path ||
      !safeSongMediaPath(row.audio_path, row.jewish_year, row.parsha_key, "audio") ||
      !safeSongMediaPath(row.cover_path, row.jewish_year, row.parsha_key, "cover")) return null;
  const storage = getSupabaseAdmin().storage.from(SONG_MEDIA_BUCKET);
  return {
    id: row.id, parshaKey: row.parsha_key, jewishYear: row.jewish_year,
    title: row.title, description: row.description, lyrics: row.lyrics,
    audioUrl: storage.getPublicUrl(row.audio_path).data.publicUrl,
    coverUrl: storage.getPublicUrl(row.cover_path).data.publicUrl,
    createdAt: row.created_at,
  };
}

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" ||
    /parsha_songs.*(does not exist|not found|schema cache)/i.test(error.message ?? ""));
}

export const listPublishedParshaSongs = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await getSupabaseAdmin().from("parsha_songs")
    .select(PUBLIC_FIELDS).eq("published", true)
    .order("jewish_year", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (missingTable(error)) return [] as ParshaSong[];
  if (error) throw new Error("Unable to load Parsha in Song archive");
  return ((data ?? []) as Array<AdminSong & { created_at: string }>)
    .map(toPublicSong).filter((song): song is ParshaSong => song !== null);
});

export const getCurrentParshaSong = createServerFn({ method: "GET" })
  .inputValidator((input: { parshaKey: string | null }) =>
    z.object({ parshaKey: z.string().max(120).nullable() }).parse(input))
  .handler(async ({ data }) => {
    if (!data.parshaKey) return null as ParshaSong | null;
    const year = await getCurrentJewishYear();
    const parsha = canonicalSongParsha(data.parshaKey);
    const { data: row, error } = await getSupabaseAdmin().from("parsha_songs")
      .select(PUBLIC_FIELDS).eq("published", true)
      .eq("parsha_key", parsha).eq("jewish_year", year).maybeSingle();
    if (missingTable(error)) return null;
    if (error) throw new Error("Unable to load this week's song");
    return row ? toPublicSong(row as AdminSong & { created_at: string }) : null;
  });

export const adminListParshaSongs = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    await verifyAdminAccessToken(data.accessToken);
    const { data: rows, error } = await getSupabaseAdmin().from("parsha_songs")
      .select(FIELDS).order("jewish_year", { ascending: false });
    if (error) throw new Error("Song storage is not set up. Apply the reviewed SQL migration first.");
    return (rows ?? []) as AdminSong[];
  });

const fileIntentSchema = z.object({
  accessToken: z.string().min(10),
  parshaKey: z.string().min(2).max(120),
  jewishYear: z.number().int().min(5000).max(7000),
  kind: z.enum(["audio", "cover"]),
  extension: z.enum(["mp3", "jpg", "png"]),
  size: z.number().int().positive(),
});

export const adminSignParshaSongUpload = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof fileIntentSchema>) => fileIntentSchema.parse(input))
  .handler(async ({ data }) => {
    await verifyAdminAccessToken(data.accessToken);
    if ((data.kind === "audio" && data.extension !== "mp3") ||
      (data.kind === "cover" && data.extension === "mp3")) throw new Error("Incorrect file extension");
    if (data.size > (data.kind === "audio" ? MAX_SONG_MP3_BYTES : MAX_SONG_COVER_BYTES)) {
      throw new Error(data.kind === "audio" ? "MP3 must be under 20 MB" : "Cover must be under 5 MB");
    }
    const parsha = canonicalSongParsha(data.parshaKey);
    const path = data.jewishYear + "/" + parsha + "/" + crypto.randomUUID() + "." + data.extension;
    const { data: signed, error } = await getSupabaseAdmin().storage
      .from(SONG_MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !signed?.token) throw new Error("Could not authorize media upload. Check that the music storage bucket exists.");
    const storageUrl = process.env["EXT_SUPABASE_URL"] || process.env["SUPABASE_URL"];
    const publishableKey = process.env["EXT_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!storageUrl || !publishableKey) throw new Error("Media storage configuration missing");
    // This is a publishable key, never the service role secret. The signed upload
    // token can only create the particular path granted by the authenticated server.
    return { path, token: signed.token, storageUrl, publishableKey };
  });

const saveSchema = z.object({
  accessToken: z.string().min(10),
  parshaKey: z.string().min(2).max(120),
  jewishYear: z.number().int().min(5000).max(7000),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).optional(),
  lyrics: z.string().max(25000).optional(),
  published: z.boolean(),
  audioPath: z.string().max(240).nullable(),
  coverPath: z.string().max(240).nullable(),
});

async function fileExists(storage: any, path: string): Promise<boolean> {
  const i = path.lastIndexOf("/");
  const { data, error } = await storage.list(path.slice(0, i), { search: path.slice(i + 1), limit: 100 });
  return !error && (data ?? []).some((file: { name: string }) => file.name === path.slice(i + 1));
}

export const adminSaveParshaSong = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof saveSchema>) => saveSchema.parse(input))
  .handler(async ({ data }) => {
    await verifyAdminAccessToken(data.accessToken);
    const parsha = canonicalSongParsha(data.parshaKey);
    const admin = getSupabaseAdmin();
    const storage = admin.storage.from(SONG_MEDIA_BUCKET);
    const { data: existing, error: existingError } = await admin.from("parsha_songs")
      .select(FIELDS).eq("parsha_key", parsha).eq("jewish_year", data.jewishYear).maybeSingle();
    if (existingError) throw new Error("Song database unavailable. Apply migration before saving.");
    const audioPath = data.audioPath || existing?.audio_path || null;
    const coverPath = data.coverPath || existing?.cover_path || null;
    if (audioPath && !safeSongMediaPath(audioPath, data.jewishYear, parsha, "audio"))
      throw new Error("Unexpected MP3 path");
    if (coverPath && !safeSongMediaPath(coverPath, data.jewishYear, parsha, "cover"))
      throw new Error("Unexpected cover path");
    // Only owner-approved, uploaded assets can be published. Do not rely
    // on browser-submitted paths alone, even for authenticated admins.
    if (data.published && (!audioPath || !coverPath)) throw new Error("Upload both files before publishing");
    if (audioPath && !(await fileExists(storage, audioPath))) throw new Error("MP3 not found in storage");
    if (coverPath && !(await fileExists(storage, coverPath))) throw new Error("Cover not found in storage");
    const { data: saved, error } = await admin.from("parsha_songs").upsert({
      parsha_key: parsha, jewish_year: data.jewishYear, title: data.title,
      description: data.description || null, lyrics: data.lyrics || null,
      audio_path: audioPath, cover_path: coverPath, published: data.published,
    }, { onConflict: "parsha_key,jewish_year" }).select(FIELDS).single();
    if (error) throw new Error("Could not save song: " + error.message);
    return saved as AdminSong;
  });

/** Admin-only metrics for every song, including published and draft titles. */
export const adminParshaSongAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    await verifyAdminAccessToken(data.accessToken);
    const admin = getSupabaseAdmin();
    const [songs, metrics] = await Promise.all([
      admin.from("parsha_songs").select("id,title,parsha_key,jewish_year,published")
        .order("jewish_year", { ascending: false }),
      admin.from("parsha_song_event_totals")
        .select("song_id,plays_total,downloads_total,plays_7d,downloads_7d"),
    ]);
    if (songs.error || metrics.error) {
      throw new Error("Unable to load music analytics. Check that the analytics migration was applied.");
    }
    const totals = new Map<string, {
      plays_total: number; downloads_total: number; plays_7d: number; downloads_7d: number;
    }>();
    for (const row of metrics.data ?? []) {
      totals.set(row.song_id, {
        plays_total: Number(row.plays_total ?? 0),
        downloads_total: Number(row.downloads_total ?? 0),
        plays_7d: Number(row.plays_7d ?? 0),
        downloads_7d: Number(row.downloads_7d ?? 0),
      });
    }
    return (songs.data ?? []).map((song: {
      id: string; title: string; parsha_key: string; jewish_year: number; published: boolean;
    }) => ({
      songId: song.id,
      title: song.title,
      parshaKey: song.parsha_key,
      jewishYear: song.jewish_year,
      published: song.published,
      playsTotal: totals.get(song.id)?.plays_total ?? 0,
      downloadsTotal: totals.get(song.id)?.downloads_total ?? 0,
      plays7d: totals.get(song.id)?.plays_7d ?? 0,
      downloads7d: totals.get(song.id)?.downloads_7d ?? 0,
    }));
  });
