export const SALES_NOTIFICATION_CONFIG_KEY = "sales_notification_config";

export const SALES_NOTIFICATION_EVENTS = [
  "LEAD_RECEIVED",
  "QUOTATION_READY",
  "QUOTATION_ACCEPTED",
  "PAYMENT_REQUESTED",
  "PAYMENT_REVIEW_REQUIRED",
  "PAYMENT_RECEIVED",
] as const;

export type SalesNotificationEvent = (typeof SALES_NOTIFICATION_EVENTS)[number];
export type SalesNotificationChannel = "line" | "discord";

export type SalesNotificationRule = {
  line: boolean;
  discord: boolean;
};

export type SalesNotificationConfig = {
  enabled: boolean;
  lineEnabled: boolean;
  discordEnabled: boolean;
  rules: Record<SalesNotificationEvent, SalesNotificationRule>;
};

export type SalesNotificationEventMeta = {
  label: string;
  description: string;
};

export const SALES_NOTIFICATION_EVENT_META: Record<SalesNotificationEvent, SalesNotificationEventMeta> = {
  LEAD_RECEIVED: {
    label: "New lead received",
    description: "A new request entered the sales pipeline.",
  },
  QUOTATION_READY: {
    label: "Quotation ready",
    description: "A quotation was created or dispatched for customer review.",
  },
  QUOTATION_ACCEPTED: {
    label: "Quotation accepted",
    description: "The customer signed or accepted the quotation.",
  },
  PAYMENT_REQUESTED: {
    label: "Payment requested",
    description: "A payment request became available to the customer.",
  },
  PAYMENT_REVIEW_REQUIRED: {
    label: "Payment needs review",
    description: "A payment proof was received and needs staff verification.",
  },
  PAYMENT_RECEIVED: {
    label: "Payment received",
    description: "A payment proof was verified and marked paid.",
  },
};

export const DEFAULT_SALES_NOTIFICATION_CONFIG: SalesNotificationConfig = {
  enabled: true,
  lineEnabled: true,
  discordEnabled: true,
  rules: {
    LEAD_RECEIVED: { line: true, discord: true },
    QUOTATION_READY: { line: true, discord: true },
    QUOTATION_ACCEPTED: { line: true, discord: true },
    PAYMENT_REQUESTED: { line: true, discord: true },
    PAYMENT_REVIEW_REQUIRED: { line: true, discord: true },
    PAYMENT_RECEIVED: { line: true, discord: true },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readRule(value: unknown, fallback: SalesNotificationRule): SalesNotificationRule {
  if (!isRecord(value)) return fallback;

  return {
    line: readBoolean(value.line, fallback.line),
    discord: readBoolean(value.discord, fallback.discord),
  };
}

export function normalizeSalesNotificationConfig(value: unknown): SalesNotificationConfig {
  if (!isRecord(value)) return DEFAULT_SALES_NOTIFICATION_CONFIG;

  const rawRules = isRecord(value.rules) ? value.rules : {};
  const rules = Object.fromEntries(
    SALES_NOTIFICATION_EVENTS.map((event) => [
      event,
      readRule(rawRules[event], DEFAULT_SALES_NOTIFICATION_CONFIG.rules[event]),
    ]),
  ) as Record<SalesNotificationEvent, SalesNotificationRule>;

  return {
    enabled: readBoolean(value.enabled, DEFAULT_SALES_NOTIFICATION_CONFIG.enabled),
    lineEnabled: readBoolean(value.lineEnabled, DEFAULT_SALES_NOTIFICATION_CONFIG.lineEnabled),
    discordEnabled: readBoolean(value.discordEnabled, DEFAULT_SALES_NOTIFICATION_CONFIG.discordEnabled),
    rules,
  };
}

export function getSalesNotificationEventForTopic(topic: string): SalesNotificationEvent | null {
  switch (topic) {
    case "sales.lead.received":
      return "LEAD_RECEIVED";
    case "sales.quotation.ready":
      return "QUOTATION_READY";
    case "sales.quotation.accepted":
      return "QUOTATION_ACCEPTED";
    case "sales.payment.requested":
      return "PAYMENT_REQUESTED";
    case "sales.payment.review-required":
      return "PAYMENT_REVIEW_REQUIRED";
    case "sales.payment.received":
      return "PAYMENT_RECEIVED";
    default:
      return null;
  }
}

export const SALES_NOTIFICATION_TOPICS = {
  leadReceived: "sales.lead.received",
  quotationReady: "sales.quotation.ready",
  quotationAccepted: "sales.quotation.accepted",
  paymentRequested: "sales.payment.requested",
  paymentReviewRequired: "sales.payment.review-required",
  paymentReceived: "sales.payment.received",
} as const;
