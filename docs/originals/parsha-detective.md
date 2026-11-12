# The Parsha Detective — fourth original series (registered; edition on hold)

Status: the canonical publication record now exists in `public.publications` with its database-generated ID `20900013-b70f-4091-8026-d5a05131ded8`. A separate release branch configures that exact ID in `src/lib/tftt-originals.ts`. The series remains hidden until it has an actual published edition. The Toldos PDF and thumbnail are staged outside the live site pending final editorial source approval; no PDF has been uploaded or published.

## What activates, and when

| Condition | /originals result |
|---|---|
| ID is `null` | Identical to the three-series page. |
| ID set, no published Detective PDF | Still identical (no card, no Read Now, no SEO change). |
| ID set **and** a published PDF with that `publication_id`, a `parsha_key` and a `jewish_year` | Detective card appears (2×2 card grid), its edition appears last in that week's group (4-across on desktop, 2×2 on mobile) with the real thumbnail and one Read Now link, and the meta description names all four series. |

Scope: only `/originals` uses the fourth series. Homepage starter cards (three
fixed series), the table chooser, `/publications` "originals" grouping and the
item page TFTT label still use the three-series list. Extending those is a
separate, explicit decision.

## Approved metadata (apply only after source approval)

- Publication name: **The Parsha Detective**
- Publisher: Torah For The Table
- Default audience: Children / Families
- Toldos 5787 edition: one 3-page US Letter PDF, no cover page,
  file `Parsha_Detective_Toldos_5787_TFTT.pdf`, containing three six-panel
  mysteries (Yitzchak's Bracha, The Three Wells, The Bechorah Mystery).
  One PDF row only — never three standalone listings.
- Thumbnail: the one approved real artwork image (do not edit comic art).

## Administrative steps (in order)

1. **Completed:** Registered the canonical `public.publications` record using the database-generated ID `20900013-b70f-4091-8026-d5a05131ded8`. Publisher: Torah For The Table; audience: Families; format: Stories; sort order: 4; active: true. At last verification, zero PDF editions exist, so no edition has been exposed.
2. **Upload the approved PDF as a Draft** in Admin → Upload, choosing
   "The Parsha Detective" as the publication, parsha Toldos, year 5787. Use
   **Save as Draft**, not Upload & Publish. Attach the approved thumbnail.
3. **Staged in GitHub release branch:** `PARSHA_DETECTIVE_PUBLICATION_ID` uses the verified ID from step 1; guardrails still reject malformed or duplicate IDs. Run `bunx vitest run src/lib/parsha-detective.test.ts src/lib/original-editions.test.ts` during review, before merging.
4. **Editorial hold:** Correct and independently verify Case #2's Rashi attribution before the draft PDF is approved. Then publish the PDF row when authorized.
5. **Publish the site** with explicit owner authorization, then verify on
   https://torahforthetable.com/originals: the Detective card, one Toldos
   5787 Detective edition with the real thumbnail, one working Read Now link,
   and the four-series description in page metadata.

Order note: steps 3 and 5 can happen before step 4 — the card and listing stay
hidden until a published edition exists.

## No Lovable credits / release protection

This work is being staged through GitHub and Supabase directly, without a new Lovable AI build. A draft pull request is not a live deployment. Do not merge the release or publish the PDF until source review is complete. Do not silently change the locked comic illustrations. The thumbnail must come from actual original comic artwork.
