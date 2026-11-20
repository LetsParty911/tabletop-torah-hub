# Vayetzei 5787 PDF replacement — feasibility (read-only, no changes)

## Answers
- Private Google Drive link (agent not signed in): No. The agent can only read Drive files through a Google Drive connection linked by the owner. Without one, the link opens a sign-in page. Options: share each file as "Anyone with the link", or connect Google Drive in workspace connector settings.
- ChatGPT sandbox URLs (sandbox:/mnt/data/...): No. They only exist inside ChatGPT and cannot be reached from outside.
- Storage: Yes, Supabase. The external catalog's `pdfs` table and `pdfs` bucket; covers go in the `pdf-thumbs` bucket as `<row id>.png`, plus small WebP versions.
- Replacing an existing row (admin "Replace file"): uploads a new file, updates only `file_path`, deletes the old file and clears the PDF cache. Row ID, title, description, `summary_quick` and analytics stay the same.
  - Thumbnails: not regenerated automatically. Use the admin thumbnail action afterwards, which overwrites `<id>.png`.
  - Summaries/descriptions: not updated. They need a separate edit, ideally written after reading the new PDF.

## If approved later (separate request)
Owner provides public Drive links or a linked Drive connection, plus the four row IDs. Then: download, check, replace each file, regenerate covers, review descriptions, and read everything back from the catalog to confirm. No publishing is needed because the site reads from the catalog.
