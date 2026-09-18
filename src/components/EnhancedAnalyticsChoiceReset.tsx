import { useEffect, useState } from "react";
import { clearConsentChoice, readConsentChoice } from "@/lib/enhanced-analytics-consent";

// Small privacy-page control that lets a visitor in a consent-required region
// see and clear their stored enhanced-analytics choice. Intentionally minimal —
// not a consent-management platform.

export function EnhancedAnalyticsChoiceReset() {
  const [choice, setChoice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setChoice(readConsentChoice());
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="rounded-md border border-border bg-card/60 p-4 text-base">
      <p>
        Your saved choice for enhanced analytics:{" "}
        <strong>
          {choice === "allow" ? "Allowed" : choice === "deny" ? "Declined" : "No choice saved"}
        </strong>
      </p>
      {choice ? (
        <button
          type="button"
          onClick={() => {
            clearConsentChoice();
            setChoice(null);
          }}
          className="mt-2 text-accent underline hover:text-primary transition-colors"
        >
          Clear this choice
        </button>
      ) : null}
    </div>
  );
}
