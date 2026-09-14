# Torah For The Table Analytics — Event & Metric Definitions

This document describes the analytics definitions used by `/admin` and `/admin-analytics`.

## Primary source: canonical first-party events

Primary audience, engagement, funnel, source, device, and conversion metrics use `public.analytics_events` in the external Supabase analytics project.

**Client:** `src/lib/first-party-analytics.ts`  
**Ingest:** `POST /api/events` (`src/routes/api/events.ts`)

Legacy `page_views`, `search_events`, `download_events`, and `download_attribution` remain available for historical/raw audit views. They are not the preferred source for primary conversion rates.

## Identity

- **Visitor ID:** random first-party ID stored in cookie `tftt_vid` with a sliding 12-month lifetime and a localStorage fallback.
- **Session ID:** a first-party session shared across tabs. A new session begins after 30 minutes of inactivity.
- **New visitor:** the first canonical session created for a new visitor ID.
- **Returning visitor:** an active visitor with an in-range canonical session known to be non-first, either from observed prior canonical history or the canonical non-first-session flag. A visitor can therefore become returning within the selected reporting range if session 2 occurs in that same range.

Admin routes are excluded on both client and ingest server. `/admin`, `/admin/*`, and `/admin-analytics*` must not emit canonical events.

## Canonical event catalog

| Event | Meaning |
| --- | --- |
| `session_start` | First tracked activity of a new 30-minute session |
| `page_view` | Client-side route view |
| `publication_impression` | Publication card sufficiently visible; deduped per page view |
| `publication_click` | Publication card interaction |
| `filter_change` | Audience/length/content filter change |
| `search` | Submitted search |
| `pdf_open` | Embedded publication PDF viewer successfully loaded; a mobile detail-page visit alone is not a PDF open |
| `download` | User-initiated download action/request; one event per click/action |
| `share_click` | Share action |
| `signup` | Successful weekly-email subscription; email address is not stored in analytics_events |
| `heartbeat` | Active-time sample while visible and focused |
| `error` | Sanitized meaningful site error |

A canonical `download` event confirms that the user initiated a download request. Browser telemetry does not reliably prove that the transfer completed, so the dashboards deliberately use **download action** rather than “completed download” language.

## Stored canonical fields

`event_id`, `event_name`, `occurred_at`, `visitor_id`, `session_id`, `is_new_visitor`, `path`, `landing_path`, `source_path`, `publication_id`, `publication_title`, `publication_series`, `publisher`, `parsha`, `jewish_year`, `device_type`, `referrer_host`, `referrer_url`, `utm_source`, `utm_medium`, `utm_campaign`, `source_group`, `country`, `region`, `metadata`.

Privacy rules:

- No raw IP address is stored.
- No raw user-agent string is stored. Only the coarse derived `device_type` bucket is persisted.
- No subscriber email address is stored in `analytics_events`.
- Canonical event writes use an `event_id` uniqueness key so a retried beacon is deduplicated.
- Low-confidence sessions are retained; they are identified, not silently discarded.

## Attribution

First-touch attribution is captured once per session and is not overwritten by internal navigation. Canonical source groups are:

- WhatsApp
- Email
- Google
- Direct
- Other Campaign
- Other Referral

Source and device mixes in primary dashboards are **session-level** metrics.

## Dashboard metric definitions

### Session

One canonical `session_id`, using the site's 30-minute inactivity rule.

### Unique visitor

One distinct canonical `visitor_id` active in the reporting interval.

### Engaged session

A session with at least one positive interaction, a heartbeat, two or more page views, or at least 10 seconds of tracked active time. Low-confidence sessions remain included in total-session denominators.

### PDF-accessing session

A session containing at least one `pdf_open` or `download` event.

### Downloading session

A session containing at least one canonical `download` action.

### Unique PDF download

One distinct **session + publication** pair with a download action. Repeat download clicks on the same publication in the same session count once for this metric.

### Download action

