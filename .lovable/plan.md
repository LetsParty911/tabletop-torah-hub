# Redesign Admin Analytics as a Readable Report

## Outcome
Turn `/admin-analytics` into a calm, five-part admin report: **Overview, Publications, Reach, Visitors, Settings**. The existing `/admin` tools remain intact, raw records remain untouched, and the current canonical automation rules remain unchanged.

## Implementation

### 1. Establish one auditable reporting model
- Extend the existing admin-only canonical analytics module rather than creating competing calculations.
- Add collection-aware ranges for **Last Hour, Today, This Collection, and 7 Days**. “This Collection” will use the same displayed-collection resolution as the homepage and the existing upload-derived collection window.
- Build session and visitor records once, apply the existing automation classifications unchanged, and preserve every session containing a real PDF open, download, publication click, filter, search, share, signup, or human signal exactly as the current filter does.
- Add **Used Torah** without changing canonical engaged sessions. A session qualifies through a PDF open, download, share, or signup; search/filter/click sequences qualify only when they progress to a content action under the stated human-signal rules. Return a plain-English qualification reason per session.
- Return exact drilldown rows for People, Used Torah, PDF Opens, Downloads, Returning Readers, Engaged Sessions, Signups, raw sessions, and filtered automation, including timestamps and publication names where recorded.
- Add publication, source/campaign, likely-location, search-outcome, recent-activity, journey, prior-comparable-window, and data-health summaries from the same filtered records.

### 2. Build the story-first Overview
- Replace the current stacked dashboards with one focused Overview: collection/time context, restrained status, deterministic summary sentence, four primary metrics, and compact supporting counts.
- Make every displayed number open an accessible side panel containing the exact contributing sessions/events and explanations.
- Add compact “What happened,” recent activity, source/campaign, one supported top-publication item, an optional count-first journey, and a quiet-aware data-health footer.
- Suppress percentage language for samples below ten and avoid warnings when the selected period is simply quiet.

### 3. Add Publications and Reach views
- Publications: show exposure, selection, unique readers, PDF opens, download actions, explicit numerator/denominator rates, returning-reader association when supported, comparable collection counts, source drilldown, top searches, and searches with no later content action.
- Reach: keep acquisition source, UTM campaign attribution, and likely network geography in separate sections; add campaign-to-location cross-view only when supported.
- Add a controlled tracking-link generator for channel, community, and campaign/collection. Normalize values to safe lowercase UTM names and provide Copy; QR creation is deferred.

### 4. Refine Visitors without losing diagnostics
- Reuse `VisitorActivitySection` inside the Visitors destination rather than duplicating it.
- Keep the normal card readable and mobile-first; mask IP outside Technical Details.
- Move raw UA, full IP, fingerprint, ASN, WebGL, client hints, and session timeline into collapsed Technical Details.
- Replace identity-sounding labels with neutral continuity wording and an explicit “Not proof of identity” note. Never merge visitor IDs or connect them to subscriber emails.

### 5. Add Settings and preserve deep analytics
- Add a readable Metric Dictionary and campaign naming guidance under Settings; definitions are display-only and stable.
- Keep the existing returning-behavior report and raw download audit accessible as collapsed advanced reports beneath the primary experience.
- Update `docs/analytics-event-schema.md` for current IP/User-Agent/enhanced telemetry and deterministic definitions, including bot reasons, data health, campaign versus network geography, and download-action limitations.

## Technical Notes
- Use existing admin authentication and server-only analytics access.
- Reuse existing design-system buttons, tabs, sheets, and semantic colors; no new packages or database migration.
- Keep public tracking and content pages unchanged unless validation exposes a blocking tracking defect.
- Add focused unit tests for Used Torah qualification, small-sample presentation rules, tracking-link normalization, and canonical-filter preservation where practical.

## Validation
- Run focused tests and the production build/type checks available in the project.
- In the local preview, verify authenticated `/admin-analytics`, desktop and mobile layouts, empty/quiet periods, and a period containing downloads with exact publication details.
- Confirm suspected automation stays in raw drilldowns but outside headline metrics, while PDF/download sessions remain included.
- Confirm `/admin` and `/admin-analytics` emit no canonical events and the public site still builds.
- Stop after preview validation; do not publish or deploy.
