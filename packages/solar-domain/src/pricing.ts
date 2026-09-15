export type PricingTier = "budget" | "balance" | "premium";
export type SupportedPhase = 1 | 3;

export const CONTACT_FOR_PRICING_TEXT = "ติดต่อสอบถามเพิ่มเติม";

export const PRICING_MATRIX: Record<number, Partial<Record<SupportedPhase, Record<PricingTier, number>>>> = {
  5: {
    1: { budget: 150_000, balance: 157_000, premium: 165_000 },
    3: { budget: 160_000, balance: 167_000, premium: 175_000 },
  },
  10: { 3: { budget: 250_000, balance: 260_000, premium: 270_000 } },
  20: { 3: { budget: 340_000, balance: 355_000, premium: 370_000 } },
};

export type SystemPriceQuote = { amount: number | null; label: string; isContactRequired: boolean };

const PRICE_FORMATTER = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const MIN_MATRIX_CAPACITY_KW = 5;
const MAX_MATRIX_CAPACITY_KW = 20;

export function normalizePricingTier(tier: string): PricingTier {
  const normalized = tier.toLowerCase();
  if (normalized === "value" || normalized === "budget") return "budget";
  if (normalized === "balanced" || normalized === "balance" || normalized === "standard") return "balance";
  return "premium";
}

export function normalizePhase(phase: number | string): SupportedPhase {
  return String(phase).toLowerCase().includes("3") ? 3 : 1;
}

export function getSystemPriceQuote(capacity: number, phase: number | string, tier: string): SystemPriceQuote {
  const normalizedCapacity = Number(capacity);
  const normalizedPhase = normalizePhase(phase);
  const normalizedTier = normalizePricingTier(tier);

  if (!Number.isFinite(normalizedCapacity) || normalizedCapacity < MIN_MATRIX_CAPACITY_KW || normalizedCapacity > MAX_MATRIX_CAPACITY_KW) {
    return { amount: null, label: CONTACT_FOR_PRICING_TEXT, isContactRequired: true };
  }

  const amount = resolveMatrixAmount(normalizedCapacity, normalizedPhase, normalizedTier);
  if (typeof amount !== "number") return { amount: null, label: CONTACT_FOR_PRICING_TEXT, isContactRequired: true };
  return { amount, label: PRICE_FORMATTER.format(amount), isContactRequired: false };
}

function resolveMatrixAmount(capacity: number, phase: SupportedPhase, tier: PricingTier): number | null {
  const exactAmount = PRICING_MATRIX[capacity]?.[phase]?.[tier];
  if (typeof exactAmount === "number") return exactAmount;

  const p3Points = Object.entries(PRICING_MATRIX)
    .map(([capacityKey, phasePrices]) => {
      const pointCapacity = Number(capacityKey);
      const amount = phasePrices[3]?.[tier];
      return typeof amount === "number" ? { capacity: pointCapacity, amount } : null;
    })
    .filter((point): point is { capacity: number; amount: number } => Boolean(point))
    .sort((a, b) => a.capacity - b.capacity);
  const lowerPoint = [...p3Points].reverse().find((point) => point.capacity <= capacity);
  const upperPoint = p3Points.find((point) => point.capacity >= capacity);
  if (!lowerPoint || !upperPoint) return null;

  const baseAmount = lowerPoint.capacity === upperPoint.capacity
    ? lowerPoint.amount
    : lowerPoint.amount + (upperPoint.amount - lowerPoint.amount) * ((capacity - lowerPoint.capacity) / (upperPoint.capacity - lowerPoint.capacity));
  if (phase === 3) return Math.round(baseAmount / 1000) * 1000;

  const p1Lower = PRICING_MATRIX[lowerPoint.capacity]?.[1]?.[tier];
  const phaseDelta = typeof p1Lower === "number" ? lowerPoint.amount - p1Lower : 10_000;
  return Math.round((baseAmount - phaseDelta) / 1000) * 1000;
}

export function formatSystemPrice(capacity: number, phase: number | string, tier: string) {
  return getSystemPriceQuote(capacity, phase, tier).label;
}

export function formatStartingSystemPrice(capacity: number, phase: number | string, tier: string) {
  const quote = getSystemPriceQuote(capacity, phase, tier);
  return quote.isContactRequired ? quote.label : `เริ่มต้น ${quote.label}`;
}
