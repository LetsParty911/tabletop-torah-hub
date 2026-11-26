## 2026-11-18 external review fixes (no publish)
- [x] Archive client navigation: pending/error/retry, abort+timeout, parallel reads, SW bypass, stale-release recovery; e2e 22/22 (original "stuck" symptom not reproduced)
- [x] Homepage copy: hero notice kept, originals intro mentions outside publishers, archive-anytime vs Thursday deadline, NEW badge semantics
- [x] Labels: audience chips "selections", public Vayetzei/Q&A spelling in titles and download names; embedded PDF filename limits documented
- [x] Layout: scroll padding under sticky header, larger mobile covers, odd related-card gap, no repeated mobile quick list, harmonized captions, round menu button
- [x] Typecheck clean, UX 135/136 + weekly 33/33 + signup 35/37 (failures pre-existing), build OK; publish awaits owner

## Current-week measured thumbnail savings
- [x] Measure live IDs, original bytes, derivative availability, recursive storage usage and request counts
- [x] Create 20 immutable WebPs (173,140 bytes); verify public bytes and idempotent rerun, preserve 2 permanent covers
- [x] Batch-confirm current-original version eligibility; keep original fallback and future upload generation
- [x] Tests (160 passed), standalone typecheck and automatic build; desktop/mobile, no speculative requests and preserved click correlation
- [x] Basic security scan found no issues; requested production publish
- [ ] Production page activation — fresh post-request check still serves previous deployment; awaiting hosting release completion, no repeated publish

## Final pre-publish thumbnail / footer correction (no publish)
- [x] Disable unconfirmed storage derivative reads; retain original-first display, bundled covers and future derivative generation
- [x] Restore site footer contentinfo semantics without changing root/gated layouts
- [x] Verify targeted tests (119 passed), preview requests/landmarks (zero speculative requests; one main/contentinfo) and automatic build OK; document deferred storage activation and unverified standalone typecheck

## November 5 focused UX correction (no publish)
- [x] Weekly selection anchor/hero CTA, return links and complete accessible mobile navigation
- [x] Mutually exclusive displayed length filters with legacy long bookmarks preserved
- [x] Public landmarks, search focus, consent targets and modest typography/card polish
- [x] Free-plan small WebP derivative upload/fallback support
- [x] Current displayed collection backfill complete; older weeks intentionally remain original-only (see measured thumbnail workstream)
- [x] Run focused regressions and desktop/mobile journeys; automatic build OK; standalone typecheck and real upload not run (see docs/verification/ux-correction-2026-11-05.md)

## Homepage sharing (no publish)
- [x] Move one share section before category controls, preserve WhatsApp keys, add copy success/fallback and footer anchor
- [x] Verify targeted tests, mobile/desktop and expanded-state visibility, compilation (9 tests passed; live preview clipboard/fallback/footer checked; automatic build OK; separate typecheck not run)

## Hidden Gems of the Parsha (no publish)
- [x] Add approved Chayei Sarah text, matching-week homepage teaser, archive and reader page
- [x] Verify rollover/fallback rules, desktop/mobile reading and single-page printing, targeted tests and build signal (21 targeted tests passed; homepage smoke 6/9, same 3 failures reproduced without feature; fresh reader has no page errors)

## Country-only deny (no publish)
- [x] Audit hosting country provenance, request coverage and upstream WAF availability (sanitization/WAF access unverified)
- [x] Add first-request gate for only IN/PK/BD/VN/CN without exemptions or side effects
- [x] Run focused/security regressions and document enforcement boundaries and QA in docs/country-deny.md

## Trusted VPN browser (preview only)
- [x] Add independent signed cookie, authenticated enable/revoke and admin controls
- [x] Test token, authentication, VPN-only exemption and unchanged city/IP gates
- [x] Verify authenticated desktop/mobile controls and compilation; do not publish (QA in docs/trusted-vpn-browser.md)

## Lech Lecha weekly-state repair (no publish)
- [x] Restore pending countdown and current-week heading with previous PDFs preserved
- [x] Prevent stale override renewal and require conscious off-calendar override
- [x] Verify deadline, publication, rollover, admin safeguards and unchanged gates

## Urgent Sukkos feature
- [x] Locate the supplied artwork and download file — exact artwork is not currently attached
- [x] Add the homepage feature before weekly content
- [x] Add the item to Sukkos/Yom Tov/archive browsing
- [x] Preserve existing download tracking and wire it for activation with the final file
- [x] Run tests, typecheck, and verify the page (production build is verified by the project harness)

## Two-size Sukkah decoration (no publish)
- [x] Wire both uploaded PDFs (8.5 × 11, 11 × 17) into the existing Sukkos feature with a real preview
- [x] Admin: 'Sukkah Sign Downloads' section (8.5x11 / 11x17 / Total), publish

