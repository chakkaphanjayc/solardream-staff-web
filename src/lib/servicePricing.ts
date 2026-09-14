export type PricingLine = { key: string; unitSatang: number; quantity: number };
export function decimalToSatang(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Invalid monetary amount.");
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}
export function formulaPriceSatang(input: { basePrice: string; ratePerKwp: string; minimumPrice: string; loyaltyDiscount: string }, systemSizeKw: number, loyalty: boolean) {
  const milliKw = Math.round(systemSizeKw * 1000);
  const subtotal = decimalToSatang(input.basePrice) + Math.round(decimalToSatang(input.ratePerKwp) * milliKw / 1000);
  return Math.max(0, Math.max(subtotal, decimalToSatang(input.minimumPrice)) - (loyalty ? decimalToSatang(input.loyaltyDiscount) : 0));
}
export function basisPointDiscount(subtotalSatang: number, bps: number, cap: number | null = null) {
  const discount = Math.round(subtotalSatang * bps / 10000);
  return Math.min(subtotalSatang, cap === null ? discount : Math.min(discount, cap));
}
export function eligibleBundleOfferingIds(selectedOfferingIds: string[], restrictedOfferingIds: string[], minimumDistinctItems: number) {
  const selected = new Set(selectedOfferingIds);
  const restrictions = new Set(restrictedOfferingIds);
  if (restrictions.size && ![...restrictions].every((id) => selected.has(id))) {
    return new Set<string>();
  }
  const eligible = selectedOfferingIds.filter(
    (id) => !restrictions.size || restrictions.has(id),
  );
  return new Set(new Set(eligible).size >= minimumDistinctItems ? eligible : []);
}
export function allocateDiscount(lines: PricingLine[], discountSatang: number) {
  const subtotals = lines.map((line) => line.unitSatang * line.quantity); const subtotal = subtotals.reduce((sum, value) => sum + value, 0);
  if (discountSatang < 0 || discountSatang > subtotal) throw new Error("Invalid discount allocation.");
  const allocated = subtotals.map((value, index) => ({ index, base: subtotal ? Math.floor(discountSatang * value / subtotal) : 0, remainder: subtotal ? (discountSatang * value) % subtotal : 0 }));
  let remaining = discountSatang - allocated.reduce((sum, item) => sum + item.base, 0);
  for (const item of [...allocated].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) { if (!remaining) break; item.base += 1; remaining -= 1; }
  return lines.map((line, index) => ({ ...line, subtotalSatang: subtotals[index], discountSatang: allocated[index].base, totalSatang: subtotals[index] - allocated[index].base }));
}

export function serviceInvoiceItemsMatch(actual: unknown, expected: Array<{ item_code: string; qty: number; rate: number; amount: number }>) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const normalize = (items: unknown[]) => items.flatMap((value) => { if (!value || typeof value !== "object" || Array.isArray(value)) return []; const item = value as Record<string, unknown>; const itemCode = typeof item.item_code === "string" ? item.item_code.trim() : ""; const qty = Number(item.qty); const rateSatang = Math.round(Number(item.rate) * 100); const amountSatang = Math.round(Number(item.amount) * 100); return itemCode && Number.isFinite(qty) && Number.isFinite(rateSatang) && Number.isFinite(amountSatang) ? [{ itemCode, qty, rateSatang, amountSatang }] : []; }).sort((a, b) => a.itemCode.localeCompare(b.itemCode) || a.rateSatang - b.rateSatang || a.amountSatang - b.amountSatang);
  const left = normalize(actual); const right = normalize(expected);
  return left.length === expected.length && right.length === expected.length && left.every((item, index) => item.itemCode === right[index].itemCode && item.qty === right[index].qty && item.rateSatang === right[index].rateSatang && item.amountSatang === right[index].amountSatang);
}
