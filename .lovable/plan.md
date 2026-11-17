# Maintenance incident: findings and safe options (no changes made)

## What I checked (read-only, just now)
- torahforthetable.com and www point to 185.158.133.1, Lovable's hosting. The live homepage returned HTTP 200 from Lovable (deployment psr2.6c4a333c…) with no "Closed for Maintenance" text and no Vercel headers. www redirects to the main domain.
- So the custom domain is not served by Vercel right now. The Vercel deployment (repo LetsParty911/tabletop-torah-hub, commit 7ad094f) runs on its own Vercel address. Its "Invalid API key" maintenance screen only affects visitors who use that Vercel address.

## Why the Vercel copy is failing closed
- The server code reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. On Vercel, the URL was updated 2026-10-20 to point at Lovable Cloud, but the service key is still the old 2026-10-04 value, which most likely belongs to the external database. The backend rejects that mismatched key, and the code correctly fails closed.

## Can the agent fix the key for you?
No. Lovable Cloud's service role key can't be read by me or by you, so there is nothing to copy into Vercel. I also have no write access to Vercel settings. Even if a key could be read, pasting it into Vercel would hand full database access to a second host.

## Secure options
1. Recommended, no change needed: keep Lovable as the live host, as it is today. Turn off production on Vercel, or limit it to previews, so the broken copy isn't reachable. Do this in the Vercel dashboard. Leave DNS alone.
2. If Vercel must read maintenance: in a later, separately approved build step, give Vercel a key that can only read site_maintenance row 1. Two ways:
   - Use the publishable key, with a database rule that lets it read only that one row.
   - Use a small read-only check that Vercel calls with a shared secret.
   Either way, maintenance stays fail-closed and stays in Lovable Cloud. You would then save the publishable key or shared secret in Vercel's secure environment form and redeploy.
3. Not possible: putting the Lovable Cloud service role key into Vercel.

## Next step
Approving this plan only records these findings. Option 2 needs a separate approval for the build work.
