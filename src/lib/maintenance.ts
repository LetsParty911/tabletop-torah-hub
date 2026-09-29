// Maintenance mode helpers (client-safe).
//
// The canonical ON/OFF state lives in the Lovable Cloud table
// public.site_maintenance and is changed only from the admin "Maintenance mode"
// control. There is intentionally NO source-code flag controlling it any more,
// so an unrelated publish can never switch maintenance on or off.
//
// MAINTENANCE_FALLBACK is used only when the stored setting cannot be read and
// no previously-read value is known in this server instance: fail closed
// (show the maintenance page) rather than accidentally exposing the site.
export const MAINTENANCE_FALLBACK = true;

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/admin-analytics";
}

export function maintenanceResponse(): Response {
  return new Response("Closed for Maintenance", {
    status: 503,
    headers: { "Retry-After": "3600", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
  });
}
