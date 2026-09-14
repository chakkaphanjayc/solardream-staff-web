import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "sd-action inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold leading-none transition-[background-color,border-color,box-shadow,transform] duration-200 ease-expo-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CA8D0]/45 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-95",
  {
    variants: {
      variant: {
        primary: "border border-[#7CA8D0] bg-[#B7D1EA] text-[#142533] shadow-[0_2px_8px_rgba(28,28,26,0.1)] hover:bg-[#A5C2DE] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(28,28,26,0.12)]",
        secondary: "border border-[#8E8B83] bg-[#E6E3DC] text-[#1C1C1A] shadow-[0_1px_3px_rgba(28,28,26,0.1)] hover:bg-[#DDD9D0] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(28,28,26,0.1)]",
        tonal: "border border-[#7CA8D0] bg-[#DCE8F5] text-[#0E2336] shadow-[0_1px_3px_rgba(28,28,26,0.1)] hover:bg-[#B7D1EA] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(28,28,26,0.1)]",
        outline: "border border-[#8E8B83] bg-[#F7F6F3] text-[#1C1C1A] shadow-[0_1px_3px_rgba(28,28,26,0.08)] hover:bg-[#E6E3DC] hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(28,28,26,0.1)]",
        quiet: "border border-transparent bg-transparent text-[#4E4B44] hover:border-[#CBC7BE] hover:bg-[#F7F6F3] hover:text-[#1C1C1A]",
        destructive: "border border-rose-700/35 bg-rose-600 text-white shadow-[0_10px_28px_-18px_rgba(127,29,29,0.58)] hover:bg-rose-700 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-18px_rgba(127,29,29,0.62)]",
        link: "h-auto min-h-0 rounded-md px-1 py-1 text-slate-900 underline-offset-4 hover:underline",
      },
      size: {
        sm: "min-h-9 rounded-full px-3.5 text-xs",
        default: "min-h-11",
        lg: "min-h-12 px-6 text-base",
        icon: "h-11 w-11 min-h-11 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const resolvedVariant = variant ?? "primary";
    const isGlassControl =
      resolvedVariant === "secondary" ||
      resolvedVariant === "outline";

    return (
      <Comp
        data-bagui="button"
        data-button-variant={resolvedVariant}
        data-liquid-glass={
          isGlassControl
            ? "control"
            : resolvedVariant === "quiet"
              ? "quiet"
              : "solid"
        }
        className={cn(buttonVariants({ variant: resolvedVariant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
