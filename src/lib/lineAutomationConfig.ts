export const LINE_TRIGGER_CONFIG_KEY = "line_trigger_configs";
export const LINE_QUICK_BUTTONS_KEY = "line_quick_buttons";
export const LINE_CONVERSATION_CONFIG_KEY = "line_conversation_config";
export const LINE_MAX_QUICK_REPLY_ITEMS = 13;
export const LINE_QUICK_REPLY_LABEL_MAX_LENGTH = 20;
export const LINE_QUICK_REPLY_MESSAGE_MAX_LENGTH = 300;
export const LINE_QUICK_REPLY_URI_MAX_LENGTH = 2_048;

export const LINE_TRIGGER_KINDS = [
  "stock",
  "promo",
  "order",
  "installation",
  "points",
  "link",
  "custom",
] as const;

export type LineTriggerKind = (typeof LINE_TRIGGER_KINDS)[number];
export type LineQuickButtonAction = "message" | "uri";
export type LineConversationOwner = "native" | "chatwoot";

export type LineTriggerConfig = {
  id: string;
  name: string;
  description: string;
  keyword: string;
  kind: LineTriggerKind;
  enabled: boolean;
  altText: string;
  flexJson: string;
  sortOrder: number;
  aliases?: string[];
};

export type LineQuickButton = {
  id: string;
  label: string;
  action: LineQuickButtonAction;
  value: string;
  enabled: boolean;
  sortOrder: number;
};

export function isLineQuickButtonAction(value: unknown): value is LineQuickButtonAction {
  return value === "message" || value === "uri";
}

export type LineConversationConfig = {
  owner: LineConversationOwner;
  chatwootWorkspaceUrl: string;
  chatwootInboxUrl: string;
};

export type LineAutomationConfig = {
  triggers: LineTriggerConfig[];
  quickButtons: LineQuickButton[];
  loginUrl: string;
  conversation: LineConversationConfig;
};

export const DEFAULT_LINE_CONVERSATION_CONFIG: LineConversationConfig = {
  owner: "native",
  chatwootWorkspaceUrl: "",
  chatwootInboxUrl: "",
};

type DefaultTriggerInput = {
  orderKeyword: string;
  pointsKeyword: string;
  stockKeyword: string;
  promoKeyword: string;
  linkKeyword: string;
  installationKeyword: string;
  orderJson: string;
  pointsJson: string;
  stockJson: string;
  promoJson: string;
  linkJson: string;
};

function cleanText(value: string | null | undefined, fallback: string): string {
  const cleaned = (value || "").trim();
  return cleaned || fallback;
}

export function createDefaultLineTriggerConfigs(input: DefaultTriggerInput): LineTriggerConfig[] {
  return [
    {
      id: "order",
      name: "Order status",
      description: "Show the latest quotation or order status.",
      keyword: cleanText(input.orderKeyword, "เช็คสถานะออเดอร์"),
      kind: "order",
      enabled: true,
      altText: "สถานะใบเสนอราคา SolarDream",
      flexJson: input.orderJson.trim(),
      sortOrder: 10,
      aliases: [
        "ติดตามใบเสนอราคา",
        "เช็คสถานะใบเสนอราคา",
        "สถานะใบเสนอราคา",
        "ใบเสนอราคา",
        "order status",
      ],
    },
    {
      id: "installation",
      name: "Installation status",
      description: "Show the current installation milestone.",
      keyword: cleanText(input.installationKeyword, "ติดตามงานติดตั้ง"),
      kind: "installation",
      enabled: true,
      altText: "สถานะงานติดตั้ง SolarDream",
      flexJson: "",
      sortOrder: 20,
      aliases: [
        "สถานะงานติดตั้ง",
        "เช็คสถานะงานติดตั้ง",
        "งานติดตั้ง",
        "installation status",
      ],
    },
    {
      id: "points",
      name: "Loyalty points",
      description: "Show the member points and tier.",
      keyword: cleanText(input.pointsKeyword, "ดูคะแนนสะสม"),
      kind: "points",
      enabled: true,
      altText: "คะแนนสะสมและระดับสมาชิกของคุณ",
      flexJson: input.pointsJson.trim(),
      sortOrder: 30,
      aliases: ["คะแนนสะสม", "ดูแต้มสะสม", "เช็คคะแนน", "points"],
    },
    {
      id: "stock",
      name: "Stock check",
      description: "Show current product stock from the catalog.",
      keyword: cleanText(input.stockKeyword, "เช็คสต็อก"),
      kind: "stock",
      enabled: true,
      altText: "เช็คสต็อกสินค้าคงเหลือ",
      flexJson: input.stockJson.trim(),
      sortOrder: 40,
      aliases: ["ตรวจสอบสต็อก", "ดูสต็อก", "stock"],
    },
    {
      id: "promo",
      name: "Promotions",
      description: "Show the latest products in a carousel.",
      keyword: cleanText(input.promoKeyword, "ดูโปรโมชั่น"),
      kind: "promo",
      enabled: true,
      altText: "โปรโมชั่นและสินค้าขายดีประจำเดือนนี้",
      flexJson: input.promoJson.trim(),
      sortOrder: 50,
      aliases: ["ดูโปรโมชัน", "โปรโมชั่น", "โปรโมชัน", "promotions"],
    },
    {
      id: "link",
      name: "Account linking",
      description: "Send a secure link to connect a LINE account.",
      keyword: cleanText(input.linkKeyword, "ผูกบัญชีสมาชิก"),
      kind: "link",
      enabled: true,
      altText: "เชื่อมต่อบัญชี SolarDream ของคุณเข้ากับ LINE",
      flexJson: input.linkJson.trim(),
      sortOrder: 60,
      aliases: ["ผูกบัญชี", "เชื่อมต่อบัญชี", "เชื่อมบัญชี", "account link"],
    },
  ];
}

