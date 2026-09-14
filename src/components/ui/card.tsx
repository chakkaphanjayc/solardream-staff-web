import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  interactive?: boolean;
  tone?: "default" | "subtle" | "dark" | "accent";
}

const cardToneClasses: Record<NonNullable<CardProps["tone"]>, string> = {
  default:
    "border border-[#CBC7BE] bg-[#E6E3DC] text-[#1C1C1A] shadow-[0_2px_8px_rgba(28,28,26,0.08)]",
  subtle:
    "border border-[#CBC7BE] bg-[#F7F6F3] text-[#1C1C1A] shadow-[0_1px_3px_rgba(28,28,26,0.08)]",
  dark:
    "border border-[#30363D] bg-[#161B22] text-[#F0F6FC] shadow-sm",
  accent:
    "border border-[#7CA8D0] bg-[#DCE8F5] text-[#0E2336] shadow-[0_2px_8px_rgba(28,28,26,0.08)]",
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ asChild = false, className, interactive = false, tone = "default", ...props }, ref) => {
    const Comp = asChild ? Slot : "div";

    return (
      <Comp
        ref={ref}
        data-bagui="card"
        data-md-surface="card"
        data-liquid-glass={tone === "dark" ? "dark" : "surface"}
        className={cn(
          "sd-surface rounded-2xl text-sm transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          cardToneClasses[tone],
          interactive &&
            "cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99]",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 p-6 sm:p-8", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-xl font-bold leading-tight tracking-tight text-[#1C1C1A]", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm leading-6 text-[#4E4B44]", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0 sm:p-8 sm:pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0 sm:p-8 sm:pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
