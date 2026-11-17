import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { safeSongMediaPath, songDownloadFilename, SONG_MEDIA_BUCKET } from "@/lib/parsha-song";

export const Route = createFileRoute("/parsha-song/$id/download")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { maintenanceGate } = await import("@/lib/maintenance.server");
        const closed = await maintenanceGate(new URL(request.url).pathname);
        if (closed) return closed;
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400, headers: { "X-Robots-Tag": "noindex" } });
        }
        try {
          const admin = getSupabaseAdmin();
          const { data: song, error } = await admin.from("parsha_songs")
            .select("title,parsha_key,jewish_year,audio_path,published")
            .eq("id", id).maybeSingle();
          if (error || !song?.published || !song.audio_path ||
              !safeSongMediaPath(song.audio_path, song.jewish_year, song.parsha_key, "audio")) {
            return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
          }
          const publicUrl = admin.storage.from(SONG_MEDIA_BUCKET).getPublicUrl(song.audio_path).data.publicUrl;
          const downloadUrl = new URL(publicUrl);
          downloadUrl.searchParams.set("download", songDownloadFilename(song.title, song.parsha_key, song.jewish_year));
          return new Response(null, {
            status: 302,
            headers: {
              "Location": downloadUrl.toString(),
              "Cache-Control": "no-store",
              "X-Robots-Tag": "noindex",
            },
          });
        } catch {
          return new Response("Song download unavailable", { status: 500, headers: { "X-Robots-Tag": "noindex" } });
        }
      },
    },
  },
});
