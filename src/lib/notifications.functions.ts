// Admin-only server functions for the generic "Alerts & Notifications" tab.
// Every handler verifies the caller is an ADMIN_EMAILS user before any work.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATEGORIES } from "./notifications/core";

const tokenOnly = z.object({ accessToken: z.string().min(10) });

async function admin(token: string) {
  const { verifyAdminAccessToken } = await import("./admin-auth.server");
  return verifyAdminAccessToken(token);
}

export const adminNotificationStatus = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenOnly.parse(i))
  .handler(async ({ data }) => {
    await admin(data.accessToken);
    const m = await import("./notifications/dispatch.server");
    const [{ settings, installed }, status] = await Promise.all([m.loadSettings(), m.statusSummary()]);
    const pushoverConfigured = Boolean(process.env["PUSHOVER_APP_TOKEN"] && process.env["PUSHOVER_USER_KEY"]);
    return { settings, installed: installed && status.installed, counts: status.counts, recent: status.recent, pushoverConfigured };
  });

const settingsSchema = z.object({
  enabled: z.boolean(),
  dryRun: z.boolean(),
  mode: z.enum(["quiet", "balanced", "active"]),
  quietStart: z.number().int().min(0).max(23).nullable(),
  quietEnd: z.number().int().min(0).max(23).nullable(),
  categories: z.object(Object.fromEntries(CATEGORIES.map((c) => [c, z.boolean()])) as Record<(typeof CATEGORIES)[number], z.ZodBoolean>),
});

export const adminSaveNotificationSettings = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ accessToken: z.string().min(10), settings: settingsSchema }).parse(i))
  .handler(async ({ data }) => {
    const email = await admin(data.accessToken);
    const { IMPLEMENTED } = await import("./notifications/core");
    // Categories not yet implemented can't be switched on.
    const cats = { ...data.settings.categories };
    for (const c of CATEGORIES) if (!IMPLEMENTED.has(c)) cats[c] = false;
    const { saveSettings } = await import("./notifications/dispatch.server");
    await saveSettings({ ...data.settings, categories: cats }, email);
    return { ok: true };
  });

export const adminSendTestNotification = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenOnly.parse(i))
  .handler(async ({ data }) => {
    await admin(data.accessToken);
    const { pushover } = await import("./notifications/dispatch.server");
    const r = await pushover("Notifications test", "Test from the Alerts & Notifications tab. Accepted by Pushover ≠ seen on your phone — please confirm receipt.");
    return { accepted: r.ok, error: r.error };
  });

export const adminRetryFailedNotifications = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenOnly.parse(i))
  .handler(async ({ data }) => {
    await admin(data.accessToken);
    const { retryFailed } = await import("./notifications/dispatch.server");
    return { requeued: await retryFailed() };
  });

/** Pulls new engaged visits from the existing shadow queue, then dispatches due rows. */
export const adminRunNotifications = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenOnly.parse(i))
  .handler(async ({ data }) => {
    await admin(data.accessToken);
    const m = await import("./notifications/dispatch.server");
    const ingest = await m.ingestEngaged();
    const tally = await m.dispatchNow();
    return { ingest, tally };
  });
