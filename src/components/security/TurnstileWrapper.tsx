"use client";

import { useCallback, useEffect, useRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getTurnstileSiteKey } from "@/lib/turnstile-config";

type TurnstileWrapperProps = {
  action: string;
  className?: string;
  onTokenChange: (token: string | null) => void;
};

const SITE_KEY = getTurnstileSiteKey();

export default function TurnstileWrapper({
  action,
  className,
  onTokenChange,
}: TurnstileWrapperProps) {
  const turnstileRef = useRef<TurnstileInstance>(null);

  useEffect(() => {
    if (!SITE_KEY) onTokenChange("development-turnstile-disabled");
  }, [onTokenChange]);

  const resetChallenge = useCallback((message: string) => {
    onTokenChange(null);
    toast.error(message);
    turnstileRef.current?.reset();
  }, [onTokenChange]);

  if (!SITE_KEY) return null;

  return (
    <div className={cn("min-h-[65px]", className)}>
      <Turnstile
        ref={turnstileRef}
        siteKey={SITE_KEY}
        options={{
          action,
          appearance: "always",
          execution: "render",
          size: "normal",
          theme: "light",
        }}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={() => resetChallenge("Security check expired. Please try again.")}
        onTimeout={() => resetChallenge("Security check timed out. Please try again.")}
        onError={() => resetChallenge("Security check failed. Please try again.")}
      />
    </div>
  );
}
