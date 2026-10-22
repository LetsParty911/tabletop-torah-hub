# Country deny — unpublished review

## Policy and implementation

Only `IN`, `PK`, `BD`, `VN`, `CN` are denied. `TW`, `HK`, `MO`, `US`, `GB` and every unlisted or unknown/invalid code pass this gate. Exact uppercase membership only; no Vercel header, body, query, UA, IP lookup, cookie or identity override. HTTP header parsing itself strips surrounding whitespace before application code sees values.

`countryGate` is first in `src/start.ts`, before the .org redirect, VPN, city/IP, maintenance traffic and cache middleware. All methods and all paths **that reach TanStack Start** are checked, including admin, API, server functions, PDF routes and missing routes. A valid internal/trusted-VPN cookie or authenticated admin cannot bypass it. Allowed requests continue unchanged through existing gates. No database writes, logging, analytics, notifications or external requests are introduced.

Denied responses are generic 403, private/no-store (including CDN cache headers), nosniff and noindex. HTML receives a script-free accessible document; API/server functions receive JSON; PDF paths receive plain text, never an imitation PDF. HEAD has no body.

## Hosting and trust evidence / limitations

- Public system DNS resolved `torahforthetable.com` to `185.158.133.1` on October 22, 2026. Credential-free HEAD checks of the custom domain and Lovable subdomain both returned 403 from this environment; this does not identify which existing gate denied access. No fake country headers were sent to production, no protections bypassed, no deployment performed.
- `src/lib/request-telemetry.server.ts` documents a September 22 production inspection: workerd receives router subrequests with `cf-ipcountry`; `request.cf` is undefined; `request.runtime.cloudflare` contains env/context, not original geo. This gate deliberately does not reuse that helper's `x-vercel-ip-country` precedence, preserving existing telemetry behavior.
- Cloudflare documents `CF-IPCountry` as an edge country header: https://developers.cloudflare.com/fundamentals/reference/http-headers/ and https://developers.cloudflare.com/network/ip-geolocation/ . **This is not independent proof that Lovable's router strips/overwrites visitor-supplied headers. Current router sanitization/provenance could not be independently ascertained through available read-only tooling.** The implementation relies on the documented hosting contract, not a cryptographic header attestation. If that contract is violated, this gate cannot authenticate a forged `cf-ipcountry`; no additional spoofable override was added.
- The public Lovable OpenAPI (`https://api.lovable.dev/v1/openapi.json`) has no WAF/firewall/ruleset endpoint. No accessible control for this Lovable-owned hosting zone was established. Cloudflare's Rulesets API is real for zone owners, but a user's unrelated zone is not the Lovable hosting zone. **No upstream WAF was configured or claimed.**

## Coverage boundaries — not a complete edge block

Installed `@tanstack/start-server-core/src/createStartHandler.ts` dispatches router and server-function requests through request middleware. Local HTTP checks confirmed 403 for GET `/`, HEAD `/admin`, GET `/api/trusted-vpn-browser`, POST `/_serverFn/invalid`, GET `/view/example/pdf`, a missing route, a missing asset and `/robots.txt`.

However, a **real local static file** HEAD `/sw.js` with the locally simulated denied country returned **200 JavaScript**, demonstrating static delivery ahead of Start. The missing asset's 403 is not evidence of protection for existing assets. Existing files under `public/`, built assets, hosting/CDN responses before middleware, and previously cached browser/service-worker content are **not guaranteed blocked**. Live hosting's exact asset/cache interception rules were not available. No-store prevents retention of this gate's denials; it cannot purge or intercept an existing upstream cache entry. Other app HTML policy remains unchanged (homepage no-store; other HTML revalidation with zero shared cache TTL).

The `/view/*` PDF routes are intercepted when they reach Start, but they redirect to public storage objects. Existing public storage/object URLs remain directly accessible outside the app's middleware. Making storage private or changing PDF delivery would be separate work and was not done. This feature therefore cannot honestly be described as a full-site pre-cache WAF or a country restriction on public PDF bytes.

## Optional upstream action — separate zone-owner deployment

Copy-ready Cloudflare WAF custom rule expression, action **Block**:

```text
(ip.src.country in {"IN" "PK" "BD" "VN" "CN"})
```

Reference: https://developers.cloudflare.com/waf/custom-rules/use-cases/block-traffic-from-specific-countries/

Requires access to the actual serving Cloudflare zone and Zone WAF Edit permission; for Lovable-owned routing this requires the hosting zone owner's control. No DNS change is proposed. This is an optional separate upstream action, not performed here, and it would not govern another provider's public storage URLs.

## QA (October 22, 2026)

- `bunx vitest run --config vitest.country.config.ts`: **2 files / 83 tests passed** (37 policy/response tests; 46 actual Start-registration chain tests). Tests mock framework registration, not production CDN routing; local HTTP checks above additionally exercised the real dev dispatcher.
- `bunx vitest run --config vitest.trusted-vpn.config.ts`: **3 files / 22 passed**.
- `bunx vitest run src/lib/vpn-block.test.ts src/lib/geo-block-rules.test.ts src/lib/geo-block-page.test.ts src/lib/geo-block-memo.test.ts`: **4 files / 25 passed**.
- `bunx vitest run --config vitest.weekly.config.ts`: **4 files / 33 passed**.
- `bunx vitest run --config vitest.signup.config.ts`: **4 files / 24 passed**; mocked submissions only, no real subscribers.
- `bunx vitest run`: **49 files passed / 8 failed; 474 tests passed / 26 failed**. Unrelated existing configuration failures: Bun-only tests in Vitest, router mock/RPC transformation and DOM environment incompatibility in default config; weekly/signup suites pass in their supported configs. Two existing notification meaningful-intent list mismatches (`noahide_footer_click`) also remain. No unrelated repairs made.
- Preview harness compilation: `/tmp/observability/build-errors.log` latest source build at **17:41:14 UTC: build OK**. No manual build/typecheck was run (project harness owns compilation); no separate TypeScript-only result is claimed.

## Files

Application: `src/start.ts`, `src/lib/country-block.server.ts`.
Tests: `src/lib/country-block.test.ts`, `src/lib/country-block-middleware.test.ts`, `vitest.country.config.ts`.
Documentation: `AGENTS.md`, `roadmap.md`, this file. Project memory records the owner's policy.

No source changes to VPN/city/IP rules, trusted-browser controls, maintenance, Shabbos/Yom Tov, publications, subscriptions, PDF access or analytics; no schema/data/settings/secret/DNS changes or publishing.