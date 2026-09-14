export const APP_SURFACES = ["customer", "staff"] as const;
export type AppSurface = (typeof APP_SURFACES)[number];

export const CUSTOMER_ROUTE_ROOTS = [
  "account",
  "auth",
  "blog",
  "build",
  "builder",
  "cart",
  "catalog",
  "checkout",
  "consultation",
  "contact",
  "external-access",
  "forgot-password",
  "forum",
  "guest",
  "legal",
  "line-callback",
  "my-assets",
  "my-proposal",
  "news",
  "portal",
  "privacy",
  "profile",
  "project-tracker",
  "proposals",
  "services",
  "support",
  "terms",
  "track",
  "verify-document",
  "visualizer",
  "warranty",
  "wizard",
  "works",
] as const;

export const STAFF_ROUTE_ROOTS = ["admin", "installer", "tech", "tech-portal"] as const;

export function getRouteRoot(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const second = segments[1];

  if (first === "th" || first === "en" || first === "ja" || first === "zh" || first === "ko" || first === "vi") {
    return second ?? "";
  }

  return first ?? "";
}

export function isStaffRoute(pathname: string): boolean {
  return (STAFF_ROUTE_ROOTS as readonly string[]).includes(getRouteRoot(pathname));
}

export function isCustomerRoute(pathname: string): boolean {
  return !isStaffRoute(pathname);
}
