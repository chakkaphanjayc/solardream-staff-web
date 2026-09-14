import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { getCookieDomain, getRequestHostHeader } from "@/lib/siteUrl";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export async function createClient() {
  const cookieStore = await cookies();
  const headersStore = await headers();
  const host = getRequestHostHeader(headersStore);
  const domain = getCookieDomain(host);

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const isProd = process.env.NODE_ENV === "production";
              cookieStore.set(name, value, {
                ...options,
                secure: isProd,
                sameSite: "lax",
                path: "/",
                ...(domain ? { domain } : {}),
              });
            });
          } catch {
            // Safe fallback when called from a Server Component during render
          }
        },
      },
    }
  );
}


export function createAdminClient() {
  return createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        // Runtime configuration reads, including LINE Quick Replies, must
        // never be served from Next's fetch data cache after an admin save.
        fetch: (input, init) => globalThis.fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
