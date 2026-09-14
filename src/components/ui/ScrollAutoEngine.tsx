"use client";

/**
 * ScrollAutoEngine — React hook for smart GSAP-powered auto-scroll.
 *
 * Wraps smartScrollTo() from gsap-registry in a React hook for convenient
 * use inside client components (e.g., WizardClient, ConfiguratorClient).
 *
 * Usage:
 *   const { scrollTo, killScroll } = useSmartScroll();
 *   scrollTo("#wizard-step-2", { delay: 250 });
 */

import { useCallback } from "react";
import {
  smartScrollTo,
  killActiveScroll,
  type SmartScrollOptions,
} from "@/lib/gsap-registry";

export interface UseSmartScrollReturn {
  /** Scroll to a CSS selector or HTMLElement with GSAP. */
  scrollTo: (target: string | HTMLElement, options?: SmartScrollOptions) => void;
  /** Immediately kill any active GSAP scroll tween. */
  killScroll: () => void;
}

export function useSmartScroll(): UseSmartScrollReturn {
  const scrollTo = useCallback(
    (target: string | HTMLElement, options: SmartScrollOptions = {}) => {
      smartScrollTo(target, options);
    },
    [],
  );

  return { scrollTo, killScroll: killActiveScroll };
}
