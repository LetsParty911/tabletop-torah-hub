import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const REDIRECT_KEY = "auth:postLoginRedirect";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    (async () => {
      try {
        if (typeof window !== "undefined") {
          const url = window.location.href;
          if (url.includes("code=") || url.includes("access_token=")) {
            try {
              await supabase.auth.exchangeCodeForSession(url);
            } catch {
              /* not a PKCE callback — that's fine */
            }
          }
        }
      } catch {
        /* noop */
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);

      if (data.session && typeof window !== "undefined") {
        const saved = window.sessionStorage.getItem(REDIRECT_KEY);
        if (saved) {
          window.sessionStorage.removeItem(REDIRECT_KEY);
          if (saved !== window.location.pathname + window.location.search) {
            window.history.replaceState({}, "", saved);
          }
        }
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGitHub = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        REDIRECT_KEY,
        window.location.pathname + window.location.search,
      );
    }
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/admin` },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { session, loading, signInWithGitHub, signOut };
}
