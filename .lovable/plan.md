# Performance audit (read-only), HEAD, Sep 30 2026

No project files were edited and nothing was published. The build wrote only to its normal output folder.

## Measured build (dist/client/assets, raw / gzip)

| File | Raw | Gzip | Loaded on homepage? |
|---|---|---|---|
| index-C_0v9bH8.js (main entry) | 678 KB | 201 KB | Yes, always |
| styles-BgqHwL2A.css | 115 KB | 18.5 KB | Yes, blocking |
| index-BMHRyKtd.js (homepage route) | 42 KB | 11.7 KB | Yes |
| pdf.worker.min.mjs | 1.26 MB | 374 KB | No (PDF viewer only) |
| admin-analytics.js | 503 KB | 136 KB | No (lazy route) |
| pdf.js (pdf-thumb) | 434 KB | 129 KB | No, not referenced by homepage chunks |
| admin.js / BlockedVisitsSection.js | 86 / 67 KB | 23 / 21 KB | No |

## Prioritized findings

1. **Main entry chunk is large (201 KB gzip).** All pages pay for it. Confirmed contents include the backend client with its auth module (`GoTrueClient` found in the chunk). It comes in through a static import in `src/routes/__root.tsx` (line 6) used only by `AuthRedirectHandler`, which calls `supabase.auth.getSession()` on every page load. Candidate fix: dynamically import the client inside that effect, and only when there is an auth callback or a saved redirect. Admin, PDF and analytics code is already split out correctly.
2. **CSS is one normal blocking stylesheet** (`{ rel: "stylesheet", href: appCss }` in `__root.tsx` head). At 18.5 KB gzip that is acceptable. It includes `tw-animate-css` (styles.css line 3). A small gain may come from checking whether the animations are used on public pages. Low priority.
3. **No parser-blocking scripts in head.** The only head scripts are two JSON-LD blocks, which don't run code. The app scripts come through `<Scripts />` at the end of body.
4. **GTM is non-blocking.** `GoogleAnalytics` in `__root.tsx` injects `gtm.js` with `async` inside `useEffect`, after the page is interactive, and skips admin pages. No change needed.
5. **LCP element.** The header logo is HTML text (`SiteLogoHorizontal`), not an image. On the homepage, the likely LCP element is the Sukkos greeting (`/assets/sukkos-chag-sameach-banner.svg`, 2.9 KB, width/height 1600x900, fetchPriority="high", eager) while that season is on. Outside the season it is the text H1. That image setup is already good. The one gap: no `<link rel="preload">` for it, which matters little at 2.9 KB.
6. **Responsive banner code is unused.** `BrandBanner` in `SiteLogo.tsx` has correct srcset images (800/1280/1920 plus a mobile image, with width and height set) but no page renders it. That makes it dead code rather than a speed problem.
7. **Layout shift (CLS).** Fonts are system fonts only (Georgia and the system sans stack), so no web fonts load and fonts can't shift the layout. The Sukkos image reserves its space through width and height. `AnnouncementBanner` gets `initialBanner` from the server loader, so it should appear in the first page render rather than pop in later. Unverified: whether it re-fetches and changes after the page loads.
8. **Heavy assets in the build but not on the homepage:** `logo-stacked.png` is 149 KB, used only on About at h-16/h-20 (about 64-80 px tall). A WebP or smaller version would help that page only.

## Not measured

- No Lighthouse or live-browser run, and no real LCP/CLS numbers. This site rendered the maintenance page during parts of the audit period, so field data may not match the homepage.
- There's no source map, so I don't have an exact breakdown of what's inside the main chunk.

## Suggested next step (once you approve)

Run Lighthouse on the live homepage with maintenance OFF in preview. Then, if you want, make the change in item 1 (lazy-load the backend client in the site shell) as the first targeted fix.
