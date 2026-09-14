export function isProcessingLeaseStale(updatedAt: Date, now = new Date(), leaseSeconds = 300) {
  if (!Number.isFinite(updatedAt.getTime()) || !Number.isFinite(now.getTime()) || leaseSeconds <= 0) return true;
  return updatedAt.getTime() <= now.getTime() - leaseSeconds * 1000;
}
