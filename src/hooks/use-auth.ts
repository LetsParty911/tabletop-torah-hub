import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";

const REDIRECT_KEY = "auth:postLoginRedirect";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const supa = await getSupabase();
      const { data: sub } = supa.auth.onAuthStateChange((_event, s) => {
        setSession(s);
      });
      unsub = () => sub.subscription.unsubscribe();

      // If we landed back here with an OAuth code/hash, force Supabase to
      // process it before we read the session. detectSessionInUrl handles
      // this on client init, but be explicit so we don't race.
      try {
        if (typeof window !== "undefined") {
          const url = window.location.href;
          if (url.includes("code=") || url.includes("access_token=")) {
            // exchangeCodeForSession is the modern PKCE flow path; ignore
            // errors if the URL doesn't actually contain a code.
            try {
              await supa.auth.exchangeCodeForSession(url);
            } catch {
              /* not a PKCE callback — that's fine */
            }
          }
        }
      } catch {
        /* noop */
      }

      const { data } = await supa.auth.getSession();
      setSession(data.session);
      setLoading(false);

      // After successful sign-in, restore the originally intended path.
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
    return () => unsub?.();
  }, []);

  const signInWithGitHub = useCallback(async () => {
    const supa = await getSupabase();
    if (typeof window !== "undefined") {
      // Preserve the route the user was trying to reach.
      window.sessionStorage.setItem(
        REDIRECT_KEY,
        window.location.pathname + window.location.search,
      );
    }
    await supa.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/admin` },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supa = await getSupabase();
    await supa.auth.signOut();
  }, []);

  return { session, loading, signInWithGitHub, signOut };
}
