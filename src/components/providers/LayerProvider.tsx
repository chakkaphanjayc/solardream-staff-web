"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

export const SOLARDREAM_LAYER_ROOT_ID = "solardream-layer-root";

const LayerHostContext = createContext<HTMLDivElement | null>(null);

export interface LayerProviderProps {
  children: ReactNode;
}

/**
 * Renders a stable portal host as part of the server-rendered application tree.
 * Layer consumers resolve the element only after hydration, which keeps portal
 * content out of the server/client reconciliation boundary.
 */
export function LayerProvider({ children }: LayerProviderProps) {
  const [layerHost, setLayerHost] = useState<HTMLDivElement | null>(null);

  return (
    <LayerHostContext.Provider value={layerHost}>
      {children}
      <div
        ref={setLayerHost}
        id={SOLARDREAM_LAYER_ROOT_ID}
        data-solardream-layer-root=""
      />
    </LayerHostContext.Provider>
  );
}

export function useLayerHost(): HTMLDivElement | null {
  return useContext(LayerHostContext);
}

export default LayerProvider;
