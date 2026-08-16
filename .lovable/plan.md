# Fresh Pages on Mobile and Desktop

Goal: after you publish, every visitor — phone, desktop, and installed app users — gets the new version on their next visit, without manual refreshes or "clear your cache" instructions.

## Where things stand today

Already in place and working:
- HTML pages are served with revalidate-every-time headers, so the browser always checks for a new page.
- Hashed JS/CSS files under `/assets/` are cached for a year, which is correct because their filenames change every build.
- The service worker uses a build ID in its URL, so a new publish installs a new worker and deletes the previous caches.
- PDFs and download endpoints bypass the worker entirely.

The remaining freshness gap: an already-open tab or an installed home-screen app keeps running the old JavaScript until the user fully closes and reopens it. A new worker installs quietly in the background but nothing tells the page it is there, so returning visitors — especially installed-PWA users on phones, which are almost never fully closed — can stay on yesterday's build for days.

## What to add

1. Update detection in the registration code
   - After registering, listen for a newly installed worker and, when the page is already controlled by an older one, treat that as "an update is ready".
   - Check for updates on page load, when the tab becomes visible again, and roughly every 30 minutes while open.

2. Refresh behavior
   - Tell the waiting worker to activate immediately, then reload the page once when control changes (guarded by a flag so it can never loop).
   - Because the site is content-focused with no long forms, this silent auto-refresh is the right default; the reload only happens when the tab is visible and idle so it never interrupts a download or typing.

3. Navigation freshness inside the worker
   - Keep navigations network-first, but stop storing every visited URL in the shell cache; retain only the offline fallback set. This prevents a stale page from being served after a deploy when the network is briefly slow.

4. Manual escape hatch (kept, documented)
   - `?sw=off` already unregisters the worker and clears its caches. This stays as the one-line fix to give anyone still reporting a stale screen.

## Publishing side

- Frontend changes only go live after clicking Update in the Publish dialog; backend changes deploy immediately. Nothing to change here — just confirming the flow.
- After publishing, the way to verify is: load the site in a private window, confirm the change, then load it in a normal tab and confirm it appears within one reload.

## Technical notes

- Files touched: `src/pwa-register.ts` (update detection, visibility/interval checks, controlled reload), `public/sw.js` (drop per-URL navigation caching, keep precache + offline fallback).
- No changes to `src/start.ts` headers — the current policy is already correct.
- No new dependencies; the existing hand-rolled worker stays, since it deliberately bypasses PDF delivery.
- Verification: publish, then use a browser session to load the site, apply a simulated new build ID, and confirm the page reloads itself once and renders the new asset hashes.
