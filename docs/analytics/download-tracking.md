# PDF action tracking (2026-11-26 repair)

- Read Now / thumbnail: client `publication_click` (metadata.action=open_pdf, action_id) + server `pdf_route_result` keyed `pdf-outcome-<action_id>`.
- Download PDF (reader page only): client `download` (metadata.action_id) + server `download_served` keyed `served-<action_id>`, with parsha/jewish_year/title read from the validated `pdfs` row, never from the query string.
- Both server routes accept correlation only via `readCorrelation`: UUID action id and `v` equal to the `tftt_vid` cookie. Delivery never waits on analytics (Worker waitUntil).
- Audience bundles: client `bundle_download` only after a successful merged download; reported per bundle_key.
- Root cause fixed: the `download` event omitted metadata.action_id, so it never paired with `download_served`; reports counted both rows (about 2x) and the matching health check saw zero actions. The reader also passed the edition year only as an accessible label, so jewish_year was null.
- Saving/printing a file is never observable; a served row means a redirect was issued.
- Internal (signed marker) browsers are dropped at ingest and on both routes.
