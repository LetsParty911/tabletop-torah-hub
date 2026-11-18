import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { navigationPhase, type NavigationPhase } from "@/lib/navigation-recovery";

/**
 * Global client-navigation feedback: a thin gold progress bar while a new page
 * or filter result loads, and — if loading is unusually slow — a reload
 * option that performs a full page load of the URL the reader asked for.
 */
export function NavigationStatus() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const targetHref = useRouterState({ select: (s) => s.location.href });
  const [phase, setPhase] = useState<NavigationPhase>("idle");

  useEffect(() => {
    if (!pending) {
      setPhase("idle");
      return;
    }
    const started = Date.now();
    const tick = () => setPhase(navigationPhase(true, Date.now() - started));
    const timers = [setTimeout(tick, 160), setTimeout(tick, 10_050)];
    return () => timers.forEach(clearTimeout);
  }, [pending, targetHref]);

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {phase === "idle" ? "" : "Loading…"}
      </div>
      {phase !== "idle" && (
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-accent/20">
          <div className="nav-progress-bar h-full w-1/3 bg-accent" />
        </div>
      )}
      {phase === "slow" && (
        <div role="alert" className="fixed inset-x-3 bottom-4 z-[60] mx-auto max-w-md rounded-xl border border-accent/50 bg-background px-4 py-3 text-center shadow-lg">
          <p className="text-sm text-foreground">This page is taking longer than usual to load.</p>
          <button
            type="button"
            onClick={() => window.location.assign(targetHref)}
            className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Reload page
          </button>
        </div>
      )}
    </>
  );
}
