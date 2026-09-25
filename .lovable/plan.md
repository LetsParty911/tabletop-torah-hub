## Read-only audit of the current preview (Sept 25, 2026)

Nothing was edited, committed or published. I checked 15 pages on desktop (1280 wide) and phone (360 wide) in a fresh browser, and read the related code.

### Confirmed issues

| Severity | Where | Issue |
|---|---|---|
| High | Sukkos page `/yom-tov/sukkos/5787`, phone | The page is wider than the screen. The "Sukkos Questions & Answers" card measures about 530px on a 360px phone, so the page scrolls sideways. The long title and the "CHILDREN · HALACHA · 2 PAGES" line don't wrap. (`ReadingCollectionView` card) |
| Medium | Resources page `/resources` | The menu and footer say "Resources", but the page title, tab title and share title still say "Torah for the Table Originals". (`src/routes/resources.tsx` lines 7 and 93) |
| Medium | Short Vorts `/short-vorts` | The main heading and description say "Short Vorts on Parshas Hashavua" during Sukkos, which clashes with the Sukkos notice below them. (`src/routes/short-vorts.tsx` lines 19, 47, 247) |
| Low (accessibility) | Every page except `/publications` and the Yom Tov page | No main-content landmark, so screen-reader "skip to content" doesn't work. It should sit once in the shared layout. (`src/routes/__root.tsx`) |

### Working as expected
- All pages load (200). A missing page correctly shows "Page not found" with a 404.
- `/my-table` sends visitors to the homepage. No "My Table" text appears anywhere public.
- `/mission` goes to About and `/originals` goes to Resources.
- No poster text appears anywhere.
- Phone homepage heading: "Choose a Dvar Torah for Your Table". Desktop keeps the Sukkos heading.
- No pictures missing descriptions, no unlabeled buttons, no duplicate IDs, and no sideways scrolling on any other page.
- Offline page renders.

### Risks, not confirmed
1. **Homepage error on the very first load (desktop):** the browser reported "Invalid hook call" twice. A reload and later loads were clean, so this is probably a start-up quirk of the test server, not the live site. Worth a quick look on the live site.
2. **Phone bottom crowding:** two things are pinned to the bottom of the phone screen, the back-to-top button (about 80px up) and a full-width bottom bar (top layer). On short phones they may cover card buttons. I didn't take a screenshot to confirm.
3. **Quick-choice results:** my automated count found no result cards after tapping each quick choice. The results likely use a different layout than the one I counted, and the previous round verified them live. Treat this as unverified by this audit, not as broken.
4. **Downloads with no earlier activity** (`src/routes/view.$id.download.tsx`): these can still be saved as "Direct" traffic. This is a known leftover.
5. **Old tracking still running** (`src/lib/site-analytics.ts`): the older page-view tracker runs alongside the main one. Its numbers are labeled "audit only" but can still confuse.
6. **Keeping the current week fresh:** the homepage code has no timer that refreshes it or re-checks when the tab comes back into view. If someone leaves the page open from Thursday into Shabbos, they won't see new items until they reload. The offline copy can also serve an older homepage until the browser picks up the new version.

### Not covered
- I didn't submit the email signup or the contact form, to avoid creating real entries.
- I didn't finish a real PDF download.
- I didn't sign in to admin.
- I didn't look closely at each page's screenshot (the audit tool couldn't save files), so the layout checks come from page measurements.

### Suggested fixes (only if you approve, in build mode)
1. Make the Sukkos page cards wrap on phones.
2. Rename the Resources page heading and titles.
3. Change the Short Vorts heading to name the current Yom Tov.
4. Add one main-content landmark in the shared layout.
