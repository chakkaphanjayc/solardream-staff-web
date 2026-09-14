"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { cn } from "@/lib/utils";
import { getTurnstileSiteKey } from "@/lib/turnstile-config";

export type InvisibleTurnstileHandle = {
  getToken: () => Promise<string>;
  reset: () => void;
};

type InvisibleTurnstileProps = {
  action: string;
  className?: string;
  onVerify?: (token: string | null) => void;
};

const SITE_KEY = getTurnstileSiteKey();

const InvisibleTurnstile = forwardRef<
  InvisibleTurnstileHandle,
  InvisibleTurnstileProps
>(function InvisibleTurnstile({ action, className, onVerify }, ref) {
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [visibleFallback, setVisibleFallback] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) onVerify?.("development-turnstile-disabled");
  }, [onVerify]);

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!SITE_KEY) return "development-turnstile-disabled";
      const existingToken = turnstileRef.current?.getResponse();
      if (existingToken) return existingToken;
      turnstileRef.current?.execute();
      const token = await turnstileRef.current?.getResponsePromise(30_000);
      if (!token) throw new Error("Security check did not return a token.");
      return token;
    },
    reset() {
      onVerify?.(null);
      turnstileRef.current?.reset();
      window.setTimeout(() => turnstileRef.current?.execute(), 150);
    },
  }), [onVerify]);

  if (!SITE_KEY) return null;

  return (
    <div className={cn("mt-3", className)}>
      <Turnstile
        ref={turnstileRef}
        siteKey={SITE_KEY}
        data-action="turnstile-spin-v2"
        options={{
          action,
          appearance: visibleFallback ? "always" : "execute",
          execution: visibleFallback ? "render" : "execute",
          size: visibleFallback ? "normal" : "invisible",
          theme: "light",
        }}
        onError={() => setVisibleFallback(true)}
        onTimeout={() => setVisibleFallback(true)}
        onWidgetLoad={() => {
          if (!visibleFallback) {
            window.setTimeout(() => turnstileRef.current?.execute(), 150);
          }
        }}
        onExpire={() => {
          onVerify?.(null);
          turnstileRef.current?.reset();
          window.setTimeout(() => turnstileRef.current?.execute(), 150);
        }}
        onSuccess={(token) => onVerify?.(token)}
      />
    </div>
  );
});

export default InvisibleTurnstile;
