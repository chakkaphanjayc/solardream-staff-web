import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { Flip } from "gsap/Flip";

let _registered = false;

/** Call once from a client Provider to activate GSAP plugins. */
export function registerGsapPlugins(): void {
  if (_registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, Flip);
  _registered = true;
}

// ─── Active scroll tween tracking ───────────────────────────────────────────

let _activeTween: gsap.core.Tween | null = null;

function getNavbarOffset(): number {
  if (typeof document === "undefined") return 96;
  const nav = document.querySelector("[data-navbar-height]") as HTMLElement | null;
  if (nav) {
    const h = parseInt(nav.getAttribute("data-navbar-height") ?? "0", 10);
    if (h > 0) return h;
    return nav.getBoundingClientRect().height;
  }
  return 96;
}

/** Kill the current GSAP scroll tween (called on user interruption). */
export function killActiveScroll(): void {
  if (_activeTween) {
    _activeTween.kill();
    _activeTween = null;
  }
}

export interface SmartScrollOptions {
  /** Additional px beyond navbar (default 0). */
  extraOffset?: number;
  /** Tween duration in seconds (default 0.85). */
  duration?: number;
  /** GSAP ease string (default "power3.inOut"). */
  ease?: string;
  /** Pre-scroll debounce delay in ms (default 0). */
  delay?: number;
}

/**
 * Smoothly scroll to a target element via GSAP ScrollToPlugin.
 * Auto-compensates for the floating navbar height.
 */
export function smartScrollTo(
  target: string | HTMLElement,
  options: SmartScrollOptions = {},
): gsap.core.Tween | null {
  if (typeof window === "undefined") return null;

  const el =
    typeof target === "string"
      ? (document.querySelector(target) as HTMLElement | null)
      : target;
  if (!el) return null;

  const {
    extraOffset = 0,
    duration = 0.85,
    ease = "power3.inOut",
    delay = 0,
  } = options;
  const offsetY = getNavbarOffset() + extraOffset;

  killActiveScroll();

  const startScroll = () => {
    const tween = gsap.to(window, {
      duration,
      scrollTo: { y: el, offsetY },
      ease,
      onComplete: () => {
        _activeTween = null;
      },
    });
    _activeTween = tween;
    return tween;
  };

  if (delay > 0) {
    gsap.delayedCall(delay / 1000, startScroll);
    return null;
  }
  return startScroll();
}

/**
 * Install global wheel/touch/key listeners that kill any active GSAP
 * scroll tween the moment the user initiates their own scroll.
 * Returns a cleanup function to call on unmount.
 */
export function setupScrollInterruptionGuard(): () => void {
  if (typeof window === "undefined") return () => {};

  const kill = () => {
    if (_activeTween) killActiveScroll();
  };

  const INTERRUPT_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", " "]);
  const onKey = (e: KeyboardEvent) => {
    if (INTERRUPT_KEYS.has(e.key)) kill();
  };

  window.addEventListener("wheel", kill, { passive: true });
  window.addEventListener("touchmove", kill, { passive: true });
  window.addEventListener("keydown", onKey);

  return () => {
    window.removeEventListener("wheel", kill);
    window.removeEventListener("touchmove", kill);
    window.removeEventListener("keydown", onKey);
  };
}

export { gsap, ScrollTrigger, ScrollToPlugin, Flip };
