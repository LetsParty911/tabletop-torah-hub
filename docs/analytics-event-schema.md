# Torah For The Table Analytics — Event & Metric Definitions

This document describes the analytics definitions used by `/admin` and `/admin-analytics`.

## Primary source: canonical first-party events

Primary audience, engagement, funnel, source, device, and conversion metrics use `public.analytics_events` in the external Supabase analytics project.

**Client:** `src/lib/first-party-analytics.ts`  
**Ingest:** `POST /api/events` (`src/routes/api/events.ts`)  
**Counting implementation:** `src/lib/pdf-access.ts` (also used by canonical server reports).

Legacy `page_views`, `search_events`, `download_events`, and `download_attribution` remain available for historical/raw audit views. They are not the preferred source for primary conversion rates, and legacy rows are never mixed into canonical totals. Admin sections built on them are labelled "Legacy raw page views".

### Legacy compatibility tracker

`src/lib/site-analytics.ts` used to mint its own visitor id (`tftt:analytics-visitor`), its own `sessionStorage` session (`tftt:analytics-session`) and its own first-touch attribution. It is now a thin wrapper around the canonical identity in `src/lib/first-party-analytics.ts`, so from this change forward legacy `page_views` / `search_events` rows carry the **same** canonical `visitor_id` and `session_id` as `analytics_events`.

`POST /api/track-view` now applies the same exclusions as `/api/events`: obvious automated agents are rejected, admin routes (`/admin`, `/admin/*`, `/admin-analytics*`) are excluded, Lovable editor/preview traffic is skipped, and any device carrying the signed internal-device cookie is skipped. A client-supplied internal flag is never trusted.

**Historical rows written before this change still carry legacy ids and must never be joined to `analytics_events` by `visitor_id` or `session_id`.** Treat pre-change `page_views` strictly as a raw audit feed.

## Primary PDF engagement KPI (from October 2026)

**Counted PDF opens** is the primary admin PDF-engagement count across /admin,
Control Center, Overview, Owner Summary, Visitors, Publications, daily reports,
completed collection comparisons and weekly reports. All of these consume the
same window-specific first-party event rows. This is a **deliberate access
request**, not verification that the file fully loaded, that any PDF bytes were
read, or that a download was saved.

Calculation, in order:

1. Candidate actions: `publication_click` with
   `metadata.action = "open_pdf"` (current public Open PDF button); historical
   canonical `download` requests; or an unmatched `download_served` event
   **only** if it has an `action_id`. Pair `download` and `download_served`
   by `action_id` so they never add two actions. Collapse duplicate event
   deliveries by `event_id`; separate, genuine repeated clicks count separately.
2. Keep only sessions classified `high_confidence_human` or `likely_human`
   by the shared session classifier. Internal/test, suspected automation and
   uncertain sessions remain in raw audit, outside the headline.
3. Exclude actions without a non-empty first-party browser `visitor_id` from
   the headline. Never merge visitor IDs by IP, fingerprint or geographic area.
4. Chronologically sort eligible actions and count **at most the earliest five
   actions per browser visitor ID across all sessions and publications within the
   selected report window**. A sixth or later event is retained but is `overCap`.
   Capping is calculated independently for each compared window, NOT once per
   individual day when looking at a seven-day report.

The result is `countedPdfOpens`. **PDF-opening browsers** counts unique browser
visitor IDs with one or more counted actions. **PDF-open sessions** counts unique
sessions containing counted actions; **PDF-open rate** is PDF-open sessions /
all qualified sessions in that same period (only show a percentage with a
sufficient denominator). **Distinct accessed PDFs** counts publication IDs with
counted actions, not clicks. Rankings count only actions carrying a publication
ID; missing IDs remain in the headline and are separately reported as
`countedMissingPublicationId`. Ranked publication totals plus counted missing
IDs must equal the headline.

**Keep diagnostics separate:** uncapped/raw deliberate Open PDF button clicks;
automatic embedded `pdf_open` viewer/iframe loads, which do not represent
deliberate action; historical download events and served redirect audits;
over-cap events and visitor counts; unidentified and non-human candidate events.
Never add those diagnostics to the new headline. Do not use the legacy
`download_events` table as a second canonical source.

