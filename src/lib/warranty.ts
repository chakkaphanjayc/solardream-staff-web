const DAY_MS = 24 * 60 * 60 * 1000;

export function getWarrantyState(purchaseDate: string | Date, warrantyDays: number, now: Date = new Date()) {
  const purchasedAt = purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate);
  const expiryDate = new Date(purchasedAt.getTime() + warrantyDays * DAY_MS);
  const remainingDays = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / DAY_MS));
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - purchasedAt.getTime()) / DAY_MS));
  const progressPct = warrantyDays > 0
    ? Math.min(100, Math.max(0, ((warrantyDays - remainingDays) / warrantyDays) * 100))
    : 100;

  return {
    expiryDate,
    remainingDays,
    elapsedDays,
    progressPct,
    isExpired: remainingDays === 0,
  };
}
