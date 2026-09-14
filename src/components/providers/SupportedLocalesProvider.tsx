"use client";

import { createContext, useContext } from "react";
import { locales, type Locale } from "@/i18n/locales";

const SupportedLocalesContext = createContext<readonly Locale[]>(locales);

export function SupportedLocalesProvider({
  children,
  supportedLocales,
}: {
  children: React.ReactNode;
  supportedLocales: readonly Locale[];
}) {
  return (
    <SupportedLocalesContext.Provider value={supportedLocales}>
      {children}
    </SupportedLocalesContext.Provider>
  );
}

export function useSupportedLocales() {
  return useContext(SupportedLocalesContext);
}
