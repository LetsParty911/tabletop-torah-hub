# Assessment: /r, /s, /j are unpublished — release path

## Verified findings (read-only)

- **Live test (just run):** `torahforthetable.com/r`, `/s`, `/j` all return **HTTP 404**. None of the three short links is live.
- **Git history:** the short-link routes were committed after the last publish (`939ff80 Added /s and /j QR routes`, plus the `/r` commit before it). Later commits (`b2cafec Staged visitor alerts patch`, `4b793fb Revised alert fix docs`) contain the staged visitor-alert work. All are committed but unpublished.
- **Staged alert fix is inert at runtime:** `src/lib/visitor-alert-classifier.ts` is imported **only by its own test file** — no route, component, or server function references it. The `docs/visitor-alert-fix/` SQL and Edge Function source are documentation files; nothing executes them. Publishing would ship them as dead code with **zero effect** on the live alert system (old trigger + old Edge Function keep running untouched).

## Deployment limitation

Lovable publishes the **entire current commit** — there is no way to deploy only the short links while holding back the staged alert files. The only alternative would be git surgery (reverting the alert commits, publishing, then re-applying), which adds risk and churn for no benefit, since the staged files change no live behavior.

## Shortest safe release path

1. **Publish the current commit as-is.** This ships `/r`, `/s`, `/j` (and nothing else visitor-facing — the staged alert fix is inert dead code, the live Pushover system is untouched).
2. **Verify after publish:** `curl` each of `/r`, `/s`, `/j` expecting 302 with the exact approved target URLs, `Cache-Control: no-store`, `X-Robots-Tag: noindex`; confirm none appears in the sitemap.
3. The staged visitor-alert fix remains undeployed in the meaningful sense: its SQL migration and Edge Function still require the manual rollout steps in `docs/visitor-alert-fix/README.md`, each needing your separate approval.

## What this plan does NOT do

- No code edits, no database changes, no Pushover calls, no alert-system changes.
- Publishing itself still requires your explicit go-ahead; this plan is the assessment and recommendation only.
