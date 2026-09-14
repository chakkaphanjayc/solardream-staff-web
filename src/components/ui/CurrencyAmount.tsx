"use client";

import React, { useEffect, useState } from "react";
import { useCurrencyStore } from "@/store/useCurrencyStore";

type CurrencyAmountProps = {
  amount: number | string;
  className?: string;
  prefix?: string;
  suffix?: string;
};

export default function CurrencyAmount({
  amount,
  className,
  prefix = "",
  suffix = "",
}: CurrencyAmountProps) {
  const currency = useCurrencyStore((state) => state.currency);
  const formatCurrency = useCurrencyStore((state) => state.formatCurrency);
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);

    function handleCurrencyEvent() {
      setTick((t) => t + 1);
    }

    window.addEventListener("solardream:currency-changed", handleCurrencyEvent);
    return () => {
      window.removeEventListener("solardream:currency-changed", handleCurrencyEvent);
    };
  }, []);

  const numericAmount = typeof amount === "number" ? amount : Number(String(amount || 0).replace(/,/g, ""));
  const safeNumeric = Number.isFinite(numericAmount) ? numericAmount : 0;

  const formatted = mounted
    ? formatCurrency(safeNumeric)
    : `${currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "JPY" ? "¥" : "฿"}${safeNumeric.toLocaleString()}`;

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
