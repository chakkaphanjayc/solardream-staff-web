import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCookieDomain } from "@/lib/siteUrl";

type BrowserSupabaseClient = SupabaseClient;

let browserClient: BrowserSupabaseClient | undefined;

export function createClient(): BrowserSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  }

  // Keep one browser client per tab. Apart from avoiding duplicate auth
  // refresh requests, this ensures every component observes the same
  // onAuthStateChange subscription and cookie-backed session.
  if (typeof window !== "undefined" && browserClient) {
    return browserClient;
  }

  const isProd = process.env.NODE_ENV === "production";
  const domain = typeof window !== "undefined" ? getCookieDomain(window.location.hostname) : undefined;

  const client = createBrowserClient(url, anonKey, {
    auth: {
      // Passkey support is opt-in in Supabase Auth. Keeping it here makes the
      // same browser client usable for enrollment, management, and sign-in.
      experimental: { passkey: true },
    },
    cookieOptions: {
      domain,
      secure: isProd,
      sameSite: "lax",
      path: "/",
    },
  });

  if (typeof window !== "undefined") {
    browserClient = client;
  }

  return client;
}
