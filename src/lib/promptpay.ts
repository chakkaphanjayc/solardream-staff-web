import generatePayload from "promptpay-qr";

const DISALLOWED_PROMPTPAY_IDS = new Set([
  "0000000000000",
  "0999999999999",
]);

export function normalizePromptPayId(value: string | null | undefined) {
  return (value || "").replace(/[\s-]/g, "");
}

export function getConfiguredPromptPayId(
  rawValue = process.env.NEXT_PUBLIC_PROMPTPAY_ID,
) {
  const normalized = normalizePromptPayId(rawValue);
  if (!normalized || DISALLOWED_PROMPTPAY_IDS.has(normalized)) {
    return null;
  }
  return normalized;
}

export function buildPromptPayPayload(amount: number) {
  const promptpayId = getConfiguredPromptPayId();
  if (!promptpayId || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return generatePayload(promptpayId, { amount });
}
