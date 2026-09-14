"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { usePathname } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function useSupabaseUser() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    const checkUser = () => {
      supabase.auth
        .getUser()
        .then(({ data: { user: currentUser } }) => {
          if (!mounted) return;
          setUser(currentUser ?? null);
          setLoading(false);
        })
        .catch(() => {
          if (!mounted) return;
          setUser(null);
          setLoading(false);
        });
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const handleAuthEvent = () => {
      checkUser();
    };

    window.addEventListener("solardream:auth-changed", handleAuthEvent);
    window.addEventListener("focus", handleAuthEvent);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("solardream:auth-changed", handleAuthEvent);
      window.removeEventListener("focus", handleAuthEvent);
    };
  }, [supabase.auth, pathname]);

  return {
    user,
    loading,
    isMember: Boolean(user),
  };
}
