import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { checkIsAdmin } from "@/integrations/supabase/api.functions";
import DownloadsDashboard from "@/components/DownloadsDashboard";

export const Route = createFileRoute("/admin-analytics")({
  component: AdminAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Download Analytics — Torah for the Table" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AdminAnalyticsPage() {
  const { session, loading, signInWithGoogle, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    (async () => {
      if (!accessToken) {
        setIsAdmin(null);
        return;
      }
      const r = await checkIsAdmin({ data: { accessToken } });
      setIsAdmin(r.isAdmin);
    })();
  }, [accessToken]);

  const hasAuthCallbackInUrl =
    typeof window !== "undefined" &&
    (window.location.hash.includes("access_token=") || window.location.search.includes("code="));

  if (loading || hasAuthCallbackInUrl) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="parchment-frame max-w-md w-full">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-3xl font-bold text-primary">Admin Sign-in</h1>
            <p className="mt-3 text-muted-foreground">Sign in with Google to view download analytics.</p>
            <button
              onClick={signInWithGoogle}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md">
          <h1 className="font-serif text-2xl font-bold text-primary">Not authorized</h1>
          <p className="mt-3 text-muted-foreground">
            Your account ({session.user.email}) is not an admin.
          </p>
          <button onClick={signOut} className="mt-6 underline text-primary">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Verifying access…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-primary">Download Analytics</h1>
            <p className="text-sm text-muted-foreground">Totals and a searchable log of recent downloads.</p>
          </div>
          <Link to="/admin" className="text-sm underline text-primary">
            ← Back to Admin
          </Link>
        </header>

        <section className="parchment-frame">
          <div className="parchment-panel">
            <DownloadsDashboard accessToken={accessToken ?? ""} />
          </div>
        </section>
      </div>
    </div>
  );
}