**Attribution:** campaign-linked sessions convert only when the same qualified,
capped PDF-open actions carry the matched first-touch session attribution.
A tagged visit is not proof a WhatsApp message was sent.

## Identity

- **Visitor ID:** random first-party ID stored in cookie `tftt_vid` with a sliding 12-month lifetime and a localStorage fallback.
- **Session ID:** a first-party session shared across tabs. A new session begins after 30 minutes of inactivity.
- **New visitor:** the first canonical session created for a new visitor ID.
- **Returning visitor:** an active visitor with an in-range canonical session known to be non-first, either from observed prior canonical history or the canonical non-first-session flag. A visitor can therefore become returning within the selected reporting range if session 2 occurs in that same range.
- **IP address is diagnostic evidence only:** it is never used to merge separate visitor IDs into one person, because households, offices, shuls, schools, mobile carriers, VPNs, and proxies can legitimately share a public IP.

Admin routes are excluded on both client and ingest server. `/admin`, `/admin/*`, and `/admin-analytics*` must not emit canonical events.

## Canonical event catalog

| Event                    | Meaning                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `session_start`          | First tracked activity of a new 30-minute session                                                       |
| `page_view`              | Client-side route view                                                                                  |
| `publication_impression` | Publication card sufficiently visible; deduped per page view                                            |
| `publication_click`      | Publication card interaction                                                                            |
| `filter_change`          | Audience/length/content filter change                                                                   |
| `search`                 | Submitted search                                                                                        |
| `pdf_open`               | Desktop iframe `onLoad` (automatic PDF viewer preview), not a deliberate open or proof all PDF bytes rendered; excluded from Counted PDF opens |
| `download`               | User-initiated download action/request; one event per click/action                                      |
| `share_click`            | Share action                                                                                            |
| `signup`                 | Successful weekly-email subscription; email address is not stored in analytics_events                   |
| `heartbeat`              | Active-time sample while visible and focused                                                            |
| `human_signal`           | First trusted pointer, keyboard, touch, or scroll interaction in the session                              |
| `outbound_click`         | Click on a link to another host; metadata `target_host`, `target_path` (no query/fragment), `new_tab`     |
| `download_served`        | Server-side: the application validated the publication and issued the redirect to the file              |
| `error`                  | Sanitized meaningful site error                                                                         |

`download_served` is written by `src/routes/view.$id.download.tsx`, never by the browser, and needs no schema change: it carries `metadata.action_id`, the same id the client attached to its `download` event, so an action and a served request can be matched. It means the request was validated and the redirect to the storage CDN was issued. **It is not proof that the download completed** — the bytes travel directly from the CDN and nothing reports completion back to us. Reports therefore say "served download request", and also show download actions with no matching served request.

A canonical `download` event confirms that the user initiated a download request. Browser telemetry does not reliably prove that the transfer completed, so the dashboards deliberately use **download action** rather than “completed download” language.

## Stored canonical fields

`event_id`, `event_name`, `occurred_at`, `visitor_id`, `session_id`, `is_new_visitor`, `path`, `landing_path`, `source_path`, `publication_id`, `publication_title`, `publication_series`, `publisher`, `parsha`, `jewish_year`, `device_type`, `referrer_host`, `referrer_url`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `is_internal`, `source_group`, `country`, `region`, `city`, `postal_code`, `ip_address`, `user_agent`, `accept_language`, low-entropy browser client hints, edge-provided ASN/network organization, and `metadata`.

Privacy rules:

- Accepted events store the server-observed IP address and raw User-Agent for traffic analysis, abuse detection, and diagnostics. These values are visible only to administrators.
- Enhanced analytics may store a pseudonymous fingerprint hash and hashed rendering signals after the applicable region and consent checks. Raw canvas images and raw font lists are not retained. This evidence is probabilistic continuity evidence, never identity proof.
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

A session with a meaningful intent event (`download`, `pdf_open`, `publication_click`, `filter_change`, `search`, `share_click`, `signup`, or `human_signal`) or at least two page views. A heartbeat alone is not engagement.

### Used Torah

