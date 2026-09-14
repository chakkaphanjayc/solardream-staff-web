"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Search } from "@/components/ui/icons";

export default function SearchTrigger() {
  const t = useTranslations("AdminShell");
  const handleOpen = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-command-palette"));
    }
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="group flex min-h-9 max-w-[13rem] items-center gap-2 rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 text-xs font-medium text-[#8b949e] transition-colors hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] sm:min-w-48"
      aria-label={t("searchConsole")}
    >
      <Search className="size-3.5 shrink-0 text-[#8b949e]" aria-hidden="true" />
      <span className="truncate">{t("searchConsole")}</span>
      <kbd className="pointer-events-none ml-auto inline-flex h-5 shrink-0 select-none items-center gap-0.5 rounded border border-[#30363d] bg-[#161b22] px-1.5 font-mono text-[9px] font-semibold text-[#8b949e]">
        ⌘K
      </kbd>
    </button>
  );
}
