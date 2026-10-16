# Prominent homepage subscription destination

## Evidence before editing

- Inspected remote main `a3e9ad28087f54722996156e62cf955c655214d0` on October 16, 2026. No open subscription-related pull request was returned by the GitHub search.
- Opened https://torahforthetable.com/ in the browser before changing source. The deployed DOM contains the compact `weekly-email-signup-top` form before featured selections and the lower `weekly-email-signup` form. Both have separate accessible form names and explicit consent checkboxes.
- The deployed banner is currently in the content-live state and shows collection navigation. There is no banner Subscribe link in this state. The problematic pre-release branch was confirmed in source, rather than observed as a currently visible production link. The exact production commit was not established.

## Correction

Both the countdown Subscribe link and homepage fallback notification link now use `#weekly-email-signup-top` for their href and scripted destination. Activation scrolls to the top form and focuses its email field without a second focus-induced scroll. Reduced-motion preference disables smooth scrolling.

The lower anchor, shared form component, backend, consent requirements, unsubscribe implementation, signup analytics, and access restrictions are unchanged.

## Validation

- `npm run test:signup`: 19 tests passed across three files.
- Tests cover unique form anchors and label IDs, placement before featured picks, both pointer and Enter activation, email focus, reduced motion, live collection navigation, explicit consent, successful and already-subscribed responses, pending submission lockout, server error retry, rejected requests, independent form state, and placement-specific analytics. Subscription and analytics services are mocked: no test emails are sent.
- `npm run build`: passed; existing server-function deprecation and bundler warnings were emitted.
- `git diff --check`: passed.
- Live desktop browser: viewport width 1363 CSS pixels, no horizontal document overflow. Both deployed forms reject a no-consent submission, show an alert, and focus their own checkbox. No real subscription was created.
- Responsive classes were inspected: compact form stacks below `sm` and becomes a row at `sm`; both links retain touch-sized controls. Mobile viewport visual testing and browser testing of the corrected branch were not completed: the available browser has no viewport-emulation API, and the managed Sites workflow disallows starting a preview without its required control-browser capability. DOM interaction tests do not establish rendered mobile layout.
- Unsubscribe code was not changed; no real subscriber was unsubscribed as a test.

## Dependency note

A dedicated Vitest config and `test:signup` command make the regression suite repeatable. The added test tools are development dependencies. The existing npm lockfile lagged behind the existing package manifest (including TanStack and Lovable configuration versions), so npm also reconciled those existing discrepancies. This explains lockfile changes beyond the new test packages; no production dependency declarations were changed.

## Release gate

Draft review only. No merge or production deployment is authorized by this change. Complete corrected-branch desktop/mobile browser checks before requesting production approval. Obtain Daniel's explicit approval before deployment.
