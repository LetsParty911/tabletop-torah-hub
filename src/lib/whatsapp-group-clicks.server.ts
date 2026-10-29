import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { isInternalRequest } from "@/lib/internal-marker.server";
import { isAutomatedAgent } from "@/lib/request-telemetry.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { L_REDIRECT_TARGET } from "@/lib/l-redirect";
import { ST_REDIRECT_TARGET } from "@/lib/st-redirect";
import { WA_REDIRECT_TARGET } from "@/lib/wa-redirect";
import {
  whatsappGroupRedirectTarget,
  type WhatsAppGroupCode,
} from "@/lib/whatsapp-group-redirect";

export type WhatsAppShortLinkCode = WhatsAppGroupCode | "wa" | "st" | "l";

function redirectTarget(code: WhatsAppShortLinkCode): string {
  if (code === "wa") return WA_REDIRECT_TARGET;
  if (code === "st") return ST_REDIRECT_TARGET;
  if (code === "l") return L_REDIRECT_TARGET;
  return whatsappGroupRedirectTarget(code);
}

/**
 * Record GET requests to the six WhatsApp short links before issuing a 302.
 * Requests are not proof of a deliberate tap: previews/prefetchers may also
 * request the URL. Obvious crawlers are flagged, not counted as people.
 * Admin-marked devices are excluded completely.
 *
 * Best-effort: an analytics outage must not break redirection. No IP address,
 * raw User-Agent, or visitor identity is persisted in the click audit table.
 */
export async function whatsappGroupRedirectResponse(
  request: Request,
  code: WhatsAppShortLinkCode,
): Promise<Response> {
  const target = redirectTarget(code);

  try {
    if (
      !(await isInternalRequest(request)) &&
      (await checkRateLimit(request, "whatsapp-short-link", "TRACKING_RATE_LIMITER"))
    ) {
      const userAgent = request.headers.get("user-agent") ?? "";
      const lower = userAgent.toLowerCase();
      // WhatsApp's embedded browser sometimes includes "WhatsApp" in an
      // otherwise normal mobile browser UA. The shared bot detector treats
      // that word as a preview bot, so recognize browser-shaped UA strings
      // unless other automation markers are present. This is only a
      // classification of the REQUEST, never proof of a human tap.
      const embeddedBrowser = lower.includes("whatsapp") &&
        /mozilla\/5\.0/.test(lower) &&
        /applewebkit|chrome\/|safari\//.test(lower) &&
        !/bot|crawler|spider|headless|preview|facebookexternalhit|lighthouse|playwright|puppeteer/.test(lower);
      const automated = !embeddedBrowser && isAutomatedAgent(userAgent);
      const deviceType = /ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(lower)
        ? "tablet"
        : /mobi|iphone|ipod|android|blackberry|windows phone/.test(lower)
          ? "mobile"
          : "desktop";
      const { error } = await getSupabaseAdmin()
        .from("whatsapp_group_link_hits")
        .insert({ group_code: code, is_automated: automated, device_type: deviceType });
      if (error) console.error("[whatsapp link] tracking failed", error.message);
    }
  } catch (error) {
    console.error("[whatsapp link] tracking unavailable", error);
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
