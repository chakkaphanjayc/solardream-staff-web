import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  variant?: "filled" | "pill";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "filled", ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      data-bagui="input"
      className={cn(
        variant === "pill"
          ? "sd-control flex min-h-12 w-full rounded-full border border-[#8E8B83] bg-[#F0EEE9] px-5 py-2.5 text-sm font-medium text-[#1C1C1A] placeholder:text-[#4E4B44] outline-none transition-all duration-300 focus:border-[#7CA8D0] focus:ring-2 focus:ring-[#B7D1EA]/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          : "sd-control flex min-h-13 w-full rounded-t-xl rounded-b-none border-0 border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-sm font-medium text-[#1C1C1A] placeholder:text-[#4E4B44] outline-none transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] focus:border-[#7CA8D0] focus:bg-[#DDD9D0] focus:ring-0 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
