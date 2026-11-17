import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { safeSongMediaPath, songDownloadFilename, SONG_MEDIA_BUCKET } from "@/lib/parsha-song";
import { isAutomatedAgent } from "@/lib/request-telemetry.server";
import { isInternalRequest } from "@/lib/internal-marker.server";
import { checkRateLimit } from "@/lib/rate-limit.server";

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
          // Count a user-initiated MP3 request, not a confirmed transfer.
          // Bot previews, intentional prefetches and owner test devices are
          // excluded. Tracking failure must never prevent the download.
          try {
            const ua = request.headers.get("user-agent") ?? "";
            const purpose = (
              request.headers.get("purpose") ??
              request.headers.get("sec-purpose") ?? ""
            ).toLowerCase();
            const referer = request.headers.get("referer") || "";
            const sameOrigin = !referer || new URL(referer).origin === new URL(request.url).origin;
            if (sameOrigin && !/prefetch|prerender/.test(purpose) &&
                !isAutomatedAgent(ua) && !(await isInternalRequest(request)) &&
                await checkRateLimit(request, "song-download", "TRACKING_RATE_LIMITER")) {
              const { error: eventError } = await admin.from("parsha_song_events").insert({
                event_id: crypto.randomUUID(),
                song_id: id,
                event_kind: "download",
              });
              if (eventError) console.error("[song-download] tracking failed", eventError.message);
            }
          } catch (trackingError) {
            console.error("[song-download] tracking unavailable", trackingError);
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
