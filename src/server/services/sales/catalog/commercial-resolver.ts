import type {
  CommercialLine,
  Money,
  ResolvedCommercials,
} from "./catalog-dtos";
export class CommercialResolutionError extends Error {
  constructor(
    readonly code: "INVALID_AMOUNT" | "INVALID_QUANTITY" | "CURRENCY_MISMATCH",
    message: string,
  ) {
    super(message);
  }
}
export function decimalToMinorUnits(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new CommercialResolutionError(
      "INVALID_AMOUNT",
      "Amount must be a non-negative decimal with at most two fractional digits.",
    );
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result))
    throw new CommercialResolutionError(
      "INVALID_AMOUNT",
      "Amount is outside the supported range.",
    );
  return result;
}
const money = (currency: string, minorUnits: number): Money => ({
  currency,
  minorUnits,
});
export function resolveCommercials(input: {
  catalogVersion: ResolvedCommercials["catalogVersion"];
  priceList: ResolvedCommercials["priceList"];
  taxPolicy: ResolvedCommercials["taxPolicy"];
  discountMinor?: number;
  lines: readonly {
    itemId: string;
    quantity: number;
    amount: string;
    currency: string;
  }[];
}): ResolvedCommercials {
  const currency = input.priceList.currency;
  let subtotalMinor = 0,
    taxMinor = 0;
  const lines: CommercialLine[] = input.lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      throw new CommercialResolutionError(
        "INVALID_QUANTITY",
        "Quantity must be a positive integer.",
      );
    if (line.currency !== currency)
      throw new CommercialResolutionError(
        "CURRENCY_MISMATCH",
        "All prices must use the price-list currency.",
      );
    const unit = decimalToMinorUnits(line.amount),
      subtotal = unit * line.quantity;
    const rate = input.taxPolicy ? Number(input.taxPolicy.rate) : 0;
    const tax =
      input.taxPolicy?.mode === "EXCLUSIVE"
        ? Math.round(subtotal * rate)
        : input.taxPolicy?.mode === "INCLUSIVE"
          ? subtotal - Math.round(subtotal / (1 + rate))
          : 0;
    subtotalMinor += subtotal;
    taxMinor += tax;
    return {
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: money(currency, unit),
      subtotal: money(currency, subtotal),
      tax: money(currency, tax),
      total: money(
        currency,
        input.taxPolicy?.mode === "EXCLUSIVE" ? subtotal + tax : subtotal,
      ),
    };
  });
  const discount = input.discountMinor ?? 0;
  if (
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    discount > subtotalMinor
  )
    throw new CommercialResolutionError(
      "INVALID_AMOUNT",
      "Discount is invalid.",
    );
  const total =
    subtotalMinor -
    discount +
    (input.taxPolicy?.mode === "EXCLUSIVE" ? taxMinor : 0);
  return {
    catalogVersion: input.catalogVersion,
    priceList: input.priceList,
    taxPolicy: input.taxPolicy,
    lines,
    subtotal: money(currency, subtotalMinor),
    discount: money(currency, discount),
    tax: money(currency, taxMinor),
    total: money(currency, total),
  };
}
