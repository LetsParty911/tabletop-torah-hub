# Add the two Trust in Hashem Sukkah decorations safely

## Recommendation

Use **one seasonal feature card with two size buttons**, not two cards. The PDFs are two print sizes of the same decoration, so separate cards would repeat the artwork and copy and crowd the homepage on mobile.

**Card copy**
- Eyebrow: `Free Sukkah Decoration`
- Headline: `Trust in Hashem`
- Supporting line: `A beautiful collection of pesukim, ready to print for your Sukkah.`
- Prompt above buttons: `Choose your print size`
- Primary actions: `Download 8.5 × 11` and `Download 11 × 17`
- Closing line: `Print • Laminate • Enjoy in your Sukkah`

Both size actions should have equal visual weight. The artwork remains first on mobile, followed immediately by two full-width download buttons.

## Exact placements

1. **Homepage:** directly below the current announcement strip and before the weekly/current collection. This makes the seasonal item visible in the first screen without replacing the current-week state.
2. **Archive:** one compact seasonal feature between the archive controls and the year-by-year listings. Do not create two archive cards.
3. **Sukkos collection:** include both PDFs as ordinary resources in the Sukkos 5787 collection, while also showing the same compact two-button feature above that collection. The existing Sukkos-only condition can be retained.
4. Do not add the decoration to unrelated publication pages or ordinary weekly selections.

## Content setup

- Upload exactly two supplied, unaltered PDFs through the existing admin upload flow:
  - `Sukkos Decoration — Trust in Hashem (8.5 × 11)`
  - `Sukkos Decoration — Trust in Hashem (11 × 17)`
- Assign both to `Sukkos`, Jewish year `5787`, with clear page size metadata and no invented publisher information.
- Keep both unpublished until their previews, titles, dimensions, and downloads are verified.
- Use the generated preview from the supplied artwork; do not redraw, OCR, regenerate, or substitute imagery.
- Publish both records together only when the isolated site release is ready.

## Smallest code change

- **`src/components/SukkosTrustFeature.tsx`** — convert the existing single disabled 11 × 17 action into two tracked download actions and support one shared artwork preview.
- **`src/routes/index.tsx`** — supply the two publication IDs/download links and preview to the existing homepage placement.
- **`src/routes/archive.tsx`** — supply the same data to the compact archive placement.
- **`src/components/ReadingCollectionView.tsx`** — supply the same data to the existing Sukkos-only placement.
- **`src/components/DownloadToPrintButton.tsx`** — no further change expected; it already supports custom labels and the existing action/served-event correlation.
- No schema migration, new page, analytics rewrite, filter change, or new download system is needed.

## Safest isolated release workflow

1. Confirm the exact production deployment commit before changing anything. The public homepage and archive currently do **not** render the scaffolded Sukkos feature, although the repository contains it.
2. Create a temporary release branch/worktree from that confirmed production commit, not from the current repository tip.
3. Bring over only the reusable seasonal card and its three placements, revised for the two supplied PDF records. Exclude every analytics, admin, privacy, and unrelated commit.
4. Upload the two PDFs as unpublished records and capture their generated IDs/previews.
5. Wire only those two IDs into the isolated release. Verify both tracked download routes issue the correct direct file redirect and preserve the existing meaning of “served.”
6. Run unit tests, TypeScript checks, and the production build. Check desktop and mobile homepage, archive, Sukkos collection, both previews, and both downloads.
7. Publish the isolated release first, verify production, then publish the two content records together. If the platform cannot make those steps atomic, publish the records immediately after the site verification and confirm the public pages again.

## Current-state and deployment risks

- The working tree is clean, but `HEAD` is seven commits beyond the last visible publish marker. Those commits include unrelated admin/analytics work as well as the dormant seasonal scaffold. Publishing the current tip directly could expose unrelated pending changes.
- The live homepage currently leads with `Sukkos` and then the still-available Ha'azinu collection; the new feature should sit between the announcement strip and that weekly content.
- The live archive currently exposes Rosh Hashanah and Yom Kippur but no Sukkos collection. Adding two published Sukkos 5787 rows should create that collection through the existing collection loader.
- No supplied decoration PDF or matching artwork is present in project assets or recent uploads available to this workspace. The exact two files must be attached before implementation can finish; substitutes should not be used.
- The content database and PDF storage are external to the connected project database, so records should be created through the existing admin upload flow rather than a new migration.
