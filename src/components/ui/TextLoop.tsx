"use client";

import { useState, useEffect, Children, type ReactNode } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";

export type TextLoopProps = {
  children?: ReactNode[];
  items?: string[];
  interval?: number; // in seconds
  transition?: Transition;
  className?: string;
  direction?: "up" | "down";
  pauseOnHover?: boolean;
  onIndexChange?: (index: number) => void;
};

export function TextLoop({
  children,
  items,
  interval = 3.5,
  transition = { duration: 0.35, ease: [0.32, 0.72, 0, 1] },
  className = "",
  direction = "up",
  pauseOnHover = true,
  onIndexChange,
}: TextLoopProps) {
  const elements = items ? items : Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const total = elements.length;

  useEffect(() => {
    if (total <= 1 || (pauseOnHover && isHovered)) return;

    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % total;
        onIndexChange?.(next);
        return next;
      });
    }, interval * 1000);

    return () => clearInterval(timer);
  }, [total, interval, pauseOnHover, isHovered, onIndexChange]);

  if (total === 0) return null;

  const yVariants = {
    initial: {
      y: direction === "up" ? 18 : -18,
      opacity: 0,
      filter: "blur(4px)",
    },
    animate: {
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
    },
    exit: {
      y: direction === "up" ? -18 : 18,
      opacity: 0,
      filter: "blur(4px)",
    },
  };

  return (
    <div
      className={`relative inline-flex items-center overflow-hidden py-0.5 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          variants={yVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
          className="inline-flex items-center gap-2 whitespace-nowrap"
        >
          {elements[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default TextLoop;