Every canonical or legacy raw download event, depending on the labeled section. A person can generate multiple download actions. This is a user-initiated request/click metric, not a verified completed-transfer metric.

### Session download conversion

`downloading sessions / total sessions`

The numerator and denominator must use the same reporting interval.

### New-subscriber conversion on the collection dashboard

`new subscriber rows created during the collection window / unique canonical visitors during that same window`

The numerator and denominator use identical collection-window timestamps.

### Publication CTR

`distinct session+publication click pairs / distinct session+publication impression pairs`

### Publication access-to-download conversion

`distinct session+publication download pairs / distinct session+publication access pairs`

A PDF access is a `pdf_open` or `download`; a viewer open followed by a download remains one session+publication access pair.

## Collection-window analytics (`/admin`)

Collection windows are derived from the first upload timestamp of each collection/parsha and the start of the next collection. Because these are upload-derived periods, the UI labels them **collection windows**, not calendar weeks.

For a selected collection, the following all use the same `[start, end)` timestamp interval:

- canonical page views
- canonical sessions
- canonical unique visitors
- canonical engaged sessions
- canonical PDF-accessing sessions
- canonical downloading sessions
- canonical unique PDF downloads
- canonical download actions
- new subscriber rows

This avoids the previous invalid calculation where traffic was window-filtered but downloads were counted by PDF parsha regardless of download timestamp.

Top pages show both raw page views and unique sessions containing the page.

## Since-you-were-last-here (`/admin`)

Audience and download activity are canonical and show:

- unique visitors
- sessions
- engaged sessions
- top session source
- downloading sessions
- unique session+publication downloads
- raw canonical download actions

Subscriber and contact-message counts still come from their authoritative application tables. The legacy collection-to-collection raw download comparison is retained only as an explicitly labeled supplemental/audit statistic.

## Funnel analytics (`/admin-analytics`)

The funnel defaults to **All collections** and reports:

- unique visitors
- sessions
- engaged sessions
- returning visitors
- PDF-accessing sessions
- downloading sessions
- unique PDF downloads
- raw download actions
- session download conversion
- low-confidence sessions
- average tracked active time

By-source and by-device download rates use **downloading sessions / sessions**. They do not divide downloaded-PDF counts by sessions.

Publication performance uses the CTR and access-to-download definitions above.

## Returning behavior (`/admin-analytics`)

The selected 1/7/30/90/180/365-day range defines the **active visitor population**. For those active visitors, earlier canonical history is fetched before the reporting range.

A visitor is considered returning when an in-range session is known to be non-first because either:

- earlier recorded canonical sessions establish that its ordinal is 2+, or
- the canonical `is_new_visitor = false` flag provides non-first-session evidence.

This also correctly handles a visitor whose first and second canonical sessions both occur inside the selected range.

Not every visitor necessarily has a fully observed canonical lifetime start. Therefore:

- lifetime timing medians are calculated only when canonical session 1 is present;
- session-stage charts are described as **recorded** session ordinals when earlier history may be missing;
- source cohorts are described as the **earliest recorded source** unless the lifetime first canonical session is known;
- visitor journeys use **recorded sessions** rather than claiming every displayed session number is a true lifetime ordinal.

This prevents left-censoring from incorrectly treating the first session available in canonical history as the visitor's first-ever session.

A **repeat session in range** is an in-range session known to be non-first by observed history or canonical non-first-session evidence.

## Raw download-action audit (`/admin-analytics`)

The lower dashboard intentionally continues to use the legacy `download_events` table as a raw/historical audit feed. Every KPI in this section is labeled **Download actions** to avoid confusing actions with people or conversions.

`Today` is calculated from midnight in `America/New_York`, using the UTC offset that applies at local midnight itself so DST transition dates remain correct.

## GTM / GA4

GTM/dataLayer events may still exist for external analytics and marketing measurement, but they are not the source of truth for the primary first-party dashboard conversion metrics documented above.
