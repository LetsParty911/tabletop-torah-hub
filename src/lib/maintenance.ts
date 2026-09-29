// Maintenance mode gate. Set to false to restore the public site.
export const MAINTENANCE_MODE = true;

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/admin-analytics";
}

export function maintenanceResponse(): Response {
  return new Response("Closed for Maintenance", {
    status: 503,
    headers: { "Retry-After": "3600", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
  });
}
