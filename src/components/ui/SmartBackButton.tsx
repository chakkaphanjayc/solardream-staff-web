"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SmartBackButtonProps {
  /**
   * The fallback URL to navigate to when there is no browser history
   * (e.g. user opened a direct link in a new tab).
   */
  fallbackHref: string;
  /**
   * Optional text label displayed next to the icon (default: "Back").
   */
  label?: string;
  /**
   * Optional custom CSS classes.
   */
  className?: string;
  /**
   * Optional ARIA label for screen readers.
   */
  ariaLabel?: string;
}

export default function SmartBackButton({
  fallbackHref,
  label = "Back",
  className,
  ariaLabel,
}: SmartBackButtonProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (typeof window !== "undefined" && window.history.length > 2) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      aria-label={ariaLabel || label}
      className={cn(
        "group rounded-full border-slate-200/80 bg-white/70 font-bold text-slate-600 shadow-xs backdrop-blur-md hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:ring-[#B7D1EA]",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 transition-transform duration-300 ease-expo-out group-hover:-translate-x-1" />
      {label ? <span>{label}</span> : null}
    </Button>
  );
}
