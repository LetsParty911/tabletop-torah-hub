# TFTT Precision Analytics — Event Schema

> Analytics path: **Google Tag Manager only** (`GTM-WMVV6CJ7`). No direct GA4/gtag calls remain in the codebase. All events are pushed to `window.dataLayer` by `src/lib/analytics.ts`.

## Global fields

Every pushed event includes these fields automatically:

| Field | Type | Description |
|-------|------|-------------|
| `event` | `string` | Event name (see catalog below). |
| `page_path` | `string` | `window.location.pathname` at push time. |
| `page_location` | `string` | Full `window.location.href` at push time. |

Additional parameters are merged on top per event.

## Event catalog

| Event | Category | Fired when | Deduplication |
|-------|----------|------------|---------------|
| `pdf_view` | Engagement | PDF viewer page (`/view/:id`) mounts. | None — fires on every mount. |
| `pdf_download` | Engagement | User clicks a **Download** button on a card or in the PDF viewer header. | None — fires on every click. |
| `pdf_print` | Engagement | User clicks **Print PDF** in the PDF viewer header. | None — fires on every click. |
| `newsletter_signup_submit` | Conversion | User submits the homepage "Join the List" form. | None — fires on every submit attempt. |
| `newsletter_signup` | Conversion | Newsletter subscription succeeds (homepage or popup). | **Once per browser session** via `trackEventOnce`. |
| `contact_submit` | Conversion | Contact form submits successfully. | None — fires on every successful submit. |
| `email_popup_shown` | Popup lifecycle | Email capture popup appears after a download click. | **Once per browser session**. |
| `email_popup_dismissed` | Popup lifecycle | User dismisses the email capture popup. | **Once per browser session**. |
| `email_popup_abandoned` | Popup lifecycle | User leaves the page while the popup is still open. | None — fires on `pagehide` if no outcome recorded. |
| `email_popup_error` | Popup lifecycle | Popup signup fails (server error or exception). | None — fires on every failed attempt. |
| `archive_pdf_open` | Engagement | *(Reserved)* Intended for opening a PDF from the archive. **Not currently wired.** | — |

---

## Event details

### `pdf_view`

PDF viewer page loaded.

| Parameter | Type | Source | Example |
|-----------|------|--------|---------|
| `file_id` | `string` | PDF UUID | `a1b2c3d4-...` |
| `file_title` | `string` | PDF title | `Artscroll by the Shabbos Table` |
| `source_name` | `string` | Same as `file_title` | `Artscroll by the Shabbos Table` |

**File:** `src/routes/view.$id.tsx`

---

### `pdf_download`

User clicked a Download button.

| Parameter | Type | Source | Example |
|-----------|------|--------|---------|
| `file_id` | `string` | PDF UUID | `a1b2c3d4-...` |
| `file_title` | `string` | PDF title | `Toras Avigdor Kids` |
| `source_name` | `string` | Same as `file_title` | `Toras Avigdor Kids` |
| `parsha` | `string \| undefined` | Current parsha key (homepage) or archive parsha | `shemos` |
| `jewish_year` | `number \| undefined` | Jewish year (archive only) | `5785` |

**Files:**
- Homepage cards: `src/routes/index.tsx`
- Archive cards: `src/routes/archive.tsx`
- PDF viewer header: `src/routes/view.$id.tsx`

---

### `pdf_print`

User clicked Print PDF in the viewer header.

| Parameter | Type | Source | Example |
|-----------|------|--------|---------|
| `file_id` | `string` | PDF UUID | `a1b2c3d4-...` |
| `file_title` | `string` | PDF title | `Artscroll by the Shabbos Table` |
| `source_name` | `string` | Same as `file_title` | `Artscroll by the Shabbos Table` |

**File:** `src/routes/view.$id.tsx`

---

### `newsletter_signup_submit`

Homepage newsletter form submitted (before server response).

| Parameter | Type | Value |
|-----------|------|-------|
| `form_name` | `string` | `weekly_torah_notifications` |

