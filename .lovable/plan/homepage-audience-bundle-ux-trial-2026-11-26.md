# Homepage audience-bundle UX trial

Baseline: commit `2d8001f5`. Keep the trial isolated so reverting its single new commit restores the current homepage.

## Changes
- Replace only the existing seven-choice Original Weekly Publications strip with three audience bundles under “Something for Every Shabbos Table”; retain the weekly collection, filters, signup, Phase 4B/4C behavior, and all unrelated sections.
- Match constituents by canonical publication ID against the currently published, non-fallback homepage collection. Use the existing artwork and individual reader links; never substitute another week or an unpublished PDF.
- Add compact responsive bundle cards with one primary combined-PDF action. Enable it only when every constituent is available; otherwise show exact availability and individual access without claiming completeness.
- Merge the existing PDF bytes in the browser on demand using a lazy-loaded `pdf-lib` module. Preserve page order and printability, show progress/errors, avoid accounts and recurring jobs, and keep individual PDF analytics unchanged.
- Add an accessible expand/collapse containing all seven individual current-week reader links and Originals archive links, collapsed by default.
- Record a distinct bundle action through the existing first-party event stream only if accepted without schema changes; never emit individual open/download events for bundle constituents.

## Verification
- Unit-test exact matching, complete/partial/missing bundles, ordering, and download eligibility.
- Test the merge with real current PDFs and verify merged page counts/content.
- Run existing homepage, analytics, UX, signup, typecheck, and production-build checks.
- Browser-check desktop/mobile layout, all seven reader/archive links, expansion, real downloads, failures, console errors, and unchanged individual analytics.
- Commit the isolated trial and report changed files, preview URL, results, limitations, and rollback commit. Do not publish or deploy production.
