import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

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
