import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

const SITE_URL = "https://torahforthetable.com";
const tokenSchema = z.string().uuid();

const preferencesSchema = z.object({
  wantsChildren: z.boolean(),
  wantsFamilyStory: z.boolean(),
  wantsQuickVort: z.boolean(),
  wantsQuestions: z.boolean(),
  wantsHalacha: z.boolean(),
  wantsDeeper: z.boolean(),
  maxPages: z.number().int().min(1).max(100).nullable(),
});

export type SubscriberPreferences = z.infer<typeof preferencesSchema>;

const defaultPreferences: SubscriberPreferences = {
  wantsChildren: false,
  wantsFamilyStory: false,
  wantsQuickVort: false,
  wantsQuestions: false,
  wantsHalacha: false,
  wantsDeeper: false,
  maxPages: null,
};

async function getActiveSubscriberByToken(token: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subscribers")
    .select("id")
    .eq("unsubscribe_token", token)
    .eq("active", true)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

export const getSubscriberPreferences = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) =>
    z.object({ token: tokenSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const subscriberId = await getActiveSubscriberByToken(data.token);
    if (!subscriberId) {
      return { valid: false as const, configured: false as const, preferences: defaultPreferences };
    }

    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin
      .from("subscriber_preferences")
      .select(
        "wants_children, wants_family_story, wants_quick_vort, wants_questions, wants_halacha, wants_deeper, max_pages",
      )
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (error || !row) {
      return { valid: true as const, configured: false as const, preferences: defaultPreferences };
    }

    return {
      valid: true as const,
      configured: true as const,
      preferences: {
        wantsChildren: Boolean(row.wants_children),
        wantsFamilyStory: Boolean(row.wants_family_story),
        wantsQuickVort: Boolean(row.wants_quick_vort),
        wantsQuestions: Boolean(row.wants_questions),
        wantsHalacha: Boolean(row.wants_halacha),
        wantsDeeper: Boolean(row.wants_deeper),
        maxPages: typeof row.max_pages === "number" ? row.max_pages : null,
      } satisfies SubscriberPreferences,
    };
  });

export const saveSubscriberPreferences = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; preferences: SubscriberPreferences }) =>
    z
      .object({
        token: tokenSchema,
        preferences: preferencesSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const subscriberId = await getActiveSubscriberByToken(data.token);
    if (!subscriberId) {
      return { ok: false as const, error: "This preference link is no longer valid." };
    }

    const p = data.preferences;
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("subscriber_preferences").upsert(
      {
        subscriber_id: subscriberId,
        wants_children: p.wantsChildren,
        wants_family_story: p.wantsFamilyStory,
        wants_quick_vort: p.wantsQuickVort,
        wants_questions: p.wantsQuestions,
        wants_halacha: p.wantsHalacha,
        wants_deeper: p.wantsDeeper,
        max_pages: p.maxPages,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "subscriber_id" },
    );

    if (error) {
      console.error("saveSubscriberPreferences error", error);
      return { ok: false as const, error: "Could not save your preferences. Please try again." };
    }

    return { ok: true as const, error: null };
  });

// Account-free preference access: a subscriber can request their existing
// private token by email. The response is deliberately identical whether or
// not the address is subscribed so the endpoint cannot be used to enumerate
// the mailing list.
export const requestSubscriberPreferenceLink = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) =>
    z.object({ email: z.string().trim().email().max(254) }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const admin = getSupabaseAdmin();
    const { data: subscriber } = await admin
      .from("subscribers")
      .select("unsubscribe_token")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle();

    const token = (subscriber?.unsubscribe_token as string | null) ?? null;
    if (!token) {
      return { ok: true as const };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const rawFromAddress = process.env.EMAIL_FROM_ADDRESS;
    const fromAddress = rawFromAddress ? rawFromAddress.trim().toLowerCase() : null;
    if (!apiKey || !fromAddress) {
      console.error("requestSubscriberPreferenceLink skipped: email service is not configured");
      return { ok: true as const };
    }

    const manageUrl = `${SITE_URL}/manage-table/${token}`;
    const unsubscribeUrl = `${SITE_URL}/unsubscribe/${token}`;
    const subject = "Manage your Torah for the Table preferences";
    const text = [
      "Manage My Table",
      "",
      "Use your private link to choose the kinds of Divrei Torah you want in your weekly Torah for the Table email:",
      manageUrl,
      "",
      `Unsubscribe: ${unsubscribeUrl}`,
      "",
      "— Torah for the Table",
      SITE_URL,
    ].join("\n");
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#2c2418;"><div style="max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.55;"><h1 style="font-size:22px;margin:0 0 16px;color:#2c2418;">Manage My Table</h1><p style="margin:0 0 16px;">Use your private link to choose the kinds of Divrei Torah you want in your weekly Torah for the Table email.</p><p style="margin:0 0 22px;"><a href="${manageUrl}" style="display:inline-block;background:#1A365D;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:999px;font-weight:600;">Manage My Table</a></p><p style="font-size:12px;color:#6b6358;margin:0;">This link is private to your subscription. You can also <a href="${unsubscribeUrl}" style="color:#5a3a1f;">unsubscribe</a> at any time.</p></div></body></html>`;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: email,
          subject,
          html,
          text,
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error(
          "requestSubscriberPreferenceLink Resend error",
          response.status,
          errorBody,
        );
      }
    } catch (error) {
      console.error("requestSubscriberPreferenceLink send error", error);
    }

    return { ok: true as const };
  });
