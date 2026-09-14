export type LineWebhookCommand =
  | "account-link"
  | "order"
  | "installation"
  | "points"
  | "stock"
  | "promo";

export type LineWebhookKeywords = {
  order: string;
  quotation: string;
  installation: string;
  points: string;
  stock: string;
  promo: string;
  link: string;
};

/**
 * LINE message actions contain the exact text configured in a Rich Menu.
 * Normalize harmless formatting differences so a copied or older action still
 * reaches the same application command.
 */
export function normalizeLineCommand(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\u00A0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("th-TH");
}

function matchesCommand(receivedText: string, candidates: readonly string[]): boolean {
  const normalizedText = normalizeLineCommand(receivedText);
  if (!normalizedText) return false;

  return candidates.some((candidate) => normalizeLineCommand(candidate) === normalizedText);
}

function matchesConfiguredOrLegacy(
  receivedText: string,
  configuredKeyword: string,
  legacyKeywords: readonly string[],
): boolean {
  return matchesCommand(receivedText, [configuredKeyword, ...legacyKeywords]);
}

function matchesConfiguredTestCommand(receivedText: string, configuredKeyword: string): boolean {
  return matchesCommand(receivedText, [
    `ทดสอบ${configuredKeyword}`,
    `ทดสอบ ${configuredKeyword}`,
  ]);
}

/**
 * Resolve a LINE text event to the business action configured in the admin
 * console. The legacy values are intentionally retained because a Rich Menu
 * already published on LINE does not change when its web setting changes.
 */
export function resolveLineWebhookCommand(
  receivedText: unknown,
  keywords: LineWebhookKeywords,
): LineWebhookCommand | null {
  if (typeof receivedText !== "string") return null;

  if (
    matchesConfiguredOrLegacy(receivedText, keywords.link, [
      "ผูกบัญชี",
      "ผูกบัญชีสมาชิก",
      "เชื่อมต่อบัญชี",
      "เชื่อมบัญชี",
      "account link",
    ]) ||
    matchesConfiguredTestCommand(receivedText, keywords.link) ||
    matchesCommand(receivedText, ["ทดสอบผูกบัญชี"])
  ) {
    return "account-link";
  }

  if (
    matchesConfiguredOrLegacy(receivedText, keywords.stock, [
      "เช็คสต็อก",
      "ตรวจสอบสต็อก",
      "ดูสต็อก",
      "stock",
    ]) ||
    matchesConfiguredTestCommand(receivedText, keywords.stock)
  ) {
    return "stock";
  }

  if (
    matchesConfiguredOrLegacy(receivedText, keywords.promo, [
      "ดูโปรโมชั่น",
      "ดูโปรโมชัน",
      "โปรโมชั่น",
      "โปรโมชัน",
      "promotions",
    ]) ||
    matchesConfiguredTestCommand(receivedText, keywords.promo)
  ) {
    return "promo";
  }

  if (
    matchesConfiguredOrLegacy(receivedText, keywords.order, [
      keywords.quotation,
      "เช็คสถานะออเดอร์",
      "ติดตามใบเสนอราคา",
      "เช็คสถานะใบเสนอราคา",
      "สถานะใบเสนอราคา",
      "ใบเสนอราคา",
      "order status",
    ]) ||
    matchesConfiguredTestCommand(receivedText, keywords.order) ||
    matchesConfiguredTestCommand(receivedText, keywords.quotation)
  ) {
    return "order";
  }

  if (
    matchesConfiguredOrLegacy(receivedText, keywords.installation, [
      "ติดตามงานติดตั้ง",
      "สถานะงานติดตั้ง",
      "เช็คสถานะงานติดตั้ง",
      "งานติดตั้ง",
      "installation status",
    ]) ||
    matchesConfiguredTestCommand(receivedText, keywords.installation)
  ) {
    return "installation";
  }

  if (
    matchesConfiguredOrLegacy(receivedText, keywords.points, [
      "ดูคะแนนสะสม",
      "คะแนนสะสม",
      "ดูแต้มสะสม",
      "เช็คคะแนน",
      "points",
    ]) ||
    matchesConfiguredTestCommand(receivedText, keywords.points)
  ) {
    return "points";
  }

  return null;
}
