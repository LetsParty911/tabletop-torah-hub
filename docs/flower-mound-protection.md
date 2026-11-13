# Flower Mound protection preview

Scope: a Vercel Routing Middleware gate in front of the existing application,
including cached/static resources. No Lovable agent, public audience change,
production deployment, DNS change, or domain assignment is required for a preview.

Policy: `flower-mound-tx-v1` denies only Vercel connection geolocation matching
Flower Mound + TX/Texas + US. Vercel's RFC3986-encoded city is decoded safely.
Unknown, incomplete, or malformed location is allowed. No geographic range,
nearby city, IP prefix, browser location, external lookup, database, or cookie
is consulted. All request methods and paths pass through the gate.

Denial returns HTTP 403 before calling `next()`. It has no site content or
scripts and is marked private/no-store at browser and CDN levels. HEAD has no
body. API responses are JSON, and PDF/static requests receive a plain denial
rather than a misleading PDF or successful response.

The existing application security gates remain independent and unchanged.
This additional gate does not exempt internal devices or VPN capabilities.
The private website preview serves GET/HEAD content from the fixed public
origin after the gate, so it needs no production-only application credentials.
Preview writes return 405, and browser cookies/authorization are not forwarded.
After this gate allows a PDF/viewer request, the private preview redirects the
browser to the canonical public PDF/viewer route. This preserves the browser's
real IP for the existing public application gates instead of identifying the
proxy egress as the reader. A denied preview request never receives that URL.
The public origin itself is unchanged and remains separately reachable until
a production release is approved. In production no preview redirects apply.
Production uses `next()` into the normal application. The early `/k` static
redirect is removed from the branch configuration: its existing Start handler
retains the same destination after the new geographic gate has run.
Public files hosted directly by another service remain outside this boundary;
protecting those requires separate storage access changes. Already downloaded
or offline-cached content cannot be recalled. IP location is approximate and
may differ from analytics providers or be changed by a VPN.

## Safe verification

Open `/__protection` on the sign-in-protected preview. Run all checks there.
Only Vercel's server-side `VERCEL_ENV=preview` enables the verification namespace.
It returns 404 in production and development. These routes never call the
application, fetch external content, set cookies, or write analytics.
Fixtures affect only their isolated response and cannot allow a real page.
Normal requests ignore all test query parameters, cookies, and custom hints.

The checks cover blocked homepage/page/PDF/asset/API/HEAD paths plus Lewisville,
Passaic, another state, another country, and missing location. The blocked
fixture uses exactly the same evaluator and 403 response as the real gate;
the allowed fixture returns only `SAFE_TEST_CONTENT`. `/__protection/status`
reports the current connection's platform location without storing it.

Run regression tests with `node --test protection/flower-mound.test.mjs`.
They also check that the actual middleware returns a denial without `next()`,
that allowed requests continue, and that the diagnostic routes cannot be used
in production.

## Release boundary and rollback

Deploy this branch to Vercel Preview only. Keep existing SSO protection enabled.
Do not promote or assign production domains without the owner's approval.
Use the clean deployment URL for handoff, with no authentication bypass secret.
If a production release is later approved, deploy reviewed source as a staged
production deployment, verify its production-disabled diagnostics, and obtain
approval before assigning live domains. Roll back to the preceding production
deployment if legitimate requests are incorrectly denied. No geo-wide live
test or global switch is needed.

Primary platform references (checked November 12, 2026):

- https://vercel.com/docs/routing-middleware (middleware executes before cache)
- https://vercel.com/docs/headers/request-headers (connection city, country, region)
- https://vercel.com/docs/routing-middleware/js-reference (next and response handling)
