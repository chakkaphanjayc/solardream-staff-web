"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

export default function PageWrapper({ children, className = "" }: PageWrapperProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      data-bagui="motion-page"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn("min-w-0", className)}
    >
      {children}
    </motion.div>
  );
}
