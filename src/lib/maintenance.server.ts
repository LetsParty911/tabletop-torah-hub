// Server-only reader for the persistent maintenance-mode setting.
//
// Source of truth: public.site_maintenance (single row, id = 1) in Lovable Cloud.
// Fail-safe order when reading:
//   1. fresh cached value (10s per server instance)
//   2. stored row (missing row => ON)
//   3. on read error: last value this instance successfully read
//   4. otherwise MAINTENANCE_FALLBACK (ON)
import { MAINTENANCE_FALLBACK, isAdminPath, maintenanceResponse } from "./maintenance";

export type MaintenanceReader = () => Promise<boolean | null>;

const CACHE_TTL_MS = 10_000;
let cached: { value: boolean; at: number } | null = null;
let lastKnown: boolean | null = null;

export const defaultMaintenanceReader: MaintenanceReader = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("site_maintenance")
    .select("enabled")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.enabled : null;
};

export async function readMaintenanceEnabled(
  reader: MaintenanceReader = defaultMaintenanceReader,
  now: number = Date.now(),
): Promise<boolean> {
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const stored = await reader();
    const value = stored === null ? true : stored;
    cached = { value, at: now };
    lastKnown = value;
    return value;
  } catch (err) {
    console.error("[maintenance] setting read failed; failing closed", (err as Error)?.message);
    return lastKnown ?? MAINTENANCE_FALLBACK;
  }
}

/** Record a value just written by the admin control so this instance applies it immediately. */
export function rememberMaintenanceValue(value: boolean, now: number = Date.now()) {
  cached = { value, at: now };
  lastKnown = value;
}

/** Returns the maintenance Response for public paths while enabled, else null. */
export async function maintenanceGate(
  pathname: string,
  reader: MaintenanceReader = defaultMaintenanceReader,
): Promise<Response | null> {
  if (isAdminPath(pathname)) return null;
  return (await readMaintenanceEnabled(reader)) ? maintenanceResponse() : null;
}

export function __resetMaintenanceCacheForTests() {
  cached = null;
  lastKnown = null;
}
