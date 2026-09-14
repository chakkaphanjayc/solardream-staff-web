"use client";

import { useCurrencyStore } from "@/store/useCurrencyStore";
import { CURRENCIES, CurrencyCode } from "@/lib/currency";
import { ChevronDown } from "@/components/ui/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function CurrencySwitcher({ className }: { className?: string }) {
  const t = useTranslations("CurrencySwitcher");
  const { currency, setCurrency } = useCurrencyStore();
  const [open, setOpen] = useState(false);

  const active = CURRENCIES[currency] || CURRENCIES.THB;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-3.5 text-xs font-semibold text-[#2E2C27] transition-colors hover:bg-[#E6E3DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2"
            title={t("switchCurrency")}
          >
            <span className="text-sm">{active.flag}</span>
            <span className="font-mono font-bold">{active.code}</span>
            <ChevronDown className={cn("h-3 w-3 text-[#4E4B44] transition-transform duration-200", open && "rotate-180")} />
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-48 rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-2 shadow-lg">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4E4B44] border-b border-[#F7F6F3]">
            {t("selectCurrency")}
          </div>
          <div className="py-1 space-y-0.5">
            {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => {
              const item = CURRENCIES[code];
              const isSelected = code === currency;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setCurrency(code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center justify-between rounded-full px-3 py-2 text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-[#DCE8F5] text-[#2E2C27] font-bold"
                      : "text-[#4E4B44] hover:bg-[#E6E3DC] hover:text-[#2E2C27]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{item.flag}</span>
                    <span className="font-mono font-semibold">{item.code}</span>
                  </div>
                  <span className="text-[11px] text-[#4E4B44]">{item.symbol.trim()}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
