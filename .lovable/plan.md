# Sukkos Trust sign downloads: how they are tracked today (read-only findings)

No changes proposed. This summarizes the published code (commit c2cf7e2). Approving this does nothing to the site.

## What happens when a sign button is clicked

Each click on "Download 8.5 × 11" or "Download 11 × 17" sends three separate signals:

1. **Google Tag Manager `pdf_download` event** (browser only, not saved in our own database)
   - 8.5 × 11: `file_id: "sukkos-trust-8.5x11"`, `print_size: "8.5 × 11"`
   - 11 × 17: `file_id: "sukkos-trust-11x17"`, `print_size: "11 × 17"`
   - Both also send `file_title`, `source_name`, `parsha: "Sukkos"`, `page_path`, and `page_location`.
2. **The site's main analytics record, event `download`** (saved in the same analytics store as regular PDF downloads)
   - `publication_id`: empty (these signs have no publication record)
   - `publication_title`: "Sukkos Decoration — Trust in Hashem (8.5 × 11)" or "… (11 × 17)"
   - `publication_series`: "Sukkos Decoration — Trust in Hashem", `parsha`: "Sukkos"
   - `metadata.action_id`: a unique ID for each click
3. **Legacy download log** (the older `download_events` list, plus the `download_attribution` list): saved with an empty publication ID and the size-specific title above.

**Not recorded:** a "file was sent" (`download_served`) record. Only the `/view/…/download` path writes that, and the sign files are served directly.

## Same analytics store as regular PDFs?

Yes, for signals 2 and 3. They use the same `download` event and the same legacy log as regular PDF downloads. The two sizes stay separate because their titles differ. Signal 1 goes only to Google Tag Manager or Google Analytics.

## Does the admin dashboard show a count for the signs?

Based on the code only (I have not checked the signed-in admin screens):
- **Publication funnel (main analytics):** likely yes. Rows are grouped by publication ID, or by title when there is no ID. That means each size should appear as its own row under its full title, but only after it has had downloads in the selected period.
- **Legacy download reports** (grouped by parsha and the download list): these match downloads to the publication list by ID. The signs have no ID, so they probably show up as "(untitled)" or unmatched rows, or not at all. There is no dedicated "Sukkah sign" count.
- **Google Analytics / GTM:** the `pdf_download` events with `file_id` can be counted there, outside the admin dashboard.

## Not verified

- I did not read actual saved rows. That data lives in a separate database I didn't query in this check.
- I did not look at the admin screens while signed in.

## Optional next step (only if you ask)

Add a small "Sukkah sign downloads (8.5 × 11 / 11 × 17)" count to the admin area, based on the two titles. This would be a separate, approved change.
