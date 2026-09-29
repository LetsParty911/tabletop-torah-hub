# Site audit findings (read-only) and proposed follow-up fixes

No changes were made during the audit. If you approve, only the fixes listed below are made.

## 1. Definite errors
- **Privacy page date** (`src/routes/privacy.tsx`, line 5): "Last updated September 22, 2026". Check that this is the correct date.
- **"Resources" vs "Originals" naming**: the menu and footer say "Resources" (`src/routes/__root.tsx`, `src/components/SiteFooter.tsx`). The page's own title and main heading say "Torah for the Table Originals" (`src/routes/resources.tsx`). There is also an `/originals` address that just redirects to `/resources`. So one page has two names.

## 2. Likely mistakes / inconsistencies
- **External series on an "in-house" page** (`src/routes/resources.tsx`): the page describes itself as in-house material, but it also features Mi Ka'amcha Yisroel, which is labeled "Not written by Torah For The Table". It may need its own clear heading.
- **"Short Vorts" vs "Brief Insights"** (`src/lib/format-labels.ts`): the filters rename the Short Vorts type to "Brief Insights", but the menu and page still say "Short Vorts". Someone filtering the Archive for "Short Vorts" won't find that option.
- **Archive Publication filter** (`src/routes/archive.tsx`): when an item has no publication, the filter uses the item's title instead. This can add one-off entries to the Publication dropdown. It also doesn't use the standard publication names in `src/lib/badges.ts`.
- **Quick tile wording** (`src/routes/index.tsx` vs `src/lib/table-chooser.ts`): the tile says "Quick Vorts" but internally it's "Quick Vort". Visitors can't see this; it's a code tidiness issue only.

## 3. Things that look correct
- Menu and footer items, order and wording match on desktop and mobile, with nothing duplicated.
- `/mission` redirects properly to `/about`.
- My Table is fully hidden: its page redirects home, and its buttons aren't used anywhere.
- The manage-preferences page is only reached from emails.
- The quick tiles use real stored fields (featured slot, audience, format, category, tags), not free text.
- The Archive has an empty state both for no issues and for no filter matches.
- Audience matching is shared by the homepage, Archive and Publications.

## 4. Needs browser or data verification
- Whether Resources visually separates Originals from Featured Series.
- What the live Archive Publication dropdown actually shows.
- How the Archive filter rows wrap on a phone, and the homepage's mobile collection bar.
- Whether live rows use only the four featured slots (children, family, quickest, deeper).
- Live stored values for format_type, publication, featured_slot and badges. This audit compared the code with itself, not with live database rows.

## Proposed fixes (only if approved)
1. Correct the Privacy date to the real date (tell me which one).
2. Pick one name, "Resources" or "Originals", and use it in the menu, footer, page title and heading.
3. Give the Featured Series block on Resources its own heading so it's clearly not in-house.
4. Decide whether filters say "Short Vorts" (to match the menu) or "Brief Insights". Then make them consistent.
5. Change the Archive Publication filter to group by the standard publication names, and stop adding titles as publications.
6. Run a data query plus desktop and phone browser checks on the items in section 4. Report the results before changing anything else.

## Open decisions
- The correct Privacy date.
- "Resources" or "Originals".
- "Short Vorts" or "Brief Insights".
