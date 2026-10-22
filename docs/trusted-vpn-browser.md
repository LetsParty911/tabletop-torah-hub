# Trusted VPN browser — unpublished review

## Scope

- Independent host-only `tftt_trusted_vpn` cookie; existing `tftt_internal` is untouched.
- HMAC-SHA256, Web Crypto signature verification, random 256-bit per-enrollment nonce, signed issuance/expiry, 90-day lifetime.
- HttpOnly, SameSite=Lax, Path=/, Secure for HTTPS. No IP, UA, account identity, device name, or localStorage in the capability.
- `TRUSTED_VPN_BROWSER_SECRET` generated securely in Project Settings; never exposed. Read at request time from authoritative request Worker env, native workerd env, or Node/Vercel process env. A missing authoritative Worker secret never falls back to a stale Node value.
- `/api/trusted-vpn-browser`: verified existing admin token for GET status and POST enable/revoke; POST requires exact same-origin and JSON, rejects cross-site fetch metadata. Responses are no-store. No database writes.
- Valid cookie exits only `checkVpnBlock`, before mode/provider/audit/notification work. Existing internal behavior, VPN modes and Brooklyn exception remain unchanged for everyone else. Geo/IP, closure, maintenance, analytics, and PDF authorization are not changed.
- Admin → Security → VPN Connection Tracking → Trusted VPN browser. Enrollment is for the calling browser profile, not a physical device registered remotely.
- Revoke deletes this browser's cookie. This intentionally stateless capability has no server-side revocation ledger: a stolen/copied token can be replayed until expiry; rotate the dedicated secret to invalidate all outstanding tokens. Cookie clearing or another profile needs fresh admin enrollment.
- Existing internal markers, if already enabled by the owner, still independently exclude analytics; enabling trusted VPN browsing neither sets nor removes them.

## QA

- `bunx vitest run --config vitest.trusted-vpn.config.ts`: 22 passed; token/auth/CSRF/runtime/cookie/gate regressions.
- `bunx vitest run src/lib/vpn-block.test.ts src/lib/secondary-vpn.test.ts src/lib/geo-block-rules.test.ts src/lib/geo-block-page.test.ts src/lib/geo-block-memo.test.ts src/lib/maintenance-traffic.test.ts`: 39 passed.
- `bunx vitest run --config vitest.signup.config.ts`: 24 passed.
- `bunx vitest run --config vitest.weekly.config.ts`: 33 passed.
- `bun test src/lib/hebcal.test.ts src/lib/sukkah-sign-downloads.test.ts`: 12 passed.
- `bunx vitest run`: 389 passed, 26 failed across 8 files. Default framework configuration transforms isolated handlers and lacks the intended signup DOM setup; Bun-native tests also cannot run here. Dedicated configurations above pass.
- `bunx vitest run --config /tmp/trusted-vpn-regression.config.mjs`: 380 passed, 2 failed across 47 files before final two extra regressions. Plain Node config with @ alias, src/lib/**/*.test.ts, excluding the two Bun-native files. Remaining failures are the pre-existing `noahide_footer_click` meaningful-intent mismatches in notifications-core and visitor-alert-two-stage; intentionally not changed.
- Harness compilation reports build OK. Manual builds/typechecks are prohibited by the project environment; no separate typecheck command was run.
- Real authenticated localhost admin flow: enabled, authenticated status read back true, verified HttpOnly/Lax cookie and absence of internal marker; revoked, cookie removed, fresh reload remained disabled. Viewed desktop/mobile screenshots: no horizontal overflow or page errors. Analytics submissions intercepted; no notification, settings, PDF action or subscription test.
- HTTPS attributes tested deterministically; physical mobile, published Worker secret availability, and actual VPN-origin access require owner verification after release.

## Files

New: `src/lib/trusted-vpn-browser.server.ts`, `src/lib/trusted-vpn-control.server.ts`, `src/routes/api/trusted-vpn-browser.ts`, `src/components/admin/TrustedVpnBrowserControl.tsx`, three `src/lib/trusted-vpn-*.test.ts` files, `vitest.trusted-vpn.config.ts`, this review document.

Modified: `src/lib/vpn-block.server.ts` (one import, VPN-only early exit), `src/components/admin/VpnTrackingSection.tsx` (one import/control), `AGENTS.md`, `roadmap.md`, project preference memory. Route tree regenerated automatically. No production publish or deployment.