## Mobile-first homepage conversion
- [x] Add concise mobile action/value introduction
- [x] Surface four existing chooser categories before newsletter signup
- [x] Add a routed, tracked current Sukkos recommendation CTA
- [x] Verify mobile and desktop behavior, tests, typecheck, and build

## Brand banner rollout
- [x] Homepage banner, header, footer, share image from approved artwork; verify; publish; check live

## Sept 25 production fixes
- [x] Resources: Mi Ka'amcha Yisroel moved to Featured Independent Series
- [x] Publications in desktop + mobile nav
- [x] Short Vorts: published Sukkos PDF beats placeholder
- [x] Archive "From <publication>" attribution
- [x] Mobile seasonal title kept
- [x] "Download PDF" labels
- [x] Evergreen series descriptions (5)
- [ ] Archive show-more: left unchanged (risk to search/filter)

## Archive publication filter
- [x] Options from canonical publication only; no title fallback; match publication only

## Sukkos heading wording
- [x] Homepage seasonal heading: "Divrei Torah for Sukkos, Shmini Atzeres & Simchas Torah"

## Admin since-last PDF activity (published Oct 8, 2026)
- [x] Replace the misleading download-only tile with deliberate Open PDF click metrics
- [x] Include unique PDFs, clicking visitors, and separate download actions
- [x] Make Open PDF clicks prevent a false empty summary
- [x] Run typecheck, build, and all runnable tests

## Poster short links (unpublished, awaiting owner review)
- [x] /r — OurKehilla poster (unchanged)
- [x] /s — shul poster: 302 to utm_source=shul / medium=poster / campaign=evergreen_poster_oct2026
- [x] /j — workplace poster: 302 to utm_source=workplace / medium=poster / campaign=evergreen_poster_oct2026
- [x] Focused tests, typecheck, local-only verification; sitemap confirmed to omit all four aliases
- [ ] Publish (owner approval) and then re-verify /r, /s, /j on the live domain

## Admin PDF terminology audit (preview only)
- [x] Correct owner/admin labels, notes, drilldowns, and report exports without changing tracking or counts
- [x] Validate uncapped actions, paired redirects, distinct IDs, exclusions, and Used Torah regressions
- [x] Run targeted tests and inspect authenticated preview; leave production unchanged

## Reporting authority and Thursday signup (preview only)
- [x] Audit existing maintenance authority and canonical PDF semantics; fix overlapping new/returning visitor headlines only
- [x] Add compact near-top signup while preserving the lower form and unique anchors
- [x] Run 55 focused and 325 full-suite regressions plus 12 calendar/download tests; verify desktop/mobile signup and authenticated owner report without subscriber or production changes


## 2026-11-18 homepage simplification (owner-approved)
- [x] One weekly PDF list right after the hero; audiobook below; compact originals intro + /originals link; mobile quick list, large originals cards and featured picks removed; compact mobile cards; tests updated

## 2026-11-18 public UX/content fixes
- [x] Reader back link: this week → homepage list; older → its parsha/Yom Tov year page; else Archive
- [x] Parsha year pages un-nested (were showing the all-years page with two canonicals; combined parshiyos 404'd)
- [x] "Corrected" file-name leftover removed from descriptions; parsha pages show Deeper Learning / Brief Insights labels
- [x] PDF buttons named with title + parsha/year
- [ ] Combined-parsha hubs (/parsha/nitzavim-vayeilech etc.) still 404 — links on archive/publication/year pages; awaiting owner decision (touches sitemap/SEO hub list)
- [ ] "Shabbos Table Torah Stories" vs "Stories for the Shabbos Table": two publication IDs, both have a Nitzavim-Vayeilech 5786 PDF — not merged; owner to confirm

## 2026-11-18 focused refinements
- [x] Header search shows the word "Search" (or "Close") from 1024px up; icon only at tablet width
- [x] Homepage originals intro lists each series with one short explanation line
- [x] "TFTT Original" on weekly cards is a quiet label above the title; NEW stays a gold badge

## 2026-11-25 Phase 4B and 4C only
- [x] Inspect PR 173, Phase 4C branch and PR 171; reuse scoped presentation changes on current HEAD
- [x] Reader action order, historical discovery, explicit WhatsApp; unchanged tracking
- [x] Compact stable filters/counts, single earlier signup, conditional redundant artwork; owner confirmed current wording
- [x] Run regressions and desktop/mobile real-data preview checks (41/41); signup 42, weekly 39, safeguards 53 passed; UX 214 passed/one pre-existing unrelated failure
- [x] Commit a0a9fc5d for platform GitHub sync; basic security checks passed; published via Lovable; production 41/41 desktop/mobile checks passed, new build marker and no-store verified
- [x] Report exact scope, pre-existing Hidden Gems failure, pending platform GitHub sync and non-final credit measurement (8.20 recorded at lookup)
