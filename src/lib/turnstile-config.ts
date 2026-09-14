export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

export function getTurnstileSiteKey(): string {
  const useTestKeys =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_TURNSTILE_TEST_MODE === "true";

  return useTestKeys
    ? TURNSTILE_TEST_SITE_KEY
    : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
}
