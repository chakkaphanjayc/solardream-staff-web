import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-wide leading-none transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-[#DCE8F5] text-[#2E2C27]",
        primary: "border-transparent bg-[#DCE8F5] text-[#0E2336]",
        success: "border-transparent bg-[#C4EED0] text-[#072711]",
        warning: "border-transparent bg-[#FFE2A4] text-[#291B00]",
        danger: "border-transparent bg-[#FFDAD6] text-[#410002]",
        info: "border-transparent bg-[#D0E4FF] text-[#001D36]",
        dark: "border-transparent bg-[#1C1C1A] text-[#F0EEE9]",
        outline: "border-[#8E8B83] bg-transparent text-[#4F7FA8]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-bagui="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
