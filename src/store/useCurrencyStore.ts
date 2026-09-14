import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CurrencyCode, CURRENCIES, formatTHBToTargetCurrency, convertFromTHB } from "@/lib/currency";

interface CurrencyState {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  formatCurrency: (amountInTHB: number) => string;
  convert: (amountInTHB: number) => number;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      currency: "THB",
      setCurrency: (currency: CurrencyCode) => {
        if (CURRENCIES[currency]) {
          set({ currency });
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("solardream:currency-changed", { detail: currency }));
          }
        }
      },
      formatCurrency: (amountInTHB: number) => formatTHBToTargetCurrency(amountInTHB, get().currency),
      convert: (amountInTHB: number) => convertFromTHB(amountInTHB, get().currency).value,
    }),
    {
      name: "solardream-currency-pref",
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("solardream:currency-changed", { detail: state.currency }));
        }
      },
    }
  )
);
