"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";

export default function SmoothScrollBoundary({
  children,
  reducedMotion,
}: {
  children: ReactNode;
  reducedMotion: boolean;
}) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.12,
        duration: reducedMotion ? 0 : 0.55,
        smoothWheel: !reducedMotion,
        touchMultiplier: 0.85,
      }}
    >
      {children}
    </ReactLenis>
  );
}
