// Server-only Sender.net integration.
// Never import this from client code — the API token must stay server-side.
//
// Docs: https://api.sender.net/v2 (Bearer token auth)
//   GET  /v2/groups                      -> list groups (resolve id by title)
//   POST /v2/subscribers                 -> create subscriber { email, groups: [id] }
//   POST /v2/subscribers/groups/{group}  -> add existing subscribers { subscribers: [email] }

const API_BASE = "https://api.sender.net/v2";
export const SENDER_GROUP_TITLE = "TorahForTheTable Website Subscribers";

export type SenderSyncResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; reason: "not_configured" | "no_group" | "api_error"; status?: number };

let cachedGroupId: string | null = null;

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function resolveGroupId(token: string): Promise<string | null> {
  const configured = process.env['SENDER_GROUP_ID'];
  if (configured && configured.trim()) return configured.trim();
  if (cachedGroupId) return cachedGroupId;

  try {
    const res = await fetch(`${API_BASE}/groups`, { headers: authHeaders(token) });
    if (!res.ok) {
      console.error("[sender] groups lookup failed", res.status);
      return null;
    }
    const body = (await res.json()) as { data?: Array<{ id?: string; title?: string }> };
    const match = (body.data ?? []).find(
      (g) => (g.title ?? "").trim().toLowerCase() === SENDER_GROUP_TITLE.toLowerCase(),
    );
    if (!match?.id) {
      console.error("[sender] group not found by title");
      return null;
    }
    cachedGroupId = match.id;
    return cachedGroupId;
  } catch (e) {
    console.error("[sender] groups lookup exception", e);
    return null;
  }
}

/** Adds an email to the website subscribers group. Never throws. */
export async function addSubscriberToSenderGroup(email: string): Promise<SenderSyncResult> {
  const token = process.env['SENDER_API_TOKEN'];
  if (!token) {
    console.warn("[sender] skipped: SENDER_API_TOKEN not configured");
    return { ok: false, reason: "not_configured" };
  }

  const groupId = await resolveGroupId(token);
  if (!groupId) return { ok: false, reason: "no_group" };

  try {
    const res = await fetch(`${API_BASE}/subscribers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ email, groups: [groupId] }),
    });

    if (res.ok) return { ok: true, alreadySubscribed: false };

    const text = (await res.text()).slice(0, 400);
    const looksDuplicate =
      res.status === 409 ||
      res.status === 422 ||
      /already|exist|taken|duplicate/i.test(text);

    if (looksDuplicate) {
      // Subscriber exists — make sure they're in the group anyway.
      const addRes = await fetch(`${API_BASE}/subscribers/groups/${groupId}`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ subscribers: [email] }),
      });
      if (addRes.ok) return { ok: true, alreadySubscribed: true };
      console.error("[sender] add-to-group failed", addRes.status);
      return { ok: false, reason: "api_error", status: addRes.status };
    }

    console.error("[sender] create subscriber failed", res.status, text);
    return { ok: false, reason: "api_error", status: res.status };
  } catch (e) {
    console.error("[sender] request exception", e);
    return { ok: false, reason: "api_error" };
  }
}
