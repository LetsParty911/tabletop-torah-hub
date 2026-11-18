# 2026-11-18 external review fixes (preview only, not published)

## Archive navigation (Priority 1)
- Reproduction attempts: production desktop Chromium (tracking blocked), 9 steps incl. SW-controlled reload — content always updated, but each step took 0.3–2.3 s with no feedback; SSR `curl` timings 1.9–3.0 s per filter. The "stays until manual reload" symptom was NOT reproduced.
- Causes addressed: no pending UI (router keeps previous match while the loader runs); three sequential server reads per archive request; no timeout/retry; controls reverted to the old value while loading; service worker sat between router and every data request (and cached every filter combination); tabs predating a release could fail to load new route files; `?year=5786` was redirected to the quoted form `?year=%225786%22` on reload.
- Fixes: visible "Updating results…" status + aria-busy results; global top progress bar and a "Reload page" option after 10 s; loader abort signal + 20 s timeout → "Archive unavailable" with Try again; parallel server reads; controls follow requested URL; search analytics use committed results; SW bypasses `/_serverFn/`; one-time automatic reload for missing route files; numeric year in URL.
- Browser check: `python3 tools/e2e/archive_navigation.py` (local preview, data slowed 1.2 s): 22/22 PASS — parsha, audience, clear, kept selection during loading, year, search, next page, Back, Forward, open result, Back, SSR reload, no page errors, no mobile overflow. Error path (aborted data → Try again) and slow path (12 s → Reload page) checked manually.

## Site-status check fallback (added)
The root site-status (maintenance) check re-runs on retries/invalidation. It is now time-boxed to 8 s on client navigation; a stall triggers one full page load of the requested URL (server render re-checks maintenance), errors and repeat stalls still fail closed. Browser check: archive error → Try again with the status check hung → one full document load of /archive?parsha=Toldos, 26 results, no maintenance screen.
Live-site comparison (same script against production, current live code): content did update, but 4 checks failed — no loading status, filter dropdown reverted to the old value while loading, "publications" chip label, quoted year URL.

## Same-problem sweep (other pages)
Rule: after a click, filter or Back, the page shows the new content or a visible loading/error state.
- All public pages: global loading bar + 10 s "Reload page"; router default error screen has Try again and one-time reload after a new release.
- /view/$id: changing the embedded viewer's address added a hidden history entry, so Back after a related link did nothing visible — iframe now keyed per PDF; cover-failure state resets per PDF.
- /parsha/$slug/$year and /yom-tov/$slug/$year: audience/length/type filters now reset per collection.
- Home, /parsha/$slug, /publication/$slug, /originals, /publications, /divrei-torah-parsha, /brief-insights, /hidden-gems: no URL-driven filters or carried-over state found (code read).

## Embedded PDF filename (Priority 3)
The reader iframe loads `/view/<id>/pdf`, which 302-redirects to the public storage object. The browser's PDF viewer shows the PDF's own Title metadata or the storage file name. Changing it would require renaming stored objects, editing the PDFs, or streaming PDFs through the Worker with a Content-Disposition header (removed earlier for speed). None was done. Download filenames (built by the site) now use public spellings.

## Known pre-existing test failures (unchanged files)
- `src/lib/hidden-gems.test.ts` › fails closed on unknown or invalid dates (1).
- `src/tests/homepage.smoke.test.tsx` › 2 "Open PDF" count tests — reproduced on an unmodified copy of HEAD.
