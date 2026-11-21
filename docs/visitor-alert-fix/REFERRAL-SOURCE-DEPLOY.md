# Pushover referral-source correction (staged; NOT deployed)

The production `visitor-alert` Supabase Edge Function currently has two paths:

- `visitor_alert_queue` (unverified initial page load) already renders `source_group`.
- `engaged_visitor_alert_queue` (reader action) has no referral columns and currently omits source from its Pushover message.

The helper in `visitor-alert/referral-attribution.ts` and its isolated regression tests stage only the requested correction. No database schema, records, site code, webhook, scanner filtering, deduplication, or push delivery changed by this PR.

## Production integration steps (separate deployment approval)

1. Retrieve the **current live** `visitor-alert` function using the Supabase Edge Function API. Do **not** deploy the older staged `index.ts` or `index-two-stage.ts` from this repository.
2. Copy `referral-attribution.ts` alongside live `index.ts`.
3. Add the relative import: `import { getEngagedReferralLines } from "./referral-attribution.ts";`
4. Within `if (body?.table === "engaged_visitor_alert_queue")`, **after** both internal-traffic and existing automated-email-scanner suppression, and after validating the known engagement action, set:
   ```ts
   const referralLines = isTest ? [] : await getEngagedReferralLines(
     event.session_id,
     Deno.env.get("SUPABASE_URL"),
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
   );
   ```
   Then insert `...referralLines,` among the array entries for the **engaged** Pushover message. Do not append to the plain page-load branch.
5. Preserve the old `verify_jwt` setting, all other source files, the exact scanner classification and one-alert-per-session mechanism.
6. Test `src/lib/visitor-alert-referral.test.ts` in isolation. A read-only SQL join between the queue and original `session_start` rows can confirm real attribution. Do **not** insert dummy analytics or queue events: live webhooks could send notifications.
7. Deploy using the Supabase function deployment channel, then fetch back function source to verify import, placement, and version. Verify a *natural future* engagement alert displays Source and optional Campaign/Group. If attribution lookup fails, allow the alert with `Source: Unavailable`, not misleading `Direct`.

## Security and scope

The helper uses the function's existing server-side service-role environment key; do not expose it client-side or in logs. It queries first-party `analytics_events` read-only, prioritizing the earliest session start, then earliest page view only when missing. It does not store IP, user agent, or personal data in the push. Source describes **referral attribution, not evidence of a human visitor**. The current scanner suppression stays in effect.

GitHub commits here do **not** activate the change in the production Supabase Edge Function. No Lovable Build credits are needed for this staged PR.
