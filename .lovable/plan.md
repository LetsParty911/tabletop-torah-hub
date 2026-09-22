# Analytics upgrade — Torah for the Table

A single coherent upgrade of the existing canonical analytics. Nothing is replaced: the current event stream, metrics, filters and tabs stay exactly as they are; everything below is added on top.

## What you get

**Owner Summary** — a new first tab on the analytics page written for you, not for an analyst:
- People: visitors, new vs returning, confident humans, uncertain, suspected automation, internal/test kept out
- What they did: engaged, Used Torah, PDF opens, download actions, served download requests, chooser use, My Table, signups
- Where they came from: Google / WhatsApp / Email / Sender / Direct, plus named campaigns
- What worked: top publications with a clear funnel
- Returning audience: 1-day, 7-day, 30-day return rates, plus 2+ and 4+ week readers
- Recent story: plain-English, factual sentences about recent meaningful visits, with approximate location wording
Headline numbers stay clickable into the existing detail drawers.

**Mark this device as internal** — a button on the analytics page that tags your own phone/laptop so your testing stops polluting the numbers, plus an Unmark button. It is verified on the server (a signed cookie issued only to a signed-in admin), so no visitor can fake it. Internal visits are still recorded for diagnostics and shown as a separate count.

**Traffic confidence** — every session is labelled for reporting only: high-confidence human, likely human, uncertain, suspected automation, internal/test. Real intent (downloads, PDF opens, chooser use) always protects a session. Where two visitor IDs share network evidence, we say "possible relationship — insufficient evidence" and never merge them.

**Campaign Link Builder** — destination path, source, medium, campaign, and a new optional "content" field to distinguish two versions of the same campaign (e.g. two WhatsApp messages). Presets for WhatsApp, Sender.net email and QR. Links keep any existing query parameters and anchors.

**Confirmed download requests** — when someone taps download we now also record that the server validated the file and issued it, matched to the original tap. Reported as "served download requests" — honest wording; it is not proof the file finished saving.

**Analytics Health** — an admin panel that checks real recent data: are events arriving, do sessions look consistent, any duplicate events, how much location enrichment succeeded, human signals present, campaign fields filled, and how many download taps matched a served request. Each check says healthy / warning / not enough data with counts.

**Location honesty** — approximate location is shown with its reliability and network context (cellular, VPN, hosting), never as an exact address. No coordinates stored, no raw IP in the summary.

## Technical plan

1. **Migration file** `supabase_internal_utm_content_migration.sql` — idempotent `ADD COLUMN IF NOT EXISTS` for `analytics_events.is_internal` and `.utm_content` plus the two indexes, documenting what is already applied in production. No destructive SQL. `download_served` needs no schema change: it is an `event_name` with `metadata.action_id`.

2. **Internal marker** — new server fn `markDeviceInternal` / `unmarkDeviceInternal` in a new `src/integrations/supabase/internal-device.functions.ts`: verifies the admin access token the same way `requireAnalyticsAdmin` does, then sets/clears an HttpOnly, SameSite=Lax, 1-year cookie `tftt_internal` whose value is `HMAC(secret, "internal")`. Secret from `ADMIN_EMAILS`-adjacent new secret `INTERNAL_MARKER_SECRET` (auto-generated if absent, falling back to the service key hash). `/api/events` and `/api/track-view` verify the cookie server-side and set `is_internal`; the client never influences it.

3. **Session race** — `touchSession()` in `first-party-analytics.ts` wrapped in `navigator.locks.request("tftt-session", …)` when available, with a BroadcastChannel re-read and the current synchronous path as fallback. Session mint becomes async-safe while `getSessionId()` keeps its sync signature via a cached value. `event_id` idempotency untouched.

4. **Confidence classification** — pure function `classifySession()` in a new `src/lib/traffic-confidence.ts` (unit-tested), consumed by the canonical report. Derived at report time only; no column written.

5. **utm_content** — added to `FpAttribution` capture, `/api/events` ingest, `EventRow`, campaign grouping (same source/medium/campaign grouped, content shown as a sub-line), and `withUtm()` gains an optional `content` field with existing callers unchanged.

6. **download_served** — `DownloadToPrintButton` generates an `action_id`, appends it to `/view/$id/download?a=…`; the download route validates the id format and inserts one `download_served` event (visitor/session read from the sanitized query, capped lengths) before redirecting. Added to the allowed-event set and the catalog. Reports show actions, served, and unmatched.

7. **Cohorts** — `src/lib/retention-cohorts.ts`: D1/D7/D30 computed only for visitors whose first session is observed in the canonical stream and who have had the full window elapse; denominator and returned count labelled explicitly; percentages suppressed under 10, matching the existing rule. Plus 2+ / 4+ distinct-week counts.

8. **Content funnel** — publication rows extended with impressions → clicks → PDF opens → download actions → served, and new/returning, source and device splits where the sample allows.

9. **Docs, privacy, tests** — `docs/analytics-event-schema.md` updated for `utm_content`, `is_internal`, `download_served`, confidence language; privacy page gains accurate wording about the internal marker cookie and that a served request is not proof of a completed download. New/updated tests: UTM helper with content, confidence classification, cohort eligibility, download matching, report math.

## Limitations to expect

- The internal-device marker is per-browser; marking a phone does not mark a laptop.
- D30 cohorts will read "not enough elapsed time" until the canonical stream is 30 days deep for enough visitors.
- `download_served` only starts matching from deployment forward; no backfill.
- Everything stays in preview until you approve publishing.
