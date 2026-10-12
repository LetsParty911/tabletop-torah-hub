# Release safety audit: what Publish would ship besides the Noahide page (read-only)

## How the live release was identified
- Live deployment ID: `psr2.c8e94510-…` (from torahforthetable.com response headers).
- `/api/site-version` on the live site returns the marker `tftt-tracking-pr19-20261011`. The marker is fixed text, not the exact commit, so I located the live version by checking which recent changes show up in the live code:

| Commit (Oct 10–12) | Live? | Evidence |
|---|---|---|
| b453dbe release-marker endpoint | Yes | `/api/site-version` responds |
| 164f5d0 reader loyalty, PDF diagnostics, `/wa` evergreen | Yes | live `/wa` sends readers to `utm_campaign=weekly_parsha` |
| 788ad0a location-quality dashboard | Yes | live admin code has "Location data source" and "Network type" |
| "Counted PDF opens" and "Maintenance traffic" admin work | Yes | both labels are in the live admin code |
| 942bd3d full city review in owner analytics | **No** | "Conflicting estimates" isn't in the live code |
| e18b9d1 shul poster as its own traffic source | **No** | "Shul Poster" isn't in the live code |
| 827822b and its Oct 12 helpers: Noahide page and footer link | **No** | `/noahide-resources` returns 404 live |

The October 8 plan file is out of date. Live is now only a few commits behind the editor.

## 1) Is the unpublished change limited to the Noahide page, footer and route list?
**No.** Two other committed changes from Oct 11 aren't live yet. I couldn't confirm 374195b (the maintenance header) or cec8fb6/d3a63dd one by one, because maintenance is off and they leave no visible marker. They probably went live with the later 164f5d0 publish, but that isn't proven.

## 2) Unrelated changes Publish would sweep in
- **942bd3d (admin only):** a full aggregate city review in Owner Summary (`OwnerSummary.tsx`, `geo-insights.ts`). Visitors never see it.
- **e18b9d1 (analytics behavior):** shul-poster visits get their own "Shul Poster" source group. It changes `src/routes/api/events.ts` (the event-saving server code), `src/lib/first-party-analytics.ts` (the tracking script that runs on every page) and `source-group.ts`. This changes how new incoming visits are labelled. It doesn't touch PDFs, layout or availability.
- **Staged visitor-alert files (`docs/visitor-alert-fix/`):** they ship as inert text. Nothing imports them, they aren't in the deployable functions folder, and publishing makes no database changes. The live alert trigger and function stay as they are.
- **Maintenance:** the "reopen soon" text and the maintenance-traffic tracker already appear to be live. Publishing changes nothing there, and the maintenance setting itself is stored in the database, not the code.

## 3) Can only the Noahide page and link be published?
**Not as things stand.** Lovable publishes the whole current version; you can't pick individual files. A publish today ships the Noahide page plus 942bd3d and e18b9d1.

Safety of the domain itself: publishing needs no DNS changes. It goes to the same four connected domains, and the risk to availability is low (both riders are small; e18b9d1 has tests).

Owner options (nothing done yet):
- **A. Accept the riders:** publish as is. The admin city review and the "Shul Poster" source label go live too.
- **B. Noahide only:** in build mode I'd temporarily undo 942bd3d and e18b9d1 in the code, publish, then restore them. That's more work and has its own risk of mistakes.
- **C. Wait:** review the two riders first, then publish everything together.

## Limits of this audit
- I can't read Lovable's internal list of releases, so the live version was worked out from the clues above, not read directly.
- 374195b, cec8fb6 and d3a63dd are probably live but not confirmed.
- No changes were made: no code, no publish, no database or DNS.
