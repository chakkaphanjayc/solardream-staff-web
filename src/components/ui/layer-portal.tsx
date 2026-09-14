"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  SOLARDREAM_LAYER_ROOT_ID,
  useLayerHost,
} from "@/components/providers/LayerProvider";
import { cn } from "@/lib/utils";

/**
 * One semantic scale for customer-facing stacking contexts. Consumers choose a
 * role, never a numeric z-index.
 */
export const LAYER_Z_INDEX = {
  base: 0,
  sticky: 20,
  chrome: 30,
  floating: 40,
  popover: 50,
  scrim: 60,
  drawer: 70,
  dialog: 70,
  immersive: 80,
  toast: 90,
  tooltip: 100,
} as const;

export type LayerName = keyof typeof LAYER_Z_INDEX;

const LAYER_CLASS_NAME: Record<LayerName, string> = {
  base: "layer-content",
  sticky: "layer-sticky",
  chrome: "layer-chrome",
  floating: "layer-floating",
  popover: "layer-popover",
  scrim: "layer-backdrop",
  drawer: "layer-dialog",
  dialog: "layer-dialog",
  immersive: "layer-immersive",
  toast: "layer-toast",
  tooltip: "layer-tooltip",
};

export interface LayerPortalProps {
  children: ReactNode;
  layer?: LayerName;
  className?: string;
  container?: Element | DocumentFragment | null;
}

const subscribeToHydration = () => () => undefined;

function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
}

/**
 * Mount-safe portal for dialogs, sheets, popovers, toasts, and tooltips.
 * Nothing is rendered until the client has committed, preventing hydration
 * mismatches while retaining an SSR portal host in the provider.
 */
export function LayerPortal({
  children,
  layer = "dialog",
  className,
  container,
}: LayerPortalProps) {
  const providerHost = useLayerHost();
  const isMounted = useHasHydrated();

  if (!isMounted) return null;

  const fallbackHost = document.getElementById(SOLARDREAM_LAYER_ROOT_ID);
  const portalHost = container ?? providerHost ?? fallbackHost;
  if (!portalHost) return null;

  return createPortal(
    <div
      data-layer={layer}
      data-layer-level={LAYER_Z_INDEX[layer]}
      className={cn("relative", LAYER_CLASS_NAME[layer], className)}
    >
      {children}
    </div>,
    portalHost,
  );
}

export default LayerPortal;
