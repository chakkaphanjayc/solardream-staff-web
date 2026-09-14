import { isLocale, type Locale } from "@/i18n/locales";

const AUTH_ROOT_SEGMENTS = new Set([
  "auth",
  "forgot-password",
  "line-callback",
  "login",
  "register",
]);

export type CustomerRouteFamily =
  | "home"
  | "auth"
  | "wizard-summary"
  | "guest"
  | "portal"
  | "external-access"
  | "admin"
  | "visualizer"
  | "tech-portal"
  | "customer";

export interface CustomerRoutePolicy {
  pathname: string;
  locale: Locale | null;
  segments: readonly string[];
  routeSegments: readonly string[];
  family: CustomerRouteFamily;
  isHome: boolean;
  isAuth: boolean;
  isImmersive: boolean;
  isAccessRoute: boolean;
  isAdmin: boolean;
  isVisualizer: boolean;
  isTechPortal: boolean;
  lockViewport: boolean;
  showNavigation: boolean;
  showFooter: boolean;
  showGlobalBanner: boolean;
  showCustomerTools: boolean;
  showCookieBanner: boolean;
  useSmoothScroll: boolean;
  animatePageTransition: boolean;
}

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.trim().split(/[?#]/, 1)[0] || "/";
  const normalized = `/${pathOnly.split("/").filter(Boolean).join("/")}`;
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function classifyRoute(routeSegments: readonly string[]): CustomerRouteFamily {
  const [root, child] = routeSegments;

  if (!root) return "home";
  if (root === "admin") return "admin";
  if (root === "visualizer") return "visualizer";
  if (root === "tech-portal") return "tech-portal";
  if (root === "wizard" && child === "summary") return "wizard-summary";
  if (AUTH_ROOT_SEGMENTS.has(root)) return "auth";
  if (root === "account" && child === "setup") return "auth";
  if (root === "guest") return "guest";
  if (root === "portal") return "portal";
  if (root === "external-access") return "external-access";
  return "customer";
}

/**
 * Resolves a locale-aware route into the chrome and scrolling policy shared by
 * SiteChrome and LayoutContent. Matching is segment-based and side-effect free,
 * so it can run in both Server and Client Components.
 */
export function getCustomerRoutePolicy(pathname: string): CustomerRoutePolicy {
  const normalizedPathname = normalizePathname(pathname);
  const segments = normalizedPathname.split("/").filter(Boolean);
  const locale = isLocale(segments[0]) ? segments[0] : null;
  const routeSegments = locale ? segments.slice(1) : segments;
  const family = classifyRoute(routeSegments);

  const isHome = family === "home";
  const isAuth = family === "auth";
  const isImmersive = family === "wizard-summary";
  const isAccessRoute =
    family === "guest" ||
    family === "portal" ||
    family === "external-access";
  const isAdmin = family === "admin";
  const isVisualizer = family === "visualizer";
  const isTechPortal = family === "tech-portal";
  // The summary owns its desktop sticky panel, while small screens need the
  // browser document to scroll naturally past the controls and canvas.
  const lockViewport = false;
  const suppressCustomerChrome =
    isAuth ||
    isAccessRoute ||
    isAdmin ||
    isVisualizer ||
    isTechPortal;
  const showNavigation = !suppressCustomerChrome;
  const showFooter = showNavigation && !isHome && !isImmersive;

  return {
    pathname: normalizedPathname,
    locale,
    segments,
    routeSegments,
    family,
    isHome,
    isAuth,
    isImmersive,
    isAccessRoute,
    isAdmin,
    isVisualizer,
    isTechPortal,
    // Customer pages, including proposals and the wizard summary, keep the
    // browser document as their scroll surface. The summary component owns its
    // desktop sticky controls instead of locking the shared application shell.
    lockViewport,
    showNavigation,
    showFooter,
    showGlobalBanner: showNavigation,
    // The wizard summary owns its responsive controls and mobile sheet. Keep
    // the shared configurator drawer off that route to avoid competing panels.
    showCustomerTools: showNavigation && !isImmersive,
    showCookieBanner: showNavigation,
    useSmoothScroll:
      family === "customer" || family === "auth" || isAccessRoute,
    // Product routes should render directly into the task. State changes may
    // animate locally, but route-wide entrance choreography stays disabled.
    animatePageTransition: false,
  };
}

export function isLocaleHomePathname(pathname: string): boolean {
  return getCustomerRoutePolicy(pathname).isHome;
}

/**
 * Routes used by staff or private customer access flows must not load the
 * customer-facing analytics tracker.
 */
export function isAnalyticsExcludedRoute(pathname: string): boolean {
  const policy = getCustomerRoutePolicy(pathname);
  const rootSegment = policy.routeSegments[0];

  return (
    policy.isAdmin ||
    policy.isTechPortal ||
    rootSegment === "installer" ||
    rootSegment === "track"
  );
}
