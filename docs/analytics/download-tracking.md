# PDF action tracking (2026-11-26 repair)

- Read Now / thumbnail: client `publication_click` (metadata.action=open_pdf, action_id) + server `pdf_route_result` keyed `pdf-outcome-<action_id>`.
- Download PDF (reader page only): client `download` (metadata.action_id) + server `download_served` keyed `served-<action_id>`, with parsha/jewish_year/title read from the validated `pdfs` row, never from the query string.
- Both server routes accept correlation only via `readCorrelation`: UUID action id and `v` equal to the `tftt_vid` cookie. Delivery never waits on analytics (Worker waitUntil).
- Audience bundles: client `bundle_download` means a visitor clicked the download link for a prepared PDF, not a successful save. It carries `action_id` and `preparation_id`; reported per bundle_key.
- `bundle_diagnostic`: separate client events for `prepare_started`, `prepare_ready`, `prepare_failed`, `open_fallback` and `reported_failure`; never count these as downloads. Preparation failures record a controlled code and, when available, constituent ID and HTTP status. No raw exception text, file URLs or new personal information are collected. A visitor report is self-reported, not a verified browser failure.
- Individual `download_route_failed`: correlated server 404/500 on the download route. The existing `download_served` success redirect is unchanged; intentional maintenance responses are not classified as failures.
- The ready bundle now has a direct Open & Print alternative and a report-problem control. Browser download-manager saves, blocked downloads with no report, and print completion remain unobservable. An attempt with no later ready/failure is unknown, not automatically a failure.
- Diagnostic queries use the existing analytics_events table and the existing bot/internal exclusion path. No schema migration is required.
- Root cause fixed: the `download` event omitted metadata.action_id, so it never paired with `download_served`; reports counted both rows (about 2x) and the matching health check saw zero actions. The reader also passed the edition year only as an accessible label, so jewish_year was null.
- Saving/printing a file is never observable; a served row means a redirect was issued.
- Internal (signed marker) browsers are dropped at ingest and on both routes.
