"use client";

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

type MagneticButtonProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  children: React.ReactNode;
  className?: string;
  range?: number;
  strength?: number;
};

export default function MagneticButton({
  children,
  className = "",
  range = 80,
  strength = 0.35,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setShouldReduceMotion(media.matches);

    handleChange();
    media.addEventListener("change", handleChange);

    return () => media.removeEventListener("change", handleChange);
  }, []);

  // quickTo setters — created lazily on first mouse move
  const quickXInner = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const quickYInner = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const quickXText = useRef<ReturnType<typeof gsap.quickTo> | null>(null);
  const quickYText = useRef<ReturnType<typeof gsap.quickTo> | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion || !ref.current) return;
    const { clientX, clientY } = e;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const distanceX = clientX - centerX;
    const distanceY = clientY - centerY;

    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
    if (distance < range) {
      const pullFactor = (1 - distance / range) * strength;

      // Lazy-initialise quickTo setters once the element exists
      if (innerRef.current) {
        if (!quickXInner.current) {
          quickXInner.current = gsap.quickTo(innerRef.current, "x", { duration: 0.28, ease: "power3.out" });
          quickYInner.current = gsap.quickTo(innerRef.current, "y", { duration: 0.28, ease: "power3.out" });
        }
        quickXInner.current(distanceX * pullFactor);
        quickYInner.current?.(distanceY * pullFactor);
      }

      if (textRef.current) {
        if (!quickXText.current) {
          quickXText.current = gsap.quickTo(textRef.current, "x", { duration: 0.28, ease: "power3.out" });
          quickYText.current = gsap.quickTo(textRef.current, "y", { duration: 0.28, ease: "power3.out" });
        }
        quickXText.current(distanceX * pullFactor * 0.4);
        quickYText.current?.(distanceY * pullFactor * 0.4);
      }
    } else {
      resetValues();
    }
  };

  const handleMouseLeave = () => {
    resetValues();
  };

  const resetValues = () => {
    const targets = [innerRef.current, textRef.current].filter((el): el is HTMLElement => el !== null);
    if (targets.length > 0) {
      gsap.to(targets, {
        x: 0,
        y: 0,
        duration: shouldReduceMotion ? 0.01 : 0.45,
        ease: "elastic.out(1, 0.5)",
      });
    }
  };

  // If children is a valid React element, we can clone it and inject the style
  const renderChildren = () => {
    if (shouldReduceMotion) {
      return children;
    }

    if (React.isValidElement(children)) {
      const child = children as React.ReactElement<{ children?: React.ReactNode }>;
      
      return (
        <div ref={innerRef} className="w-full h-full flex items-center justify-center">
          {React.cloneElement(
            child,
            {
              ...child.props,
            },
            <span
              ref={textRef}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "inherit",
                width: "100%",
                height: "100%",
              }}
            >
              {child.props.children}
            </span>
          )}
        </div>
      );
    }
    return children;
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative p-8 -m-8 flex items-center justify-center ${className}`}
      {...props}
    >
      {renderChildren()}
    </div>
  );
}
