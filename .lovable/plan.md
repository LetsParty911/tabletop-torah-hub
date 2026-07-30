## Goal

One "Overview" dashboard at the top of the admin analytics area that answers "how is the site doing this week?" by combining **GA4 traffic/events** with **in-app download data** — KPI tiles plus one combined timeline. Existing Download Analytics (tables, drilldowns, CSV export) stays exactly as it is, below the new summary.

## What you'll see

**KPI tiles** (respecting a shared 7/30/90-day range selector):
- Users / Sessions (GA4)
- Page views (GA4)
- `pdf_download` events (GA4)
- Actual downloads recorded in the database (in-app)
- Newsletter signups (GA4 `newsletter_signup` + subscriber count)
- Email popup conversion rate (shown / signup)

Each tile shows the total for the window plus a percent change vs. the previous equal-length window.

**Combined timeline:** one chart with GA4 sessions and in-app downloads plotted on the same day axis, so traffic spikes and download spikes line up visually. Reuses the existing moving-average / spike-detection styling.

**Top events table:** GA4 event names with counts for the window.

If GA4 credentials are missing or the API call fails, GA4 tiles render a clear "GA4 not connected" state and the in-app metrics still work.

## Setup you'll need to do once

To read GA4 numbers back into the site, Google requires a read-only service account:

1. In Google Cloud Console, create a service account and download its JSON key.
2. In GA4 Admin → Property Access Management, add that service account's email as a **Viewer**.
3. Note your GA4 **Property ID** (numeric, in GA4 Admin → Property Settings).

I'll then request two secrets from you: `GA4_SERVICE_ACCOUNT_JSON` and `GA4_PROPERTY_ID`. Nothing is exposed to the browser.

## Technical details

- New `src/lib/ga4.server.ts`: signs a service-account JWT with `jose` (Worker-safe; no `googleapis` package, which is Node-only), exchanges it for an access token, and POSTs to `analyticsdata.googleapis.com/v1beta/properties/{id}:runReport`. Short in-memory token cache keyed by expiry.
- New server function `adminGetGa4Summary({ startDate, endDate })` in the existing `api.functions.ts` pattern, admin-guarded by the same access-token check the other admin functions use. Returns plain DTOs: `{ totals, previousTotals, daily: [{date, sessions, users, views, pdfDownloads}], topEvents }`. On error returns `{ error: "..." }` rather than throwing, so the dashboard degrades gracefully.
- New `src/components/UnifiedDashboard.tsx`: range selector (7/30/90 + custom, reusing existing picker), KPI tile grid, combined recharts chart, top-events table. Data via `useQuery` in the component (not a loader — admin is auth-gated client-side).
- In-app numbers come from the existing `download_events` query path already used by `DownloadAnalytics`, so the two sections never disagree.
- Mounted in `src/routes/admin.tsx` above the existing `<DownloadAnalytics />`; nothing existing is removed.
- No database schema changes.
