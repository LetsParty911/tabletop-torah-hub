# The Parsha Detective — fourth original series (prepared, inactive)

Status: code support is in place but **inert**. `PARSHA_DETECTIVE_PUBLICATION_ID`
in `src/lib/tftt-originals.ts` is `null`, so nothing about the series appears
anywhere on the site. No publication record, PDF, thumbnail or UUID has been
created or guessed.

## What activates, and when

| Condition | /originals result |
|---|---|
| ID is `null` (today) | Identical to the three-series page. |
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

1. **Register the canonical publication record** in the content database's
   `public.publications` table (the same database the admin upload form reads).
   Let the database generate the id (`gen_random_uuid()` default); do not type
   one in. Columns: `name = 'The Parsha Detective'`,
   `publisher = 'Torah For The Table'`, `default_audience` = the site's
   Children/Families value, `default_format_type` as used for the other
   originals, a short `default_description`, a `sort_order` after the three
   originals, `active = true` (the upload picker only lists active records;
   `/publications` hides records with zero published editions, so an empty
   record is not publicly visible). Read back the generated `id`.
2. **Upload the approved PDF as a Draft** in Admin → Upload, choosing
   "The Parsha Detective" as the publication, parsha Toldos, year 5787. Use
   **Save as Draft**, not Upload & Publish. Attach the approved thumbnail.
3. **Configure the id in code**: set `PARSHA_DETECTIVE_PUBLICATION_ID` in
   `src/lib/tftt-originals.ts` to the exact id from step 1 (a malformed, nil
   or duplicate value is ignored and the series stays inactive). Run
   `bunx vitest run src/lib/parsha-detective.test.ts src/lib/original-editions.test.ts`.
4. **Publish the PDF row** (toggle the draft to published) once the owner
   approves the source corrections.
5. **Publish the site** with explicit owner authorization, then verify on
   https://torahforthetable.com/originals: the Detective card, one Toldos
   5787 Detective edition with the real thumbnail, one working Read Now link,
   and the four-series description in page metadata.

Order note: steps 3 and 5 can happen before step 4 — the card and listing stay
hidden until a published edition exists.
