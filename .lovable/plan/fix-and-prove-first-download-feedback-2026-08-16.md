# Fix and prove first-download feedback

## Confirmed current behavior

- The shared download button is used on the homepage, Archive, and publication detail pages.
- Its busy state begins on click and the PDF body is read with `await response.blob()`, which waits for the response body's final byte.
- The app then creates a Blob URL, programmatically clicks a temporary download link, and clears the busy state after a short minimum hold.
- The browser's later save processing and native “File downloaded” notification happen after that synthetic click. Page JavaScript receives no reliable event when that native notification appears. Final network byte and visible browser completion are therefore separate milestones; the current UI only observes the first one.
- Whether production is running this exact implementation is not yet confirmed and will be checked explicitly rather than inferred from the repository.

## Implementation

1. **Audit the deployed production bundle first**
   - Identify the JavaScript version served by `torahforthetable.com` and compare its download handler with preview/source.
   - Test with a clean browser profile, no service worker/cache, and the exact Torah Wellsprings file.
   - Record timestamps for tap, busy-state start, response headers, response-body completion, synthetic download start, browser download completion, and final button state.

2. **Replace the single ambiguous state with observable phases**
   - Keep “Preparing {Publication}…” active for the entire fetch/body transfer.
   - After the Blob is handed to the browser, show a distinct non-idle “Finishing download…” state rather than returning to the normal Download button.
   - End with a persistent, unmistakable “Downloaded — check Downloads” confirmation, because browsers do not expose the native notification-complete event to the page.
   - Preserve correct filenames, edge-cacheable URLs, repeat-click protection, analytics, and the same behavior on homepage, Archive, and `/view/<uuid>` through the shared component.

3. **Add diagnostic timing without exposing user data**
   - Capture client milestones with `performance.now()` during validation.
   - Retain the endpoint's `Server-Timing` values so origin/header latency can be separated from body transfer and browser-side save processing.
   - Ensure failures return the button to an actionable error/retry state instead of looking successful.

4. **Prove the behavior with a recorded first-time download**
   - Use a fresh browser context with cache and service worker cleared.
   - Record video of a first-time Torah Wellsprings download from tap through the completed browser download event.
   - Save the recording and timestamp trace as reviewable evidence.
   - Repeat with the same file in the same session to cover re-download behavior.
   - Do not report resolution unless the recording shows no idle-looking gap before completion.

5. **Production release gate**
   - Verify the corrected bundle is the one served on the production domain.
   - Repeat the clean-profile recorded test against production and report the measured timings plus the recording artifact, clearly distinguishing browser download completion from OS/browser notification timing.

## Technical note

A web page cannot reliably observe when Chrome or Safari displays its native download notification. The reliable signals available are response-body completion and the browser download event. The UI will therefore remain explicitly non-idle across the handoff and finish with a persistent confirmation instead of falsely implying that all browser-side processing has completed.