A separate owner-facing measure of distinct visitors with a session containing a `pdf_open`, `download`/`download_served`, a `publication_click` tagged `metadata.action = "open_pdf"` (reason "Clicked Open PDF"), `share_click`, or `signup`. It does not redefine historical engaged sessions. Search, filter, and untagged publication-click events alone remain engagement signals but do not qualify as Used Torah without a later qualifying action.

### PDF-open sessions, browsers, actions and conversion (primary)

Use the **Primary PDF engagement KPI** above. In particular, the primary
metric is deliberate requests capped to five per browser in the entire
selected interval, excluding automatic previews.

### Historical-only PDF and download metrics (diagnostics)

Older names such as *PDF-accessing session* (a session with `pdf_open` or
`download`), *Downloading session*, *Unique session+publication download*,
*Download action*, and *Session download conversion* refer to the pre-switch
download/viewer pipeline. Preserve them in legacy or technical-audit sections,
but they are **not** the primary admin conversion KPI. They must not
silently substitute for `countedPdfOpens` when the site uses Open PDF.

### New-subscriber conversion on the collection dashboard

`new subscriber rows created during the collection window / unique canonical visitors during that same window`

The numerator and denominator use identical collection-window timestamps.

### Publication CTR

`distinct session+publication click pairs / distinct session+publication impression pairs`

### Publication engagement and ranked PDF opens

Publication CTR remains distinct session+publication click pairs divided by
impression pairs. **Primary publication ranking** is the number of *counted*
PDF access actions for that publication ID, irrespective of how many sessions
or distinct PDFs generated those actions. Attribution to a publication,
its series, source and last-counted request is displayed when recorded.
Legacy access-to-download conversion is a historical diagnostic only.

## Collection-window analytics (`/admin`)

Collection windows are derived from the first upload timestamp of each collection/parsha and the start of the next collection. Because these are upload-derived periods, the UI labels them **collection windows**, not calendar weeks.

For a selected collection, pageviews, unique visitors, human sessions,
engagement, **counted PDF opens**, distinct accessed PDFs, PDF-opening
browser IDs, PDF-open sessions and PDF-open rate all use the same
`[start, end)` timestamps. The earliest-five-per-browser cap is applied
across this entire collection interval. Current and prior collections
each receive the cap independently. Subscriber counts come from the
authoritative subscriber table.

Top pages show both raw page views and unique sessions containing the page.

## Since-you-were-last-here (`/admin`)

Audience and PDF activity use the canonical stream and show unique
visitors, sessions, engaged sessions, top source, **counted PDF opens**
(max five per identified human browser since last visit), distinct
accessed PDFs, opening browser IDs, and the raw/over-cap audit.

Subscriber and contact-message counts still come from their authoritative application tables. The legacy collection-to-collection raw download comparison is retained only as an explicitly labeled supplemental/audit statistic.

## Readable report (`/admin-analytics`)

The primary report offers last hour, today and yesterday (America/New_York
calendar days), current collection, seven and thirty days and custom
periods. Every view exposes human visitors, sessions, Used Torah, **counted
PDF opens**, PDF-opening browsers, PDF-open sessions and rate, distinct
publication IDs requested, and returning visitors. Raw Open PDF clicks,
automatic viewer previews and historical downloads are separately labeled
audits. Reports compare against the prior matching interval by applying
the cap independently on both intervals.

Sources, device mix, locations and UTM acquisition remain independent
dimensions. Publications are sorted by counted PDF opens, not by automatic
previews or historical served requests. Daily and collection export text
uses the same counted values as the UI.

Every headline number opens its contributing sessions or events. Percentages are withheld when the denominator is below 10; the interface shows numerator and denominator counts instead. Quiet periods show a neutral insufficient-activity state rather than a trend claim.

Acquisition source, explicit UTM campaign attribution, and approximate network geography are separate dimensions. The report never infers a campaign from a location.

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

### Approximate location

Canonical events may store hosting-provider, network-derived `country`, `region`, `city`, and `postal_code`. These values are approximate and can be wrong because of mobile-carrier routing, VPNs, proxies, or ISP topology. The canonical analytics table retains the server-observed IP address for the limited purposes described above, but does not retain latitude/longitude. Location rankings are aggregated at the session level rather than counting every event as a separate location observation. Historical canonical rows recorded before the richer-location enhancement may have only country/region or may have no city/postal value.

