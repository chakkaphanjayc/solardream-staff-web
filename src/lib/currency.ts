import currency from "currency.js";

export type CurrencyCode = "THB" | "USD" | "EUR" | "JPY" | "GBP" | "CNY";

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
  rateFromTHB: number;
  precision: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  THB: { code: "THB", symbol: "฿", name: "Thai Baht (บาท)", flag: "🇹🇭", rateFromTHB: 1.0, precision: 0 },
  USD: { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", rateFromTHB: 0.028, precision: 0 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", rateFromTHB: 0.026, precision: 0 },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵", rateFromTHB: 4.35, precision: 0 },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧", rateFromTHB: 0.022, precision: 0 },
  CNY: { code: "CNY", symbol: "¥", name: "Chinese Yuan", flag: "🇨🇳", rateFromTHB: 0.20, precision: 0 },
};

export function convertFromTHB(amountInTHB: number, targetCurrency: CurrencyCode = "THB") {
  const config = CURRENCIES[targetCurrency] || CURRENCIES.THB;
  const safeAmount = Number.isNaN(amountInTHB) || amountInTHB === null || amountInTHB === undefined ? 0 : Number(amountInTHB);
  const convertedAmount = safeAmount * config.rateFromTHB;
  return currency(convertedAmount, {
    symbol: config.symbol,
    precision: config.precision,
    separator: ",",
  });
}

export function formatTHBToTargetCurrency(amountInTHB: number, targetCurrency: CurrencyCode = "THB"): string {
  const config = CURRENCIES[targetCurrency] || CURRENCIES.THB;
  const c = convertFromTHB(amountInTHB, targetCurrency);
  return `${config.symbol}${c.format({ symbol: "" })}`;
}