export function createDefaultLineQuickButtons(triggers: readonly LineTriggerConfig[]): LineQuickButton[] {
  const buttons: LineQuickButton[] = [
    {
      id: "quick-build",
      label: "ออกแบบระบบ",
      action: "uri",
      value: "{{siteUrl}}/build",
      enabled: true,
      sortOrder: 10,
    },
    {
      id: "quick-wizard",
      label: "ขอใบเสนอราคา",
      action: "uri",
      value: "{{siteUrl}}/wizard",
      enabled: true,
      sortOrder: 20,
    },
  ];

  const messageTriggers = [...triggers]
    .filter((trigger) => trigger.enabled && trigger.kind !== "custom")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 11);

  messageTriggers.forEach((trigger, index) => {
    buttons.push({
      id: `quick-${trigger.id}`,
      label: trigger.name.slice(0, 20),
      action: "message",
      value: trigger.keyword,
      enabled: true,
      sortOrder: 30 + index * 10,
    });
  });

  return buttons.slice(0, LINE_MAX_QUICK_REPLY_ITEMS);
}

export function sortLineQuickButtons(buttons: readonly LineQuickButton[]): LineQuickButton[] {
  return buttons
    .map((button, index) => ({ button, index }))
    .sort((left, right) => {
      const leftOrder = Number.isFinite(left.button.sortOrder) ? left.button.sortOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.button.sortOrder) ? right.button.sortOrder : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ button }) => button);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asKind(value: unknown): LineTriggerKind | null {
  return typeof value === "string" && LINE_TRIGGER_KINDS.includes(value as LineTriggerKind)
    ? value as LineTriggerKind
    : null;
}

export function parseLineTriggerConfigs(raw: string | null): LineTriggerConfig[] | null {
  if (!raw?.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const configs = parsed.flatMap((value, index): LineTriggerConfig[] => {
      if (!isRecord(value)) return [];
      const kind = asKind(value.kind);
      const id = asString(value.id).trim();
      const name = asString(value.name).trim();
      const keyword = asString(value.keyword).trim();
      if (!kind || !id || !name || !keyword) return [];

      const aliases = Array.isArray(value.aliases)
        ? value.aliases.filter((alias): alias is string => typeof alias === "string").map((alias) => alias.trim()).filter(Boolean)
        : [];

      return [{
        id,
        name,
        description: asString(value.description),
        keyword,
        kind,
        enabled: asBoolean(value.enabled, true),
        altText: asString(value.altText, name).trim() || name,
        flexJson: asString(value.flexJson),
        sortOrder: asNumber(value.sortOrder, (index + 1) * 10),
        aliases,
      }];
    });

    return configs;
  } catch {
    return null;
  }
}

export function parseLineQuickButtons(raw: string | null): LineQuickButton[] | null {
  if (!raw?.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return parsed.flatMap((value, index): LineQuickButton[] => {
      if (!isRecord(value)) return [];
      const id = asString(value.id).trim();
      const label = asString(value.label).trim();
      const action = value.action === "uri" || value.action === "message" ? value.action : null;
      const buttonValue = asString(value.value).trim();
      if (!id || !label || !action || !buttonValue) return [];

      return [{
        id,
        label,
        action,
        value: buttonValue,
        enabled: asBoolean(value.enabled, true),
        sortOrder: asNumber(value.sortOrder, (index + 1) * 10),
      }];
    });
  } catch {
    return null;
  }
}

export function parseLineConversationConfig(raw: string | null): LineConversationConfig | null {
  if (!raw?.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    const owner: LineConversationOwner | null = parsed.owner === "chatwoot" || parsed.owner === "native"
      ? parsed.owner as LineConversationOwner
      : null;
    if (!owner) return null;

    return {
      owner,
      chatwootWorkspaceUrl: asString(parsed.chatwootWorkspaceUrl).trim(),
      chatwootInboxUrl: asString(parsed.chatwootInboxUrl).trim(),
    };
  } catch {
    return null;
  }
}

export function normalizeLineTriggerText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\u00A0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("th-TH");
}

function matchesTriggerText(receivedText: unknown, candidate: string): boolean {
  return normalizeLineTriggerText(receivedText) === normalizeLineTriggerText(candidate);
}

export function resolveLineTriggerConfig(
  receivedText: unknown,
  configs: readonly LineTriggerConfig[],
): LineTriggerConfig | null {
  const activeConfigs = [...configs]
    .filter((config) => config.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const config of activeConfigs) {
    const candidates = [config.keyword, ...(config.aliases || [])];
    if (config.kind !== "custom") {
      candidates.push(`ทดสอบ${config.keyword}`, `ทดสอบ ${config.keyword}`);
    }
    if (candidates.some((candidate) => matchesTriggerText(receivedText, candidate))) {
      return config;
    }
  }

  return null;
}

export function resolveQuickButtonValue(value: string, siteUrl: string): string {
  return value.replaceAll("{{siteUrl}}", siteUrl.replace(/\/$/, ""));
}
