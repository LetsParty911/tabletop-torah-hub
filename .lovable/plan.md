## Read-only status report: three diagnostics warnings

Nothing was edited or published.

About the panel: the security scanners report 0 findings, and their results are stale (last run Sept 22–24). These three warnings match the issues raised in the earlier analytics/banner audit. The third one is most likely the homepage banner showing hard-coded "Subscribe every Thursday" text instead of the text saved in admin. I haven't confirmed this against the panel itself, so please confirm it's the third warning shown there.

| # | Warning | Status |
|---|---------|--------|
| 1 | Download counted as "Direct" / unknown device | Fixed in the current code, not re-scanned, only partly verified |
| 2 | Older page-view report repeats the first referrer on every page | Fixed in the current code, not re-scanned, not verified in a browser |
| 3 (likely) | Homepage banner ignores the admin-saved text | Fixed and verified in preview, not re-scanned |

### Evidence
1. `src/routes/view.$id.download.tsx` (the download route's handler): before saving the server-side "file was sent" event, it copies the source, campaign, referrer, location and device from that session's earlier `analytics_events` rows. If the device is still missing, it works it out from the browser's user agent. Remaining gaps:
   - A session with no earlier rows still shows as "Direct".
   - No real download has been run from start to finish to confirm it.
2. `src/lib/site-analytics.ts` (the page-view context builder): the referrer and referrer_host are filled only on the first page view of a page load (`!firstViewTracked && document.referrer`). Later pages you click through to inside the site send none. UTM tags are recorded only when the page's own address carries them. Remaining gap: the payload is sent with sendBeacon, and my test browser couldn't read it, so I checked this by reading the code only.
3. `src/components/AnnouncementBanner.tsx`: the banner shows the admin-saved text (`getAnnouncementBanner`), stays hidden when turned off or empty, and adds a Subscribe link only if the saved text mentions email or subscribing. It showed the admin text in the preview. I haven't seen a newly saved admin text appear on the homepage yet.

### Publish state
All three fixes are in the current code (HEAD 86879b6). They may not be live: the last publish didn't start because another deployment was already running.

### Suggested next steps (only if you approve)
- Re-run the security scan so the panel refreshes.
- Run one real download and one WhatsApp-referred visit with internal clicks, then check the saved rows.
- Publish.
