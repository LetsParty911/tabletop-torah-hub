# October 22, 2026 availability investigation

Investigation date: October 22, 2026. All times below are Eastern Daylight Time unless UTC is explicit. Read-only production investigation; the proposed source change is unmerged and unpublished.

## Conclusion and confidence

**Confirmed:** the external Supabase project's REST API experienced substantial failures that afternoon. Its edge logs contain 503/522 responses for settings, PDFs, subscribers, publications and VPN settings. PostgREST logs also contain repeated timeout-manager errors. This is stronger evidence than an external retrieval timeout.

**Most likely explanation (inference):** a shared backend/API connectivity failure contributed to the public-site and authenticated-admin failures, amplified by synchronous request dependencies. Both surfaces read this backend. The evidence does not establish the infrastructure fault underneath those timeouts, nor correlate the owner's exact failed requests. Do not claim a permanent hosting outage, a specific provider-wide incident, or a deployment regression.

**Current state:** the homepage and admin sign-in rendered in a fresh cloud browser. Three direct HTTP rounds at approximately 7:29, 7:31 and 7:34 PM returned 200 for /, /admin and /parsha/noach. These are point checks, not a sustained-uptime guarantee. No authenticated admin session was available; the dashboard after sign-in was not verified.

## Evidence and sources

1. Supabase connector: external project torah-by-the-table (kwdeyzumetmjcvtbqnzl), read-only unified edge-log query over 14:00–23:30 UTC October 22:
   - /rest/v1/settings: 977 HTTP 503 responses from 3:47:06 to 4:48:40 PM; 123 HTTP 522 responses from 3:46:59 to 5:18:39 PM.
   - /rest/v1/pdfs: 325 HTTP 503 and 110 HTTP 522 responses.
   - /rest/v1/subscribers: 403 HTTP 503 and 54 HTTP 522 responses.
   - /rest/v1/vpn_block_settings: 416 HTTP 503 and 62 HTTP 522 responses; nine HTTP 504 responses from 3:35:18 to 3:46:58 PM.
   - /rest/v1/publications: 72 HTTP 503 and seven HTTP 522 responses.
   These counts are backend requests, not visitors or separate outages.
2. Supabase PostgREST logs, 19:00–21:30 UTC: 1,291 entries with the exact message “Warp server error: Thread killed by timeout manager”, plus combined-message variants. This identifies API-service timeouts, not their underlying cause.
3. Lovable Cloud, read-only SQL:
   - site_maintenance id=1: enabled=false, updated_at=2026-10-10 23:38:24.692+00.
   - No maintenance_visits rows dated October 22 UTC. Absence of rows does not exclude a failed maintenance lookup or logging failure.
   - vpn_audit_failures: 119 entries from 3:49:39 to 4:48:59 PM, containing upstream connection timeouts/522 errors. Both allowed and blocked decisions occur; these are failed audit writes, not proof of incorrect access decisions.
   - blocked_visits: 54 entries dated October 22 UTC; grouped results identify Ashburn and Council Bluffs rules, with no admin paths in those results. These are real access restrictions but cannot be attributed to the owner from the available evidence.
4. Supabase SELECT on vpn_block_settings id=1: mode=block at inspection.
5. Direct HTTPS checks:
   - /, /admin, /parsha/noach: 200, no X-TFTT-Gate header; same deployment UUID bfa1f992-9c16-4bdf-918c-b1f8e8472bbd.
   - www homepage redirects to apex and returns 200.
   - Apex homepage Cache-Control: private, no-store, max-age=0.
   - /admin HTML: public, max-age=0, must-revalidate, s-maxage=0. This does not verify signed-in response behavior.
6. DNS-over-HTTPS:
   - Google and Cloudflare resolvers agree on apex A=185.158.133.1.
   - Google returns www A=185.158.133.1, no apex AAAA, and dns1/dns2.registrar-servers.com nameservers.
   - Local OS DNS resolution in the execution environment failed; HTTPS and independent DNS-over-HTTPS succeeded through its network path. The local failure is not evidence of production DNS failure.
7. Lovable project metadata: Torah Table Connect is published and ready; latest source SHA is 5e2bf8e1c38788313985fb44eeb2c02533c7c126. Its current metadata does not establish the exact source SHA of the live deployment.
8. Repository sources at that SHA:
   - .lovable/plan.md records the earlier 3:42 PM homepage/Noach checks only.
   - .lovable/plan/diagnosis-torahforthetable-com-is-served-by-lovable-hosting-2026-10-08.md is historical hosting evidence. Current DNS, deployment headers and published Lovable metadata remain consistent with that arrangement; no DNS migration to Vercel is indicated.
   - wrangler.jsonc and vite.config.ts configure the Cloudflare/TanStack app. vercel.json has .org redirects; its existence does not establish Vercel as the live .com host.

## How the failures can share a dependency

src/start.ts runs the country gate first, followed by redirects, VPN, geo and maintenance-traffic/cache middleware. Country denial has no admin exemption. Geo/city/exact-IP rules exempt admin paths. VPN path eligibility also exempts admin, API and server-function requests, but it is currently evaluated AFTER getVpnBlockMode reads the external backend. Thus an exempt admin request can wait for the same unavailable backend as the public homepage.

The homepage loader and authenticated admin data calls also read settings/PDFs/subscribers from that external project. Those are the endpoints with recorded 503/522 errors. The admin refresh uses Promise.all, so one failed required call can prevent the refreshed data set from being applied.

Maintenance state lives in the separate Lovable Cloud database. Public paths fail closed when its setting cannot be read and no prior value is known. RootShell exempts admin from the maintenance screen, but the root loader still awaits the maintenance lookup on admin routes. A hung lookup is an additional shared vulnerability; no direct evidence establishes it as this incident's cause. Do not change the stored setting or its fail-closed policy as an outage workaround.

The service worker uses network-first navigation with an offline fallback. A fresh browser rendered both homepage and admin sign-in, but this does not exclude a problem in the owner's existing browser/session.

## Proposed limited correction

Move the EXISTING method/path eligibility check to the beginning of checkVpnBlock, before trusted-cookie verification and the external VPN-settings read.

This removes an unnecessary backend dependency for requests that this VPN gate already excludes. It does not broaden exemptions, change VPN mode/failure policy, bypass authentication, alter the first country gate, modify geo/IP rules, change maintenance/Shabbos behavior, or touch publication/analytics records.

This is a resilience improvement, not a repair of the Supabase service. Authenticated admin data and public publication data still require a working backend. No timeout/fail-open workaround is introduced for protected public requests.

## Validation

- New regression test fails against the original implementation: seven exempt requests still consult the unavailable settings backend.
- With the patch: trusted VPN suites, 23 tests passed.
- Country gate suites: 83 tests passed.
- Existing VPN/secondary-provider, geo and maintenance suites: 37 tests passed using an isolated temporary Vitest config (no framework RPC transformation).
- Total: 143 tests passed; git diff --check passed.
- No full production build or authenticated dashboard end-to-end test was performed.

## Safe next steps

Review the limited patch; do not merge or publish without the owner's approval. If approved, merge and explicitly publish on the actual Lovable production host, then verify public pages, signed-in admin and restrictive gate behavior.

If failures recur, capture the exact time, URL, response status, X-TFTT-Gate and deployment ID, then correlate the backend request logs. If backend 5xx recur, escalate the dated API failure evidence to Supabase support; do not change DNS or disable restrictions. Do not replay analytics or assume failed audit events were recovered.

No production settings, DNS, deployments, security rules, analytics, publications or maintenance state were changed during this investigation.

