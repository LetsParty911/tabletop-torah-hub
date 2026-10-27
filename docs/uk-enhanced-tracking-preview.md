# UK enhanced analytics — code-only preview (27 Oct 2026)

Status: NOT DEPLOYED. This branch is a review artifact only. Do not merge or publish without a separate privacy and technical review.

## Verified current code (Lovable project Torah Table Connect)

- `src/lib/privacy-region.ts`: GB/UK and EEA require consent for enhanced fingerprinting. Unknown locations fail closed.
- `src/components/EnhancedAnalyticsConsent.tsx`: requests a visitor's explicit choice before fingerprint capture in those regions.
- `src/routes/api/enhanced-fingerprint.ts`: refuses `not_required` for UK requests.
- `src/lib/enhanced-fingerprint.ts`: existing enhanced device signals include hashes of canvas, fonts, WebGL and audio, plus device and browser information. These are probabilistic browser identifiers, not proof of a person's identity.
- `src/lib/first-party-analytics.ts` and `src/routes/api/events.ts`: first-party event tracking already uses persistent visitor/session identifiers and records publication activity. These require an independent review of UK consent gating; the fingerprint consent alone is not sufficient.

## Higher-detail data view to build after consent

Within a consenting visitor's sessions, show: page path, time, first-touch referral, clicks on each publication, PDF open attempt, actual served download where logged, printing, sharing, repeat visits, time on page (approximate), device category and coarse geography.

Keep aggregate UK totals separate from visitor-specific activity. Identify likely bots separately, and avoid treating all B&H-network traffic as internal.

Do not collect subscriber email addresses as device identifiers. Do not infer a visitor's religion from Torah reading patterns. Do not add new persistent identifiers before consent.

## Explicit preview guardrail

```ts
export type TrackingMode = "aggregate" | "enhanced";
export function ukTrackingMode(consent: "allow" | "deny" | null): TrackingMode {
  return consent === "allow" ? "enhanced" : "aggregate";
}
```

This is illustrative selection logic, **not** an authorization to emit fingerprint or visitor-specific events; the server must also check consent and the specific tracking purpose. A client-declared value of `consented` is not proof of consent.

## Required tests before any deployment

1. No cookies/localStorage persistent visitor IDs or optional tracking pixels execute prior to consent for UK visitors.
2. Consent declined or withdrawn: no fingerprint collection, session replay, or cross-session behavioral profiles.
3. Consent granted: enhanced session details work; record and verify server-side consent evidence, including version, purposes, timestamp and withdrawal handling.
4. Unknown geolocation: fail closed, no enhanced tracking.
5. Regional check and server enforcement cannot be bypassed by a fabricated `consent_mode`.
6. No effect on Shabbos/Yom Tov closure, maintenance, geo/IP/VPN restrictions, PDF access, admins or bot controls.
7. Retention policy, disclosure, and erasure requests are supported and independently verified.

**No existing production files, services, database tables or security gates were changed by this preview document.**
