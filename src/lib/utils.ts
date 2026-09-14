import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useCurrencyStore } from "@/store/useCurrencyStore";
import { CurrencyCode, formatTHBToTargetCurrency } from "@/lib/currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, overrideCurrency?: CurrencyCode) {
  const safePrice = Number.isNaN(price) || price === null || price === undefined ? 0 : Number(price);
  
  if (overrideCurrency) {
    return formatTHBToTargetCurrency(safePrice, overrideCurrency);
  }

  try {
    const currentCurrency = useCurrencyStore.getState().currency;
    return formatTHBToTargetCurrency(safePrice, currentCurrency);
  } catch {
    return formatTHBToTargetCurrency(safePrice, "THB");
  }
}

export function useFormattedPrice() {
  const currency = useCurrencyStore((state) => state.currency);
  return (price: number, overrideCurrency?: CurrencyCode) => {
    return formatPrice(price, overrideCurrency || currency);
  };
}
