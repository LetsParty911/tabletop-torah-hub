# Publish the reordered homepage to the live site

## Goal
Publish the current project so the live homepage reflects the reordered weekly section, available at the real public URL.

## Current state
- The homepage reorder has already been implemented and verified.
- Security scans show no unresolved critical findings.
- The project already has a published URL and connected custom domains.

## Plan

```text
1. Re-run security scan only if any scan is stale AND required by publish gate.
2. Call preview_ui--publish to deploy the current build.
3. Report the live URL(s):
   - Lovable URL: https://tabletop-torah-hub.lovable.app
   - Custom domains: https://torahforthetable.com (apex) and
     https://www.torahforthetable.com, with .org variants redirecting to .com.
4. Confirm the published homepage shows the reordered weekly section.
```

## Notes
- Custom domains are already connected; publishing updates the deployment they all serve.
- No code changes are required for this task.
