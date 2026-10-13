import { auditPrivacy } from "@/lib/vpn-block.server";
import { buildAttribution } from "@/lib/vpn-security";
import { notifyBlocked } from "@/lib/vpn-notify.server";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
const req = new Request("https://torahforthetable.com/__vpn_selftest?x=1", { headers: { "user-agent": "tftt-selftest", "cf-connecting-ip": "203.0.113.77" } });
const attribution = buildAttribution({ proxycheck: { signals: ["VPN"], confidence: 99 }, proxycheckStatus: "ok", proxycheckQualifies: true, ipapi: { vpn: true, proxy: false, tor: false }, ipapiStatus: "ok", listSignal: null, listStatus: "ok" });
const result = { value: { signals: ["VPN"], confidence: 99, operator: "selftest", city: "Test City", region: "TS", country: "ZZ" }, source: "provider", status: "selftest", elapsed: 1, additionalBlock: true } as any;
const mode = process.argv[2];
if (mode === "ok") {
  const a = await auditPrivacy(req, "203.0.113.77", "block", result, true, undefined, attribution);
  const db = getSupabaseAdmin();
  const { data } = await db.from("vpn_connection_checks").select("decision,detected_by,provider_results").eq("id", a.id).single();
  console.log("audit row:", JSON.stringify(data));
  await notifyBlocked(undefined, { auditId: a.id, ip: "203.0.113.77", location: "Test City, TS, ZZ", detectedBy: attribution.detectedBy, signals: ["VPN"], path: "/__vpn_selftest" });
  await notifyBlocked(undefined, { auditId: a.id, ip: "203.0.113.77", location: "Test City, TS, ZZ", detectedBy: attribution.detectedBy, signals: ["VPN"], path: "/__vpn_selftest" });
  const { data: n } = await db.from("vpn_security_notifications").select("id,status,last_error_category,provider").eq("audit_id", a.id);
  console.log("notifications:", JSON.stringify(n));
  await db.from("vpn_security_notifications").delete().eq("audit_id", a.id);
  await db.from("vpn_connection_checks").delete().eq("id", a.id);
  console.log("cleaned up");
} else {
  const a = await auditPrivacy(req, "203.0.113.77", "block", result, true, undefined, attribution);
  console.log("audit id with broken db:", a.id);
}
