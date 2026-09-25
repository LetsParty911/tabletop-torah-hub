# Mobile-first homepage chooser

## Goal
Make the homepage immediately useful to a new phone visitor while preserving the existing desktop presentation, current Sukkos collection, filters, analytics, downloads, newsletter flow, and visual identity.

## Changes
- Give the mobile introduction the exact heading and supporting line requested, while retaining the current desktop Sukkos heading and collection context.
- Surface one compact mobile quick-choice area directly after the introduction, before newsletter signup:
  - Quick Vorts → existing `quick` chooser
  - Family Table → existing `family` chooser
  - Children → existing `kids` chooser
  - Stories → existing `story` chooser
- Keep the current chooser scoring, recommendations, empty states, and `chooser_select` / `recommendation_click` tracking. Do not create a second filtering system.
- Add “Not sure what to choose? Start here.” using a currently loaded, published Sukkos resource. Prefer the active “Short Vorts for Sukkos” title; otherwise use the strongest existing quick recommendation. Link through the existing `/view/:id` route and preserve recommendation tracking.
- Keep the compact newsletter prompt after visitors have seen the quick choices, and keep the full email form lower on the page.
- Tighten mobile-only vertical spacing where needed. Leave desktop spacing and layout unchanged.
- Do not add My Table, poster content, imagery, schema changes, or tracking changes.

## Technical details
- Refine the existing `TableChooser` to support a compact mobile presentation and requested labels while sharing the same chooser state and recommendation functions.
- Keep one chooser instance to avoid duplicated state, IDs, or analytics events.
- Derive the recommendation target from the homepage’s refreshed resource list rather than hardcoding an ID or URL.
- Use responsive visibility/classes so desktop retains its current chooser treatment.

## Verification
- Check small mobile widths first, then desktop, for wrapping, spacing, and non-overlapping controls.
- Exercise all four quick choices and the recommendation link.
- Confirm newsletter placement, filters, downloads, and no poster/My Table references.
- Run relevant tests, type checking, and confirm the preview build is clean.

## Assumption
“Short Vorts for Sukkos” may vary slightly in stored title; title matching will be tolerant and will fall back to the existing quick-choice ranking if it is not active.
