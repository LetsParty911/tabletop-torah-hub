import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { isAutomatedAgent } from "@/lib/request-telemetry.server";
import { isInternalRequest } from "@/lib/internal-marker.server";

// Anonymous listening progress is advisory analytics, never an access credential.
// The first-party cookie is the server-side identity source; a request body cannot
// claim to be internal or choose a different browser's identifier.
export const Route = createFileRoute("/api/parsha-audio-book-engagement")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const reply = (body: unknown, status = 200) =>
          Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
        if (await isInternalRequest(request)) return reply({ ignored: "internal" });
        if (isAutomatedAgent(request.headers.get("user-agent") || "")) return reply({ ignored: "automated" });
        let body: Record<string, unknown>;
        try { body = await request.json() as Record<string, unknown>; }
        catch { return reply({ error: "Invalid request" }, 400); }
        const bookId = String(body.bookId || "");
        const sessionId = String(body.sessionId || "");
        const delta = Number(body.deltaSeconds);
        const duration = Number(body.durationSeconds);
        const ended = body.ended === true;
        if (!/^[a-f0-9-]{36}$/i.test(bookId) ||
            !/^[a-f0-9-]{36}$/i.test(sessionId) ||
            !Number.isInteger(delta) || delta < 0 || delta > 30 ||
            !Number.isFinite(duration) || duration < 1 || duration > 86400 ||
            (delta === 0 && !ended)) return reply({ error: "Invalid measurement" }, 400);
        const cookie = request.headers.get("cookie") || "";
        const raw = cookie.split(";").map(p => p.trim()).find(p => p.startsWith("tftt_vid="));
        let visitorId: string | null = null;
        try { visitorId = raw ? decodeURIComponent(raw.slice("tftt_vid=".length)) : null; }
        catch { return reply({ ignored: "missing_browser_id" }); }
        if (!visitorId || !/^[A-Za-z0-9_-]{8,100}$/.test(visitorId)) {
          return reply({ ignored: "missing_browser_id" });
        }

        const admin = getSupabaseAdmin();
        const { data: book, error: bookError } = await admin.from("parsha_audio_books")
          .select("id").eq("id", bookId).eq("published", true).maybeSingle();
        if (bookError || !book) return reply({ error: "Not found" }, 404);

        const { data: previous, error: readError } = await admin
          .from("parsha_audio_book_listening_sessions")
          .select("session_id,book_id,visitor_id,listened_seconds,completed,created_at,updated_at")
          .eq("session_id", sessionId).maybeSingle();
        if (readError) return reply({ error: "Could not save engagement" }, 503);
        if (previous && (previous.book_id !== bookId || previous.visitor_id !== visitorId))
          return reply({ error: "Session mismatch" }, 409);
        // The client reports short increments of actual media playback, capped by
        // elapsed wall time to limit inflated totals. A session is scoped to a browser.
        const now = Date.now();
        const earlier = previous ? Date.parse(previous.updated_at) : now - 30_000;
        const allowed = Math.min(30, Math.max(0, Math.ceil((now - earlier) / 1000) + 3));
        const accepted = Math.min(delta, allowed);
        const total = Math.min(86400, Number(previous?.listened_seconds || 0) + accepted);
        const completion = Boolean(previous?.completed) ||
          (ended && total >= duration * 0.9);
        const write = {
          session_id: sessionId,
          book_id: bookId,
          visitor_id: visitorId,
          listened_seconds: total,
          duration_seconds: Math.floor(duration),
          completed: completion,
          updated_at: new Date(now).toISOString(),
        };
        const { error: saveError } = await admin.from("parsha_audio_book_listening_sessions")
          .upsert(write, { onConflict: "session_id" });
        if (saveError) return reply({ error: "Could not save engagement" }, 503);
        return reply({ ok: true });
      },
    },
  },
});
