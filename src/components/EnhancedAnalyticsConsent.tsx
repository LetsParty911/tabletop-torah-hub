import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAdminPath } from "@/lib/first-party-analytics";
import { captureAndSendFingerprint } from "@/lib/enhanced-fingerprint";
import {
  readConsentChoice,
  writeConsentChoice,
  type ConsentChoice,
} from "@/lib/enhanced-analytics-consent";
import type { PrivacyRegionResponse } from "@/lib/privacy-region";

// Lifecycle for enhanced (fingerprint-based) analytics.
//
// - Never runs on admin routes.
// - Asks the hosting edge whether this visitor's region requires consent.
// - Where consent is NOT required, no prompt is shown and the snapshot is
//   captured once per session under consent_mode='not_required'.
// - Where consent IS required, a small, non-blocking first-party prompt is
//   shown with equal-weight Allow / No thanks buttons. Declining means the
//   fingerprint endpoint is never called from this browser.

export function EnhancedAnalyticsConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAdminPath(window.location.pathname)) return;

    let cancelled = false;

    // Deferred so it can never delay first render.
    const schedule = (fn: () => void) => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (ric) ric(fn);
      else window.setTimeout(fn, 1200);
    };

    schedule(() => {
      void (async () => {
        try {
          const res = await fetch("/api/privacy-region", { headers: { Accept: "application/json" } });
          if (!res.ok || cancelled) return;
          const region = (await res.json()) as PrivacyRegionResponse;

          if (!region.consentRequiredForEnhancedAnalytics) {
            await captureAndSendFingerprint("not_required");
            return;
          }

          const choice = readConsentChoice();
          if (choice === "allow") {
            await captureAndSendFingerprint("consented");
            return;
          }
          if (choice === "deny") return;
          if (!cancelled) setVisible(true);
        } catch {
          /* enhanced analytics must never break the page */
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const decide = (choice: ConsentChoice) => {
    writeConsentChoice(choice);
    setVisible(false);
    if (choice === "allow") void captureAndSendFingerprint("consented");
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Allow enhanced analytics?"
      className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-md rounded-lg border border-border bg-card p-4 shadow-lg sm:left-auto sm:right-4 sm:bottom-4"
    >
      <h2 className="font-serif text-base font-semibold text-primary">
        Allow enhanced analytics?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This helps Torah for the Table tell real visitors apart from automated traffic and
        understand browser and device compatibility. The site works the same either way.
      </p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => decide("allow")}>
          Allow
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => decide("deny")}>
          No thanks
        </Button>
      </div>
    </div>
  );
}
