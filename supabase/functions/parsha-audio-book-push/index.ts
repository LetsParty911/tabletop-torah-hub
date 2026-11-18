import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Dedicated administrator Pushover alerts for persisted audiobook engagement.
// Only database webhooks holding the Vault-backed token may call this function.
// No browser credentials, raw IPs, or personally identifying visitor data.
const PROJECT_URL = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESPONSE_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function result(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}

async function db(path: string, body?: Record<string, unknown>): Promise<unknown> {
  if (!PROJECT_URL || !SERVICE_KEY) throw new Error("supabase_configuration_missing");
  const response = await fetch(PROJECT_URL + "/rest/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("database_http_" + response.status);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

type EventRow = { id: number; book_id: string; event_type: "play" | "download"; created_at: string };
type BookRow = { title: string; published: boolean };

async function complete(eventId: number, status: "sent" | "failed", code: string | null): Promise<void> {
  try {
    await db("rpc/finish_parsha_audio_book_push", {
      p_event_id: eventId,
      p_status: status,
      p_error: code,
    });
  } catch (error) {
    console.error("[audiobook-push] could not record delivery result", error instanceof Error ? error.message : "unknown");
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return result({ error: "method_not_allowed" }, 405);
  const token = request.headers.get("x-tftt-audio-hook") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token)) return result({ error: "unauthorized" }, 401);

  let authorized: unknown;
  try {
    authorized = await db("rpc/verify_parsha_audio_book_push_hook", { p_token: token });
  } catch {
    return result({ error: "authentication_unavailable" }, 503);
  }
  if (authorized !== true) return result({ error: "unauthorized" }, 401);

  // The authenticated dry-run checks webhook configuration without sending a
  // phone notification or modifying event / delivery counts.
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid");
  } catch {
    return result({ error: "invalid_body" }, 400);
  }
  if (payload.healthcheck === true) {
    return result({
      status: "ok",
      pushover_configured: !!Deno.env.get("PUSHOVER_USER_KEY") && !!Deno.env.get("PUSHOVER_APP_TOKEN"),
    });
  }

  const eventId = Number(payload.event_id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) return result({ error: "invalid_event" }, 400);

  let claimed = false;
  try {
    // Re-read the saved event, never trust a webhook-supplied title or action.
    const events = await db(
      "parsha_audio_book_events?select=id,book_id,event_type,created_at&id=eq." + eventId + "&limit=1"
    ) as EventRow[];
    const event = events?.[0];
    if (!event || (event.event_type !== "play" && event.event_type !== "download")) {
      return result({ error: "event_not_found" }, 404);
    }

    const books = await db(
      "parsha_audio_books?select=title,published&id=eq." + encodeURIComponent(event.book_id) + "&limit=1"
    ) as BookRow[];
    const book = books?.[0];
    if (!book?.published) return result({ status: "unpublished_ignored" });

    claimed = (await db("rpc/claim_parsha_audio_book_push", { p_event_id: eventId })) === true;
    if (!claimed) return result({ status: "already_claimed" });

    const user = Deno.env.get("PUSHOVER_USER_KEY");
    const app = Deno.env.get("PUSHOVER_APP_TOKEN");
    if (!user || !app) {
      await complete(eventId, "failed", "pushover_not_configured");
      return result({ error: "pushover_not_configured" }, 503);
    }

    const listening = event.event_type === "play";
    const title = listening ? "Torah For The Table - Audiobook Played" : "Torah For The Table - MP3 Requested";
    const action = listening ? "Visitor started listening" : "Visitor requested the MP3 download";
    const time = new Date(event.created_at).toLocaleString("en-US", {
      timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short"
    });
    const form = new URLSearchParams({
      token: app,
      user,
      title,
      message: action + "\n" + book.title + "\n" + time + " ET",
      priority: "0",
      sound: "pushover",
      url: "https://torahforthetable.com/parsha-audio-book",
      url_title: "Open Parsha Audio Book",
    });
    const delivery = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(9000),
    });
    if (!delivery.ok) {
      await complete(eventId, "failed", "pushover_http_" + delivery.status);
      return result({ error: "delivery_failed" }, 502);
    }

    const receipt = await delivery.json().catch(() => null);
    if (receipt?.status !== 1) {
      await complete(eventId, "failed", "pushover_unconfirmed");
      return result({ error: "delivery_unconfirmed" }, 502);
    }
    await complete(eventId, "sent", null);
    return result({ status: "accepted_by_pushover" });
  } catch (error) {
    if (claimed) await complete(eventId, "failed", error instanceof Error ? error.message.slice(0, 100) : "unknown");
    console.error("[audiobook-push] dispatch error", error instanceof Error ? error.message : "unknown");
    return result({ error: "delivery_unavailable" }, 503);
  }
});
