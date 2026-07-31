import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { confirmUnsubscribe } from "@/integrations/supabase/api.functions";

export const Route = createFileRoute("/unsubscribe/")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: UnsubscribeByQuery,
  head: () => ({
    meta: [
      { title: "Unsubscribe — Torah for the Table" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function UnsubscribeByQuery() {
  const { token } = Route.useSearch();
  const [message, setMessage] = useState("Processing your request…");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setMessage("This unsubscribe link is missing its token.");
      return;
    }
    (async () => {
      try {
        const r = await confirmUnsubscribe({ data: { token } });
        if (cancelled) return;
        if (!r.ok) setMessage(r.error ?? "This unsubscribe link is no longer valid.");
        else if (r.alreadyInactive) setMessage("You are already unsubscribed.");
        else setMessage("You have been unsubscribed. You will not receive further emails.");
      } catch {
        if (!cancelled) setMessage("Could not unsubscribe. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background px-4 py-16 flex items-start justify-center">
      <div className="parchment-frame max-w-lg w-full">
        <div className="parchment-panel text-center">
          <h1 className="font-serif text-3xl font-bold text-primary">Unsubscribe</h1>
          <p className="mt-4 text-foreground">{message}</p>
          <a href="/" className="mt-6 inline-block underline text-primary">
            Return to homepage
          </a>
        </div>
      </div>
    </div>
  );
}
