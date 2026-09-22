# Analytics Upgrade (current)

- [x] Repo migration file documenting the already-applied `is_internal` and `utm_content` columns.
- [x] Server-verified internal/test device marker (signed HttpOnly cookie, no new secret required).
- [x] Cross-tab session race hardening (navigator.locks / BroadcastChannel with fallback).
- [x] Reporting-only traffic confidence classification with explanations.
- [x] utm_content capture, campaign variant reporting, and the admin campaign link builder.
- [x] `download_served` canonical event correlated by action_id, CDN redirect preserved.
- [x] D1/D7/D30 cohorts plus 2+/4+ distinct-week loyalty with honest denominators.
- [x] Publication funnel (impressions → clicks → opens → actions → served) with new/returning, source, device.
- [x] Geo confidence wording in reporting.
- [x] Owner Summary tab.
- [x] Analytics Health panel.
- [x] Docs, privacy wording, and tests.
- [x] Typecheck, tests, production build.
- [x] Publish and verify live.

# Admin Analytics Redesign (done)

- [x] Canonical reporting model, Overview, Publications, Reach, Visitor Activity, Settings, tests.
