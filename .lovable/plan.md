# Post-publish verification: /r, /s, /j — all live (read-only)

## Live curl results (tested just now, redirects not followed)

| Path | Status | Location | cache-control | x-robots-tag |
|------|--------|----------|---------------|--------------|
| /r | 302 | https://torahforthetable.com/?utm_source=ourkehilla&utm_medium=email&utm_campaign=poster_oct2026 | no-store | noindex |
| /s | 302 | https://torahforthetable.com/?utm_source=shul&utm_medium=poster&utm_campaign=evergreen_poster_oct2026 | no-store | noindex |
| /j | 302 | https://torahforthetable.com/?utm_source=workplace&utm_medium=poster&utm_campaign=evergreen_poster_oct2026 | no-store | noindex |

All three match the approved targets exactly. Deployment 7c06e67e is no longer pending — the short links are serving on the live domain.

## Staged visitor-alert fix

Remains undeployed. The SQL migration, Edge Function source, and rollout steps in `docs/visitor-alert-fix/` were shipped as inert files only — nothing in the live app, database triggers, or the `visitor-alert` Edge Function was changed. Rollout still requires the manual steps in the README with your separate approval.

## Actions taken

None. Read-only verification; no code, config, database, or deployment changes.
