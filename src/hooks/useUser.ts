"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        setUser(user);
        setLoading(false);
      } catch {
        if (!mounted) return;
        setUser(null);
        setLoading(false);
      }
    };

    void fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const handleAuthEvent = () => {
      void fetchUser();
    };

    window.addEventListener("solardream:auth-changed", handleAuthEvent);
    window.addEventListener("focus", handleAuthEvent);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("solardream:auth-changed", handleAuthEvent);
      window.removeEventListener("focus", handleAuthEvent);
    };
  }, [supabase.auth]);

  return { user, loading };
}
