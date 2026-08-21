# Downloads Dashboard + Tracking Overview

## What exists today

Confirmed by reading the code:

- Download tracking: `POST /api/track-download` writes to `download_events` (time, publication id/title, and now city/region/country/timezone from Cloudflare).
- Page views: `POST /api/track-view` writes to `page_views`.
- Site search: `POST /api/track-search` writes to `search_events`.
- GTM (`GTM-WMVV6CJ7`) on public pages with dataLayer events: `pdf_view`, `pdf_download`, `pdf_print`, `newsletter_signup`, `contact_submit`, `archive_pdf_open`.
- Admin already has in-page analytics widgets (`DownloadAnalytics`, `TrafficAnalytics`, `AdminMiniDashboard`) inside the very large `/admin` page.

## What we can track (menu of options)

Already captured, just needs surfacing:
- Downloads per publication, per parsha week, per day, and by city/region/country.
- Page views by path, referrer, and repeat vs new visitors.
- Site searches and zero-result searches.
- Email signups and contact submissions (via GTM).

Possible additions (not in this build unless you want them):
- Device/browser and mobile vs desktop split on downloads.
- Traffic source/referrer attribution per download.
- Install (PWA) and "add to home screen" events.
- Scroll depth / time on publication pages.
- Unsubscribe and email click-through tracking.

## This build: a dedicated downloads dashboard

New admin-only page at `/admin-analytics` with:

1. Header cards: total downloads all-time, last 7 days, last 30 days, today.
2. Searchable list of recent downloads: date/time, publication title, parsha, and location (city, region, country).
3. Search box filtering by publication title, parsha, or location; plus a quick date-range selector (7 / 30 / 90 / 365 days / all).
4. "Load more" paging so the list stays fast, and a refresh button.
5. A link to the new page from the existing `/admin` analytics tab so it's easy to find.

Same Google sign-in + admin allow-list protection as `/admin`; non-admins see the sign-in prompt, not data.

## Technical notes

- New server function `adminDownloadFeed` in `src/integrations/supabase/api.functions.ts`: admin-token checked, returns totals (all-time / 7d / 30d / today via count queries) plus a page of `download_events` rows joined to `pdfs` for parsha, with optional search string, range, limit and offset.
- New route file `src/routes/admin-analytics.tsx` (standalone, so the existing `/admin` route file is not turned into a layout) rendering a new `src/components/DownloadsDashboard.tsx`.
- Reuses `useAuth` + `checkIsAdmin` exactly as `/admin` does; no changes to existing analytics components or tracking endpoints.
- Route marked `noindex` in `head()`.
