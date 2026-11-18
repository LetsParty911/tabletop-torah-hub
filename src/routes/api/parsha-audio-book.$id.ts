import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { isAutomatedAgent } from "@/lib/request-telemetry.server";
import { isInternalRequest } from "@/lib/internal-marker.server";
import { AUDIO_BOOK_BUCKET, audioBookDownloadName, validAudioBookPath, validAudioBookCoverPath, type AudioBook } from "@/lib/parsha-audio-book";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

export const Route = createFileRoute("/api/parsha-audio-book/$id")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const kind = new URL(request.url).searchParams.get("action");
      if (kind !== "play" && kind !== "download" && kind !== "cover") return json({ error: "Invalid audio action" }, 400);
      const id = params.id;
      if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Not found" }, 404);
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.from("parsha_audio_books")
        .select("id,parsha_key,jewish_year,title,description,audio_path,cover_path,published,created_at")
        .eq("id", id).eq("published", true).maybeSingle();
      if (error || !data) return json({ error: "Not found" }, 404);
      const book = data as AudioBook;
      if (!validAudioBookPath(book.audio_path, book.jewish_year, book.parsha_key)) {
        return json({ error: "Not found" }, 404);
      }
      if (kind === "cover" && !validAudioBookCoverPath(book.cover_path,book.jewish_year,book.parsha_key))
        return json({ error: "Cover unavailable" }, 404);
      const assetPath = kind === "cover" ? book.cover_path! : book.audio_path!;
      const { data: signed, error: signError } = await admin.storage.from(AUDIO_BOOK_BUCKET)
        .createSignedUrl(assetPath, 3600, kind === "download" ? { download: audioBookDownloadName(book) } : undefined);
      if (signError || !signed?.signedUrl) return json({ error: "Audio temporarily unavailable" }, 503);

      // Count requests to listen or download, not completed listening or saved files.
      // Internal and automated requests are excluded from engagement reports.
      const isAutomated = isAutomatedAgent(request.headers.get("user-agent") || "");
      if (kind !== "cover" && !isAutomated && !(await isInternalRequest(request))) {
        const { error: eventError } = await admin.from("parsha_audio_book_events")
          .insert({ book_id: id, event_type: kind, visitor_id: (() => {
            // Same first-party pseudonymous identifier as the site's visitor analytics.
            // Do not trust arbitrary query parameters for unique-person reporting.
            const cookie = request.headers.get("cookie") || "";
            const match = cookie.split(";").map(part => part.trim())
              .find(part => part.startsWith("tftt_vid="));
            if (!match) return null;
            try {
              const value = decodeURIComponent(match.slice("tftt_vid=".length));
              return /^[A-Za-z0-9_-]{8,100}$/.test(value) ? value : null;
            } catch { return null; }
          })() });
        if (eventError) console.error("[parsha-audio-book] event tracking failed", eventError.message);
      }

      // Let storage/CDN stream the audio: no buffering or proxy through the app server.
      // Redirecting the native <audio> control preserves Android media play gestures.
      return new Response(null, { status: 302, headers: {
        Location: signed.signedUrl, "Cache-Control": "no-store", "X-Robots-Tag": "noindex",
      } });
    },
  } },
});