## Canonical automation handling

Obvious crawler and preview User-Agents are rejected before ingest. Accepted raw rows are preserved. Headline reporting excludes sessions matching the canonical high-confidence burst or impossible-heartbeat rules, plus the narrowly time-boxed September 18, 2026 incident rule. It also excludes Lovable editor/preview test sessions identified by a `lovable.dev` / `lovable.app` referrer or the Lovable app User-Agent. These internal sessions remain in raw analytics for diagnostics and are reported separately from suspected automation. Any session with meaningful intent or `human_signal` is protected from the general automation classifier, preserving legitimate PDF opens and download actions. Visitor Activity keeps suspected sessions visible and labels the reason.


## Reports (admin only)

Found inside `/admin-analytics` → Overview → "Reports · daily and collection" (the five-item
navigation is unchanged).

- **Daily report** — one completed America/New_York calendar day (DST-correct 23/25-hour days),
  selectable across the last 14 completed days, compared with the same weekday one week earlier
  when that baseline has activity.
- **Collection report** — the most recently completed upload-derived collection window (the still
  open current window is excluded), compared with the prior completed collection.
- Both reuse `buildAnalyticsReport` from `admin-analytics-canonical.ts`; no competing metric
  definitions, no database change, and the canonical automation filter is untouched. Suspected
  automated sessions are reported as set aside, never deleted.
- Percentages are suppressed when a denominator is under 10; observations and "what changed" lines
  come from deterministic rules in `src/lib/admin-reports.ts`.
- "Copy report" writes a plain-text version to the clipboard; "Print" uses the `.report-print-area`
  print stylesheet. No email is sent from the site.


## utm_content

First-touch attribution captures `utm_content` alongside source, medium and campaign. It labels a
variant inside one campaign (two WhatsApp messages, two QR posters). Campaign reporting always
groups by source/medium/campaign first and lists `utm_content` variants underneath, so adding a
variant never fragments a campaign. `src/lib/utm.ts` accepts an optional `content` field; callers
that omit it are unaffected.

## Internal / test devices

`analytics_events.is_internal` is set **only** by the ingest server, from a signed, HttpOnly
first-party cookie (`tftt_internal`) that `POST /api/internal-device` issues after verifying a
signed-in administrator. The cookie value is an HMAC derived from an existing server-only key, so it
cannot be forged from the browser, and any `is_internal` value in the JSON payload is ignored.

Internal events are kept for diagnostics and excluded from headline audience metrics; the admin
report shows the internal session count separately. The existing exclusion of `/admin` and
`/admin-analytics` routes is unchanged.

## Traffic confidence (reporting only)

`src/lib/traffic-confidence.ts` classifies each session at report time as one of: high-confidence
human, likely human, uncertain, suspected automation, internal/test. Nothing is written back to the
event rows — the labels are recomputed from raw data every time, so the rules can change without
rewriting history. An explicit `human_signal` or any meaningful intent event always protects a
session from the generic automation rules. Where two visitor IDs share network or device evidence,
reporting states "possible relationship" or "insufficient evidence" only; visitor IDs are never
merged.

## Retention cohorts

`src/lib/retention-cohorts.ts` computes D1 / D7 / D30 returns only for visitors whose first
canonical session is actually observed in the retained data, and only once the full window has
elapsed for that visitor. Visitors still inside their window are reported as immature, not as
failures. Percentages follow the house rule and are suppressed below 10 eligible visitors. The same
data yields "active in 2+ distinct weeks" and "4+ distinct weeks".

## Analytics health

`adminAnalyticsHealth` reports evidence from the last 7 days of real events: ingestion recency,
session/session_start consistency, duplicate observations, geo enrichment coverage and reliability,
human-signal presence, campaign-field coverage, download action to `download_served` matching,
scroll depth coverage (sessions with `scroll_depth` ÷ sessions with `page_view`, plus repeated
thresholds per session + page_view_id + percent, which must be 0; needs ≥10 page-viewing sessions),
and outbound click ingestion (count of `outbound_click`, warning if any `target_path` contains `?` or `#`).
Each check returns healthy, warning, or not-enough-data with the counts behind it.


