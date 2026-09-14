import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-bagui="textarea"
      className={cn(
        "flex min-h-28 w-full resize-y rounded-xl border border-[#4F7FA8]/22 bg-white/65 px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground backdrop-blur-lg focus-visible:border-[#4F7FA8] focus-visible:bg-white/85 focus-visible:ring-2 focus-visible:ring-[#B7D1EA]/45 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
