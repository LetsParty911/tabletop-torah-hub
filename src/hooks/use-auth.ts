import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";

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
      const { data } = await supa.auth.getSession();
      setSession(data.session);
      setLoading(false);
    })();
    return () => unsub?.();
  }, []);

  const signInWithGitHub = useCallback(async () => {
    const supa = await getSupabase();
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
