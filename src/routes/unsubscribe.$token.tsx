import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  lookupUnsubscribe,
  confirmUnsubscribe,
} from "@/integrations/supabase/api.functions";

export const Route = createFileRoute("/unsubscribe/$token")({
  component: UnsubscribePage,
  head: () => ({
    meta: [
      { title: "Unsubscribe — Torah for the Table" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "confirm"; email: string }
  | { kind: "working" }
  | { kind: "done"; email: string | null }
  | { kind: "already" }
  | { kind: "error"; message: string };

function UnsubscribePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await lookupUnsubscribe({ data: { token } });
        if (cancelled) return;
        if (!r.found) setState({ kind: "invalid" });
        else if (r.alreadyInactive) setState({ kind: "already" });
        else setState({ kind: "confirm", email: r.email ?? "" });
      } catch {
        if (!cancelled) setState({ kind: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleConfirm = async () => {
    setState({ kind: "working" });
    try {
      const r = await confirmUnsubscribe({ data: { token } });
      if (!r.ok) {
        setState({ kind: "error", message: r.error ?? "Could not unsubscribe." });
        return;
      }
      if (r.alreadyInactive) setState({ kind: "already" });
      else setState({ kind: "done", email: null });
    } catch {
      setState({ kind: "error", message: "Could not unsubscribe. Please try again." });
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-16 flex items-start justify-center">
      <div className="parchment-frame max-w-lg w-full">
        <div className="parchment-panel text-center">
          <h1 className="font-serif text-3xl font-bold text-primary">Unsubscribe</h1>

          {state.kind === "loading" && (
            <p className="mt-4 text-muted-foreground">Checking your link…</p>
          )}

          {state.kind === "invalid" && (
            <>
              <p className="mt-4 text-foreground">
                This unsubscribe link is no longer valid.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                If you'd like to stop receiving emails, please contact us from the
                homepage.
              </p>
              <a href="/" className="mt-6 inline-block underline text-primary">
                Return to homepage
              </a>
            </>
          )}

          {state.kind === "already" && (
            <>
              <p className="mt-4 text-foreground">
                You are already unsubscribed.
              </p>
              <a href="/" className="mt-6 inline-block underline text-primary">
                Return to homepage
              </a>
            </>
          )}

          {state.kind === "confirm" && (
            <>
              <p className="mt-4 text-foreground">
                Unsubscribe <span className="font-medium">{state.email}</span> from
                weekly Divrei Torah emails?
              </p>
              <button
                onClick={handleConfirm}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Confirm Unsubscribe
              </button>
              <div className="mt-4">
                <a href="/" className="text-sm underline text-muted-foreground">
                  Cancel
                </a>
              </div>
            </>
          )}

          {state.kind === "working" && (
            <p className="mt-4 text-muted-foreground">Unsubscribing…</p>
          )}

          {state.kind === "done" && (
            <>
              <p className="mt-4 text-foreground">You have been unsubscribed.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                You can rejoin from the homepage anytime.
              </p>
              <a href="/" className="mt-6 inline-block underline text-primary">
                Return to homepage
              </a>
            </>
          )}

          {state.kind === "error" && (
            <>
              <p className="mt-4 text-destructive">{state.message}</p>
              <a href="/" className="mt-6 inline-block underline text-primary">
                Return to homepage
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
