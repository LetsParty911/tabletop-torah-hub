import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { checkIsAdmin } from "@/integrations/supabase/api.functions";
import AdminAnalyticsReport from "@/components/admin/AdminAnalyticsReport";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin-analytics")({
  component: AdminAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Site Analytics — Torah for the Table" },
      { name: "description", content: "Private site analytics report for Torah for the Table administrators." },
      { property: "og:title", content: "Site Analytics — Torah for the Table" },
      { property: "og:description", content: "Private site analytics report for Torah for the Table administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="parchment-frame max-w-md w-full">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-3xl font-bold text-primary">Admin Sign-in</h1>
            <p className="mt-3 text-muted-foreground">
              Sign in with Google to view site analytics.
            </p>
            <Button onClick={signInWithGoogle} className="mt-6">
              Sign in with Google
            </Button>
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
          <Button onClick={signOut} variant="link" className="mt-6">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Verifying access…
      </div>
    );
  }

  return (
    <div className="admin-analytics-page min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-primary">
              Site Analytics
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">A readable account of who came, what Torah they used, and how they found it.</p>
          </div>
          <Link to="/admin" className="text-sm underline text-primary">
            ← Back to Admin
          </Link>
        </header>

        <main className="parchment-frame"><div className="parchment-panel"><AdminAnalyticsReport accessToken={accessToken ?? ""} /></div></main>
      </div>
    </div>
  );
}
