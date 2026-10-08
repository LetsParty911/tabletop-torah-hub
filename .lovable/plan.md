# Diagnosis: torahforthetable.com is served by Lovable hosting, not Vercel

## Root cause (verified)

The public domain does not point at Vercel. Vercel's "alias torahforthetable.com" sets up a hostname on Vercel's side, but no visitor traffic reaches it.

Evidence collected on Oct 8, 2026, using read-only checks only:

- DNS: `torahforthetable.com`, `www.torahforthetable.com` and `torahforthetable.org` all resolve to **185.158.133.1**, which is Lovable's hosting IP. Nameservers are `dns1/dns2.registrar-servers.com` (Namecheap DNS). TXT record `_lovable.torahforthetable.com` contains a `lovable_verify=` value.
- Lovable domain settings: all four domains are **Active** and connected to this Lovable project, with `torahforthetable.com` set as Primary. The project is published.
- Response headers from the apex: `server: cloudflare` and `x-deployment-id: psr2.cdd7b1e1-...`. That deployment-id format belongs to Lovable's edge, which runs on Cloudflare's network. The headers contain no `x-vercel-*` values. So Cloudflare here is Lovable's own edge, not a separate proxy you control.
- `torahforthetable.lovable.app` returns a 302 redirect to `torahforthetable.com`, which matches the Lovable Primary setting.
- The live HTML uses `styles-BTBPN_MT.css` and contains 19 "Download PDF" labels, 19 "Print PDF" labels and 0 "Open PDF" labels.
- The project's current source code (synced from GitHub main) contains **no** "Download PDF" or "Print PDF" labels. `DownloadToPrintButton` renders only "Open PDF".

**Conclusion:** the live site is serving the **last Lovable publish**, which predates PR #10 and PR #11. GitHub main was synced into this Lovable project, but code changes only go live after a Lovable publish/update. No browser or service-worker cache is involved, which is why Incognito and `?sw=off` show the same result. Vercel is a parallel deployment that nobody visits.

## The /view 503

- From this sandbox (Stockholm), `/view/6d30cd1b-...` returns **HTTP 200**.
- Your 503 page's text, "Temporarily unavailable", matches the city-block page in `src/lib/geo-block.server.ts` (header `X-TFTT-Gate: geo-block`). It does not match maintenance mode, which returns plain "Closed for Maintenance".
- The homepage can return 200 while `/view/...` returns 503 because `shouldCheck()` always checks `/view/*`. For other pages, it only checks requests whose `Accept` header includes `text/html`. A script or curl that doesn't send `Accept: text/html` gets past the homepage check but gets caught on `/view`.
- The earlier logs showed this owner's connection placed in Irvington, NJ, which is on the blocked list. Your retrieval tool or connection was most likely geolocated to a blocked city (for example Ashburn, VA, a common datacenter location).
- Not yet verified: the matching `blocked_visits` row. Step 1 below checks it.

## Fix steps

1. **Read-only confirmation (me, after approval):** look in `blocked_visits` for a row with path `/view/6d30cd1b-...` around the time you tested, to confirm the 503 came from the city block.
2. **Choose one host (owner decision):**
   - **Option A, keep Lovable (simplest):** publish/update from Lovable. This deploys the current GitHub-synced code (Open PDF). Responsible platform: Lovable. Permission needed: Lovable project editor. You don't need to change DNS.
   - **Option B, move to Vercel:** at Namecheap, change the A/CNAME records to Vercel's values, then remove the domains in Lovable Project Settings → Domains. Responsible platforms: the DNS registrar (Namecheap) and Lovable. Permissions needed: a Namecheap account login plus Lovable owner access. Be careful: the city block, maintenance gate and server functions also need the Supabase server secrets on Vercel.
3. **The 503:** this is expected behavior from the city block, not a deployment fault. If it's unwanted, remove the specific city or set `GEO_BLOCKING_ENABLED` to false. That needs separate approval.

## Production validation plan (after the fix)

- `dig +short A torahforthetable.com` should return the chosen host (185.158.133.1 for Lovable, or Vercel's IP).
- `curl -sD- https://torahforthetable.com/?v=check` should show a new `styles-*.css` hash and a new `x-deployment-id` (Lovable) or `x-vercel-id` (Vercel).
- Count labels in that HTML: "Open PDF" should be at least 1, and "Download PDF" and "Print PDF" should both be 0. Repeat on `/archive` and one `/publication/...` page.
- `curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/pdf' https://torahforthetable.com/view/6d30cd1b-.../pdf` should return 200 with `content-type: application/pdf`. Clicking Open PDF in a browser should open the file in a new tab.
- 503 check: request `/view/6d30cd1b-...` from a non-blocked network and expect 200. If 503 appears, read the `X-TFTT-Gate` header (`geo-block` or `maintenance`) and the newest `blocked_visits` row.

## What I could and couldn't verify

- **Verified:** DNS records, nameservers, the Lovable domain status and Primary setting, live response headers, the live stylesheet hash and button labels, the current source labels, and the 200 response for /view from Stockholm.
- **Not verified:** the Vercel deployment itself (I have no Vercel access), your exact 503 response headers, and the `blocked_visits` row (step 1).