**File:** `src/routes/index.tsx`

---

### `newsletter_signup`

Newsletter subscription succeeded.

| Parameter | Type | Description |
|-----------|------|-------------|
| `form_name` | `string` | `weekly_torah_notifications` (homepage) or `download_popup` (popup). |
| `already_subscribed` | `boolean` | `true` if the email was already on the list. |
| `engagement_ms` | `number` | *(popup only)* Milliseconds between popup shown and signup. |

**Files:**
- Homepage: `src/routes/index.tsx` (dedupe key `tftt:analytics-sent:newsletter_signup:homepage`)
- Download popup: `src/components/EmailCapturePopup.tsx` (dedupe key `tftt:analytics-sent:newsletter_signup:popup`)

---

### `contact_submit`

Contact form submitted successfully.

| Parameter | Type | Value |
|-----------|------|-------|
| `form_name` | `string` | `contact_form` |

**File:** `src/routes/contact.tsx`

---

### `email_popup_shown`

Email capture popup appeared after a download click.

| Parameter | Type | Value |
|-----------|------|-------|
| `trigger` | `string` | `download_click` |

**File:** `src/components/EmailCapturePopup.tsx`

---

### `email_popup_dismissed`

User closed the email capture popup.

| Parameter | Type | Description |
|-----------|------|-------------|
| `form_name` | `string` | `download_popup` |
| `engagement_ms` | `number` | Milliseconds between popup shown and dismiss. |

**File:** `src/components/EmailCapturePopup.tsx`

---

### `email_popup_abandoned`

User left the page while the popup was open without signing up or dismissing.

| Parameter | Type | Description |
|-----------|------|-------------|
| `form_name` | `string` | `download_popup` |
| `engagement_ms` | `number` | Milliseconds between popup shown and pagehide. |

**File:** `src/components/EmailCapturePopup.tsx`

---

### `email_popup_error`

Popup signup failed.

| Parameter | Type | Description |
|-----------|------|-------------|
| `form_name` | `string` | `download_popup` |
| `error` | `string` | Server error message or `exception`. |
| `engagement_ms` | `number` | Milliseconds between popup shown and error. |

**File:** `src/components/EmailCapturePopup.tsx`

---

### `archive_pdf_open` (reserved / not implemented)

Originally requested in Phase 1 instrumentation. Intended to fire when a user opens a PDF from the archive list. Currently the archive uses direct download links (`pdf_download`) and does not have a separate "open" action.

