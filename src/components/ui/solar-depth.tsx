"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";

import { cn } from "@/lib/utils";

type SolarDepthProps = Readonly<{
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  lift?: number;
  disabled?: boolean;
}>;

function subscribeToMount() {
  return () => undefined;
}

function getMountedSnapshot() {
  return true;
}

function getServerMountedSnapshot() {
  return false;
}

/**
 * A deliberately small depth cue for primary surfaces. It follows a mouse
 * pointer with a spring, stays still for touch input, and becomes a flat
 * surface when reduced motion is requested.
 */
export function SolarDepth({
  children,
  className,
  maxTilt = 2.2,
  lift = 2,
  disabled = false,
}: SolarDepthProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const hasMounted = useSyncExternalStore(
    subscribeToMount,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );
  const prefersReducedMotion = useReducedMotion();
  const rotateX = useSpring(0, { stiffness: 260, damping: 30, mass: 0.55 });
  const rotateY = useSpring(0, { stiffness: 260, damping: 30, mass: 0.55 });

  const resetDepth = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  // Keep the server render and the first client render flat. Motion resolves
  // the user's reduced-motion preference in the browser, so enabling depth
  // during the initial render would otherwise change the inline transform and
  // trigger a hydration warning in every shared header/surface.
  const depthIsDisabled =
    disabled || !hasMounted || prefersReducedMotion === true;

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || prefersReducedMotion || event.pointerType !== "mouse") {
        return;
      }

      const element = elementRef.current;
      if (!element) return;

      const bounds = element.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;

      const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5;
      const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5;

      rotateX.set(-normalizedY * maxTilt);
      rotateY.set(normalizedX * maxTilt);
    },
    [disabled, maxTilt, prefersReducedMotion, rotateX, rotateY],
  );

  return (
    <motion.div
      ref={elementRef}
      className={cn("solar-depth", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetDepth}
      onPointerCancel={resetDepth}
      style={{
        rotateX: depthIsDisabled ? 0 : rotateX,
        rotateY: depthIsDisabled ? 0 : rotateY,
        transformPerspective: depthIsDisabled ? 0 : 1400,
        translateZ: depthIsDisabled ? 0 : lift,
      }}
    >
      {children}
    </motion.div>
  );
}
