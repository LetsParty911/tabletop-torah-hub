import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { isInternalRequest } from "@/lib/internal-marker.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { isAutomatedAgent } from "@/lib/request-telemetry.server";
import { isSongEventId } from "@/lib/song-engagement";

/** Public, write-only first-party ingest. No client access to the database table. */
export const Route = createFileRoute("/api/parsha-song-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Reject cross-origin browser submissions. Same-origin fetches may
          // omit Origin; disallow non-site referrers when supplied.
          const origin = request.headers.get("origin");
          const requestOrigin = new URL(request.url).origin;
          if (origin && origin !== requestOrigin) return new Response(null, { status: 403 });
          const referrer = request.headers.get("referer");
          if (referrer) {
            const from = new URL(referrer);
            if (from.origin !== requestOrigin || from.pathname.startsWith("/admin")) {
              return new Response(null, { status: 204 });
            }
          }
          if (!(await checkRateLimit(request, "song-play", "TRACKING_RATE_LIMITER"))) {
            return new Response(null, { status: 204 });
          }
          if (isAutomatedAgent(request.headers.get("user-agent") ?? "") ||
              await isInternalRequest(request)) {
            return new Response(null, { status: 204 });
          }
          if (Number(request.headers.get("content-length") || 0) > 2048) {
            return new Response(null, { status: 413 });
          }
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" ||
              !isSongEventId(body.songId) || !isSongEventId(body.eventId) ||
              body.eventKind !== "play") {
            return new Response(null, { status: 400 });
          }
          const supabase = getSupabaseAdmin();
          const { data: song, error: songError } = await supabase.from("parsha_songs")
            .select("id").eq("id", body.songId).eq("published", true).maybeSingle();
          if (songError || !song) return new Response(null, { status: 204 });
          const { error } = await supabase.from("parsha_song_events").upsert({
            event_id: body.eventId,
            song_id: song.id,
            event_kind: "play",
          }, { onConflict: "event_id", ignoreDuplicates: true });
          if (error) console.error("[parsha-song-event] insert failed", error.message);
        } catch (error) {
          console.error("[parsha-song-event] tracking unavailable", error);
        }
        // Never interrupt music playback because analytics is unavailable.
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
