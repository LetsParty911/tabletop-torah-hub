import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getSafePostLoginRedirect, POST_LOGIN_REDIRECT_KEY } from "@/lib/auth-redirect";

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
        const saved = getSafePostLoginRedirect(
          window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY),
        );
        if (saved) {
          window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
          if (saved !== window.location.pathname + window.location.search) {
            // Full navigation so TanStack Router mounts the target route.
            window.location.replace(saved);
          }
        }
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        POST_LOGIN_REDIRECT_KEY,
        window.location.pathname + window.location.search,
      );
    }
    const { lovable } = await import("@/integrations/lovable");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      console.error("Google sign-in failed:", result.error);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { session, loading, signInWithGoogle, signOut };
}
