"use client";

import { useCallback, useEffect, useState } from "react";

type LineLiffMessage = Record<string, unknown>;

type LineLiffClient = {
  init: (options: { liffId: string }) => Promise<void>;
  isInClient?: () => boolean;
  isLoggedIn?: () => boolean;
  getProfile?: () => Promise<LineProfile>;
  sendMessages: (messages: LineLiffMessage[]) => Promise<void>;
  login: (options?: { redirectUri?: string }) => void;
};

declare global {
  interface Window {
    liff?: LineLiffClient;
  }
}

type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

type LiffState = {
  ready: boolean;
  inClient: boolean;
  loggedIn: boolean;
  profile: LineProfile | null;
  error: string | null;
  liff: LineLiffClient | null;
};

const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";
let liffSdkPromise: Promise<LineLiffClient | null> | null = null;

function loadLiffSdk(): Promise<LineLiffClient | null> {
    if (typeof window === "undefined") {
      return Promise.resolve(null);
    }

    if (window.liff) {
      return Promise.resolve(window.liff);
    }

    if (liffSdkPromise) return liffSdkPromise;

    liffSdkPromise = new Promise((resolve) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[src="${LIFF_SDK_URL}"]`,
      );
      const script = existingScript ?? document.createElement("script");

      const handleLoad = () => {
        liffSdkPromise = null;
        resolve(window.liff || null);
      };
      const handleError = () => {
        liffSdkPromise = null;
        resolve(null);
      };

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });

      if (!existingScript) {
        script.src = LIFF_SDK_URL;
        script.async = true;
        document.head.appendChild(script);
      }
    });

    return liffSdkPromise;
}

export function useLineLiff() {
  const [state, setState] = useState<LiffState>({
    ready: false,
    inClient: false,
    loggedIn: false,
    profile: null,
    error: null,
    liff: null,
  });

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim();
    let active = true;

    async function init() {
      if (!liffId) {
        setState({
          ready: true,
          inClient: false,
          loggedIn: false,
          profile: null,
          error: "LINE LIFF ID is not configured.",
          liff: null,
        });
        return;
      }

      const liff = await loadLiffSdk();
      if (!active) return;

      if (!liff) {
        setState({
          ready: true,
          inClient: false,
          loggedIn: false,
          profile: null,
          error: "Unable to load LINE LIFF SDK.",
          liff: null,
        });
        return;
      }

      try {
        await liff.init({ liffId });
        const inClient = Boolean(liff.isInClient?.());
        const loggedIn = Boolean(liff.isLoggedIn?.());

        let profile: LineProfile | null = null;
        if (loggedIn && typeof liff.getProfile === "function") {
          try {
            profile = await liff.getProfile();
          } catch (error) {
            console.error("[LIFF] Failed to fetch profile:", error);
          }
        }

        setState({
          ready: true,
          inClient,
          loggedIn,
          profile,
          error: null,
          liff,
        });
      } catch (error) {
        console.error("[LIFF] init failed:", error);
        setState({
          ready: true,
          inClient: false,
          loggedIn: false,
          profile: null,
          error: error instanceof Error ? error.message : "LIFF initialization failed.",
          liff: null,
        });
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  const shareMessages = useCallback(
    async (messages: LineLiffMessage[]) => {
      if (!state.ready || !state.inClient || !state.liff) {
        return { success: false, error: "LIFF is not ready." };
      }

      if (!state.loggedIn) {
        return { success: false, error: "LINE login is required." };
      }

      try {
        await state.liff.sendMessages(messages);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to send LINE messages.",
        };
      }
    },
    [state],
  );

  const login = useCallback(() => {
    if (!state.liff) return;
    state.liff.login({ redirectUri: window.location.href });
  }, [state.liff]);

  return {
    ...state,
    shareMessages,
    login,
  };
}