If implemented later, suggested parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_id` | `string` | PDF UUID |
| `file_title` | `string` | PDF title |
| `parsha` | `string` | Parsha key |
| `jewish_year` | `number` | Jewish year |

---

## Deduplication behavior

`trackEventOnce()` writes a flag to `sessionStorage` before pushing. If the flag is already set, the event is skipped and a console info message is logged. Keys used:

| Event | sessionStorage key |
|-------|--------------------|
| `email_popup_shown` | `tftt:analytics-sent:email_popup_shown` |
| `email_popup_dismissed` | `tftt:analytics-sent:email_popup_dismissed` |
| `newsletter_signup` (homepage) | `tftt:analytics-sent:newsletter_signup:homepage` |
| `newsletter_signup` (popup) | `tftt:analytics-sent:newsletter_signup:popup` |

Clearing `sessionStorage` for the origin will reset these flags.

## Popup suppression logic

The email capture popup is suppressed when any of the following are true:

- Current path is `/admin` or `/admin/*`.
- `sessionStorage.getItem("tftt:email-popup-dismissed:v2") === "1"`
- `localStorage.getItem("tftt:email-popup-signed-up:v2") === "1"`

It triggers 2 seconds after a `tftt:download-clicked` custom event, which is dispatched by every public Download button click.

## Admin exclusion

GTM is not loaded on `/admin` routes, and `trackEvent()` / `trackEventOnce()` short-circuit when `window.location.pathname` is `/admin` or starts with `/admin/`. No analytics events should fire from the admin panel.

## GTM / GA4 configuration notes

- Create **Custom Events** in GA4 with the exact names above.
- Use `form_name` as an event parameter for segmentation (homepage vs. popup newsletter signups).
- Use `engagement_ms` to build an engagement-time metric for popup interactions.
- `already_subscribed` lets you distinguish new subscriptions from re-submissions.

## Implementation files

| File | Purpose |
|------|---------|
| `src/lib/analytics.ts` | `trackEvent`, `trackEventOnce`, `pdfEventParams`, admin-path guard. |
| `src/routes/index.tsx` | Homepage newsletter + PDF download events. |
| `src/routes/archive.tsx` | Archive PDF download events. |
| `src/routes/view.$id.tsx` | PDF view, download, and print events. |
| `src/routes/contact.tsx` | Contact form submit event. |
| `src/components/EmailCapturePopup.tsx` | All popup lifecycle events. |

---

## First-party canonical event stream (Phase 1)

Alongside the GTM/dataLayer events above, the site writes a canonical
first-party event stream to `public.analytics_events` in the external
"torah-by-the-table" Supabase project (schema:
`supabase_analytics_events_migration.sql`). The legacy `page_views`,
`search_events` and `download_events` writes continue unchanged, so the
existing download dashboard is unaffected.

**Client:** `src/lib/first-party-analytics.ts`
**Ingest:** `POST /api/events` (`src/routes/api/events.ts`)

### Identity

- `visitor_id` — random id in a first-party cookie (`tftt_vid`, 12 months),
  falling back to `localStorage` when cookies are unavailable.
- `session_id` — 30-minute inactivity session shared across tabs via
  `localStorage`; renewed after 30 minutes idle, `last_activity` refreshed on
  tracked activity. `session_start` fires once per session.
- Admin routes (`/admin`, `/admin/*`, `/admin-analytics`) are excluded on both
  the client and the server.

### Events

| Event | Fires when |
| --- | --- |
| `session_start` | first tracked activity of a new 30-minute session |
| `page_view` | every client-side route view (pathname only) |
| `publication_impression` | card ≥50% visible for ~1s, deduped per page view |
| `publication_click` | interaction with a publication card |
| `filter_change` | audience / length / content-type filter selected |
| `search` | submitted archive search, with `result_count` |
| `pdf_open` | viewer page loads for a publication |
| `download` | download click (one canonical event per click) |
| `share_click` | WhatsApp / copy-link share, with `share_method` |
| `signup` | successful weekly-email subscription (no email address stored) |
| `heartbeat` | every 15s while visible **and** focused; `active_seconds` capped |
| `error` | meaningful site errors only (e.g. 404), sanitized code |

### Columns

`event_id` (unique idempotency key), `event_name`, `occurred_at`,
`visitor_id`, `session_id`, `is_new_visitor`, `path`, `landing_path`,
`source_path`, `publication_id`, `publication_title`, `publication_series`,
`publisher`, `parsha`, `jewish_year`, `device_type`, `referrer_host`,
`referrer_url`, `utm_source`, `utm_medium`, `utm_campaign`, `source_group`,
`country`, `region`, `metadata` (jsonb).

`device_type` is derived server-side from the user-agent header; the raw UA is
not stored. No IP addresses are stored. Geo on this table is country + region
only. `event_id` is unique, so a retried beacon collapses to one row.

### Attribution

First-touch per session (UTM source/medium/campaign, external referrer,
landing path) is captured once and never overwritten by internal navigation.
`source_group` normalizes it to: WhatsApp, Email, Google, Direct,
Other Campaign, Other Referral.

### Dashboard

`/admin-analytics` (admin-only, noindex) shows the Phase 1 funnel above the
existing download dashboard: overview cards, the
sessions → impressions → clicks → PDF accesses → downloads funnel, and
breakdowns by source, device, publication, and new vs returning. Funnel stages
use distinct session+publication keys; a session counts as converted with at
least one download, and a viewer load plus a download click count as one PDF
access.
