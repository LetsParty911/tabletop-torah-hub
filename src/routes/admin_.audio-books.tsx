import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { checkIsAdmin } from "@/integrations/supabase/api.functions";
import { ParshaAudioBookAdmin } from "@/components/admin/ParshaAudioBookAdmin";

// Independent admin route: this page does not depend on the larger Admin
// Dashboard or its tab state. The "admin_" file segment deliberately opts
// out of nesting under /admin, while preserving the URL /admin/audio-books.
export const Route = createFileRoute("/admin_/audio-books")({
  component: AudioBookUploadPage,
  head: () => ({
    meta: [
      { title: "Upload Parsha Audio Book — Torah For The Table Admin" },
      { name: "description", content: "Private audio-book publication management for site administrators." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AudioBookUploadPage() {
  const { session, loading, signInWithGoogle, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    let active = true;
    setIsAdmin(null);
    setCheckError(null);
    if (accessToken) {
      void checkIsAdmin({ data: { accessToken } })
        .then((result) => {
          if (active) setIsAdmin(result.isAdmin);
          if (result.isAdmin) {
            // Match the main admin dashboard: the standalone audiobook admin must
            // also mark this browser internal for all first-party/audio metrics.
            void fetch("/api/internal-device", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accessToken, action: "mark" }),
            }).catch(() => undefined);
          }
        })
        .catch(() => {
          if (active) setCheckError("Could not verify administrator access. Reload and try again.");
        });
    }
    return () => { active = false; };
  }, [accessToken]);

  const hasAuthCallback =
    typeof window !== "undefined" &&
    (window.location.hash.includes("access_token=") ||
      window.location.search.includes("code="));

  if (loading || hasAuthCallback) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <section className="parchment-frame mx-auto max-w-md">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-2xl font-bold text-primary">Audio Book Admin Sign-in</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to upload the Parshas Vayetzei audiobook.</p>
            <button type="button" onClick={signInWithGoogle}
              className="mt-5 min-h-11 rounded-full bg-primary px-6 py-2 font-semibold text-primary-foreground">
              Sign in with Google
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (checkError) {
    return <main className="mx-auto max-w-lg px-4 py-12 text-center" role="alert">{checkError}</main>;
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-4 py-12 text-center">
        <h1 className="font-serif text-2xl font-bold text-primary">Not authorized</h1>
        <p className="text-muted-foreground">This Google account does not have administrator permission.</p>
        <button type="button" onClick={signOut} className="text-primary underline">Sign out</button>
      </main>
    );
  }

  if (isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Verifying access…</div>;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-readable">Torah For The Table · Private Admin</p>
            <h1 className="font-serif text-3xl font-bold text-primary">Upload a Parsha Audio Book</h1>
            <p className="mt-1 text-sm text-muted-foreground">Upload the MP3 with embedded artwork and the separate cover JPG.</p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary underline">Back to Admin Dashboard</Link>
        </header>
        <ParshaAudioBookAdmin accessToken={accessToken!} />
      </div>
    </main>
  );
}
