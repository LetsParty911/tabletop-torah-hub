## Read-only audit of the preview, six focus areas (Sept 25, 2026)

Nothing was edited, committed or published. I checked in a fresh browser on phone (360 wide) and desktop (1280 wide), and read the related code.

### Confirmed issues

| Severity | Area | Page / component | Issue |
|---|---|---|---|
| Medium | Short Vorts | `/short-vorts` (`src/routes/short-vorts.tsx`, heading line 247, description line 47) | The heading reads "Short Vorts on Parshas Hashavua" during Sukkos, which clashes with the Sukkos notice just below it. |
| Low | Homepage, phone | Pinned bottom bar in the chooser, plus the back-to-top button | After a quick choice, a bar reading "A Good Story selected · Change" (60px tall) stays pinned to the bottom of the screen. The back-to-top button sits right above it. Together they cover part of the last visible card on short phones. Nothing is blocked, but it's tight. |
| Low (content) | Footer | `SiteFooter` | The footer says "registered 501(c)(3) nonprofit organization". Earlier privacy work deliberately left nonprofit claims off that page. Please confirm this statement is accurate and intended. |

### Working correctly
- **Homepage:** the phone view opens with "Choose a Dvar Torah for Your Table". Desktop keeps the Sukkos heading. No sideways scrolling, and no poster or My Table text.
- **Quick choices:** they filter the full list. For example, Stories shows "A Good Story: all 6 selections", and each card has Download PDF and Read details first. The pinned "selected · Change" bar appears once you scroll.
- **Publication page and download:** `/view/…` (Short Vorts for Sukkos) loads. Its Download button goes through the tracked download link, which quickly sends the browser on to the PDF file.
- **Archive search:** searching "sukkos" returns 12 results and keeps the word in the search box. A nonsense search shows "No matches for these filters."
- **Banner:** it shows the text saved in admin ("Something for everyone. Take your time…").
- **Signup:** one email signup form, with no duplicate IDs.
- **Footer:** Contact and Privacy links are present.

### Risks, not confirmed
1. **Downloads saved as "Direct":** a download from a visit with no earlier activity can still be saved as "Direct" traffic (`src/routes/view.$id.download.tsx`).
2. **Current week can go stale:** the homepage has no timer or tab-return refresh. A tab left open from Thursday won't show new items until reloaded, and the offline copy can briefly serve an older page.
3. **Wide cards on the Sukkos page (outside your six areas):** on phones, the `/yom-tov/sukkos/5787` page scrolls sideways. One card measures about 530px on a 360px screen.

### Not tested
- I didn't submit the signup form, to avoid creating a real subscriber.
- I didn't finish the PDF download in a browser. I only checked that the download link sends the browser to the file.
- I didn't sign in to admin.

### Suggested fixes (only if you approve)
1. Change the Short Vorts heading to name the current Yom Tov.
2. Raise the back-to-top button, or hide it while the pinned chooser bar shows.
3. Confirm or remove the 501(c)(3) line in the footer.
