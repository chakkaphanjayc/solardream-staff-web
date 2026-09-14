"use client";

import { useRef, useEffect, useState, useSyncExternalStore } from "react";
import { motion, useInView, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type SplitTextProps = Readonly<{
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  transition?: Transition;
  as?: React.ElementType;
  highlightWords?: Record<string, string>;
}>;

export default function SplitText({
  text,
  className,
  delay = 0.2,
  stagger = 0.035,
  transition = {
    type: "spring",
    stiffness: 300,
    damping: 15,
  },
  as: Component = "h1",
}: SplitTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-20px" });
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
  }, []);

  const letters = text.split("");

  if (!mounted) {
    return <Component className={className}>{text}</Component>;
  }

  return (
    <Component
      ref={ref as any}
      className={cn("inline-flex flex-wrap select-none", className)}
      aria-label={text}
    >
      {letters.map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          className="inline-block"
          initial={
            reducedMotion
              ? { opacity: 1, y: 0 }
              : { y: -36, opacity: 0, scale: 0.85 }
          }
          animate={
            isInView
              ? { y: 0, opacity: 1, scale: 1 }
              : { y: -36, opacity: 0, scale: 0.85 }
          }
          transition={{
            ...transition,
            delay: delay + index * stagger,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </Component>
  );
}
