"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user?.id ?? null;

      // On initial mount / session restoration, record the initial user ID without refreshing
      if (prevUserIdRef.current === undefined) {
        prevUserIdRef.current = currentUserId;
        return;
      }

      // Only refresh when the user ID actually changes (e.g. login, logout, account switch)
      if (prevUserIdRef.current !== currentUserId) {
        prevUserIdRef.current = currentUserId;
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
          router.refresh();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth, router]);

  return <>{children}</>;
}
