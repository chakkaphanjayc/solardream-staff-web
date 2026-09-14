"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

type RevealProps = HTMLMotionProps<"div">;

export function Reveal({ children, transition, ...props }: RevealProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      {...props}
      initial={prefersReducedMotion !== false ? false : { opacity: 0, y: 20, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.18 }}
      transition={
        transition ??
        (prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.7, ease: [0.22, 1, 0.36, 1] })
      }
    >
      {children}
    </motion.div>
  );
}

export const Motion = motion;
