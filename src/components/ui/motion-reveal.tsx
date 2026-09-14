"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

type MotionRevealProps = HTMLMotionProps<"div"> & {
  delay?: number;
};

export function MotionReveal({ className, delay = 0, children, ...props }: MotionRevealProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      data-bagui="motion-reveal"
      className={cn(className)}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.45, delay: prefersReducedMotion ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
