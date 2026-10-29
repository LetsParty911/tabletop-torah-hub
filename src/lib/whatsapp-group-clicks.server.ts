import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { isInternalRequest } from "@/lib/internal-marker.server";
import { isAutomatedAgent } from "@/lib/request-telemetry.server";
import {
  whatsappGroupRedirectTarget,
  type WhatsAppGroupCode,
} from "@/lib/whatsapp-group-redirect";

/**
 * Counts GET requests to a group short link before issuing the 302.
 * A redirect request is NOT a verified human click: preview crawlers can
 * request a link too. Keep those requests in a separate, flagged category.
 * Signed owner devices are omitted completely.
 *
 * Recording is best-effort: analytics failures must never break the link.
 * No IP address, User-Agent string, or visitor identity is persisted here.
 */
export async function whatsappGroupRedirectResponse(
  request: Request,
  group: WhatsAppGroupCode,
): Promise<Response> {
  const target = whatsappGroupRedirectTarget(group);

  try {
    if (!(await isInternalRequest(request))) {
      const userAgent = request.headers.get("user-agent") ?? "";
      const automated = isAutomatedAgent(userAgent);
      const lower = userAgent.toLowerCase();
      const deviceType = /ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(lower)
        ? "tablet"
        : /mobi|iphone|ipod|android|blackberry|windows phone/.test(lower)
          ? "mobile"
          : "desktop";
      const { error } = await getSupabaseAdmin()
        .from("whatsapp_group_link_hits")
        .insert({ group_code: group, is_automated: automated, device_type: deviceType });
      if (error) console.error("[whatsapp group link] tracking failed", error.message);
    }
  } catch (error) {
    console.error("[whatsapp group link] tracking unavailable", error);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
