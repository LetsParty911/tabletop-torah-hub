# Fix: admin sign-in crashes with "Something went wrong"

## What's actually broken

The admin page is not a login problem — the page crashes before the sign-in button can work.

Confirmed by inspecting the live site's published JavaScript at torahforthetable.com/admin: the backend URL and public key that the browser needs are **not baked into the published bundle**. The only thing in there is the error message itself. So the moment the admin page (or the app's session check) touches the backend client, it throws:

`Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY`

which the app's error boundary renders as "Something went wrong". The same error is also showing in the preview.

Public pages mostly keep working because they fetch through server functions, which read their own server-side values — only the pages that need a browser session (admin, sign-in) die.

## Plan

1. Re-bind the project's backend environment so the browser-visible values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) are present in the build environment again.
2. Restart the dev server and confirm the preview no longer throws the missing-variable error.
3. Load `/admin` in a real browser against the preview and confirm the page renders the "Admin Sign-in" screen instead of the error boundary.
4. Republish so production picks up a build that actually contains the values, then re-check the published bundle for the backend URL and confirm `torahforthetable.com/admin` renders the sign-in screen.
5. If the values still fail to inline after re-binding, investigate the build-time env injection (the shared Lovable Vite config handles `VITE_*` injection) rather than editing the auto-generated backend client, which must not be modified.

## Notes

- No application code changes are expected; this is an environment/binding + republish fix.
- The admin allow-list (`ADMIN_EMAILS`) and Google sign-in flow are untouched — once the page loads, the existing sign-in path should work as before.
- If, after the page loads, Google sign-in itself errors, that's a separate follow-up (provider config) and I'll report it rather than silently changing auth behavior.