## Dashboard overview (`/admin-analytics` → Dashboard)

Computed in `src/lib/overview-analytics.ts` from human-qualified canonical rows only (same classifier as every headline). No new tables.

- Ranges: last hour, today and yesterday (New York calendar days, DST-safe), current collection, 7 and 30 days. Prior period: yesterday → the day before; today → yesterday midnight to the same elapsed time; others → equal-length window immediately before. Changes are shown as % only when the prior value is ≥ 10.
- **Pageviews**: `page_view` count. **Pages/session**: pageviews ÷ sessions.
- **Bounced session**: ≤ 1 pageview and no `MEANINGFUL_INTENT` event. Bounce rate shown as % only when sessions ≥ 10.
- **Engaged time**: sum of heartbeat `active_seconds` (each capped at 20) per engaged session; median and average over engaged sessions that have any heartbeat.
- **New / returning**: returning = the existing Returning Reader definition; new = visitors − returning.
- **Landing / exit page**: first / last `page_view` path in the session, ordered by `occurred_at`.
- **Acquisition & geography & device**: session level, from the session's first-touch values (first row with a value). Location is approximate network location; raw IP stays in admin forensic views only. Browser/OS come from the stored user agent via `ua-parse`.
- **Scroll depth**: `scroll_depth` carries `percent` (25/50/75/100), `max_scroll_percent` and `page_view_id` (new per route view, so each threshold fires once per page view). Reported as distinct sessions that viewed the page and reached each threshold ÷ distinct sessions that viewed it. A session is counted at most once per threshold in the displayed rate even if it has multiple page views. `rawEvents` is retained only as a health/debug count; `uniqueThresholdEvents` deduplicates by session + page_view_id + threshold, with session + path as the fallback for historical rows without a page_view_id.
- **Outbound clicks**: `outbound_click` counts and distinct sessions by host and host+path. Only HTTP(S) links to a different normalized hostname are eligible. Stored target metadata is hostname plus pathname only; query strings and fragments are discarded before the event is created.
- **Funnels**: distinct sessions, each stage at/after the previous one. (1) site landing → publication selection → *counted deliberate PDF-open request*; (2) collection page → interaction → *counted deliberate PDF-open request*. Automatic iframe `pdf_open` preview events do not satisfy the final stage. Historic `download_served` redirects only qualify as counted access requests when uniquely identified and unmatched, as explained above. A funnel request is not a verified PDF read.
- **Recency**: latest canonical event and heartbeat; sessions whose last event is within 5 / 30 minutes.
- **Not measurable**: completed CDN byte transfer, scroll on PDF viewers, time on the final page without heartbeats, and outbound navigation where the browser leaves before the beacon is sent.

### Homepage “ואהבת לרעך כמוך” WhatsApp sharing

The homepage's `Share Torah For The Table` button records `share_click` in
`analytics_events` with `metadata.placement = "homepage_veahavta"` and
`metadata.share_method = "whatsapp"`. The click is sent immediately and is
**not** proof that WhatsApp sent or delivered a message. PDF share controls
also emit `share_click` but do **not** have this placement marker and are
excluded from the homepage button count.

The button creates a canonical homepage link with
`utm_source=whatsapp&utm_medium=share&utm_campaign=weekly-share`; new links
also set `utm_content=veahavta-home`. Under
`/admin-analytics` → **Website Sharing**, selected-period metrics use the
same human-qualified canonical event rows as the other tabs:

- **Button clicks:** homepage-placed `share_click` events; clicking browser IDs are deduplicated.
- **Tagged-link sessions/visitors:** distinct session/visitor IDs with a `page_view` attributed to the specified UTM campaign.
- **Tagged-link counted PDF opens:** the same human-qualified, earliest-five-per-browser actions used for all admin headlines, from tagged sessions. Automatic embedded previews and older download-only actions remain separate legacy audits. Requests do not prove reading or completed file delivery.

Attribution is stored as *first touch* in the browser, so later visits may
continue to carry the campaign tag. Tagged-link sessions therefore do not
prove a fresh WhatsApp message, nor are they uniquely matchable to a particular
button click. Historical campaign-tagged activity remains visible; homepage
button-click counts begin only with this instrumentation.
