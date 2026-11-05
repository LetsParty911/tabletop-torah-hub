# Hidden Gems of the Parsha

Add only the approved Chayei Sarah edition, preserving the existing homepage cards, PDF tracking and all site gates. Nothing will be published automatically.

- Insert a compact parchment/navy/gold teaser directly after the homepage original cards and before “More from this collection,” with the Hebrew gematria motif and one **Read & Print** link.
- Show it only for the active, displayed Chayei Sarah week—not fallback collections, Yom Tov, or stale reading dates.
- Add `/hidden-gems` as the archive and `/hidden-gems/the-400-shekel-secret` as a reader page. Keep the verified source text, attribution, and separately labeled site reflection; add a footer archive link.
- Provide browser printing with scoped US Letter print styling, aiming for one page without affecting printing elsewhere.

## Technical details
- Store intentional editions in a small typed, browser-safe module keyed by normalized parsha; no database or server-function changes.
- Use TanStack file routes, existing Button and design tokens, isolated RTL Hebrew, and real HTML rather than generated artwork.
- Test current-week matching, subsequent weeks, fallback/Yom Tov/stale exclusion and archive retention. Verify desktop/mobile navigation and print output; inspect the automatic build result.