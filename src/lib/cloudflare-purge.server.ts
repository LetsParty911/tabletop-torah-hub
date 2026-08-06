// Server-only Cloudflare cache purge helper.
// Requires two secrets:
//   CLOUDFLARE_API_TOKEN — API token with "Zone → Cache Purge → Purge" permission
//   CLOUDFLARE_ZONE_ID   — zone id for torahforthetable.com
// Purging is best-effort: failures are logged and never break the admin action.

export async function purgeCloudflareCache(
  reason = "content-change",
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = process.env["CLOUDFLARE_API_TOKEN"];
  const zoneId = process.env["CLOUDFLARE_ZONE_ID"];
  if (!token || !zoneId) {
    return { ok: false, skipped: true, error: "Cloudflare purge secrets not configured" };
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; errors?: { message?: string }[] }
      | null;
    if (!res.ok || !json?.success) {
      const msg = json?.errors?.[0]?.message || `HTTP ${res.status}`;
      console.error("cloudflare purge failed", reason, msg);
      return { ok: false, error: msg };
    }
    console.log("cloudflare purge ok", reason);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("cloudflare purge error", reason, msg);
    return { ok: false, error: msg };
  }
}
