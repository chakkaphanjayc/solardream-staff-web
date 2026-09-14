"use client";

import type { AnalyticsFlagKey } from "@/lib/analyticsConfig";
import { isAnalyticsConsentGranted, trackUmamiEvent } from "@/utils/analytics";

type ProductAnalyticsFlag = Exclude<AnalyticsFlagKey, "analytics_enabled">;

export const PRODUCT_ANALYTICS_EVENT_FLAGS = {
  funnel_page_viewed: "track_acquisition_engagement",
  source_captured: "track_acquisition_engagement",
  navigation_clicked: "track_acquisition_engagement",
  primary_cta_clicked: "track_acquisition_engagement",
  home_size_selected: "track_acquisition_engagement",
  home_weather_selected: "track_acquisition_engagement",
  form_started: "track_acquisition_engagement",
  form_field_started: "track_acquisition_engagement",
  form_submitted: "track_acquisition_engagement",
  consent_updated: "track_acquisition_engagement",
  support_started: "track_support_engagement",
  support_request_submitted: "track_support_engagement",
  search_submitted: "track_acquisition_engagement",

  wizard_started: "track_wizard_engagement",
  wizard_step_viewed: "track_wizard_engagement",
  wizard_answer_selected: "track_wizard_engagement",
  wizard_step_completed: "track_wizard_engagement",
  wizard_completed: "track_wizard_engagement",
  wizard_summary_viewed: "track_wizard_engagement",
  proposal_request_started: "track_wizard_engagement",
  quotation_requested: "track_wizard_engagement",
  configuration_saved: "track_wizard_engagement",
  financial_report_requested: "track_wizard_engagement",
  financial_report_downloaded: "track_wizard_engagement",
  summary_shared: "track_wizard_engagement",
  estimate_registration_started: "track_wizard_engagement",
  build_started: "track_wizard_engagement",
  build_configuration_changed: "track_wizard_engagement",
  build_quote_requested: "track_wizard_engagement",

  catalog_viewed: "track_catalog_commerce",
  product_viewed: "track_catalog_commerce",
  product_cta_clicked: "track_catalog_commerce",
  product_added_to_cart: "track_catalog_commerce",
  product_stock_inquiry_started: "track_catalog_commerce",
  cart_viewed: "track_catalog_commerce",
  cart_updated: "track_catalog_commerce",
  checkout_started: "track_catalog_commerce",
  checkout_submitted: "track_catalog_commerce",
  payment_started: "track_catalog_commerce",
  payment_slip_selected: "track_catalog_commerce",
  payment_slip_uploaded: "track_catalog_commerce",
  payment_confirmed: "track_catalog_commerce",

  login: "track_user_registration",
  login_started: "track_user_registration",
  login_succeeded: "track_user_registration",
  login_failed: "track_user_registration",
  sign_up: "track_user_registration",
  sign_up_started: "track_user_registration",
  sign_up_succeeded: "track_user_registration",
  sign_up_failed: "track_user_registration",
  auth_provider_selected: "track_user_registration",

  proposal_viewed: "track_proposal_lifecycle",
  proposal_request_viewed: "track_proposal_lifecycle",
  proposal_document_opened: "track_proposal_lifecycle",
  proposal_document_downloaded: "track_proposal_lifecycle",
  proposal_signature_started: "track_proposal_lifecycle",
  proposal_signed: "track_proposal_lifecycle",
  proposal_document_uploaded: "track_proposal_lifecycle",
  proposal_payment_started: "track_proposal_lifecycle",
  proposal_payment_submitted: "track_proposal_lifecycle",
  proposal_revision_requested: "track_proposal_lifecycle",
  proposal_revision_approved: "track_proposal_lifecycle",
  proposal_cancellation_requested: "track_proposal_lifecycle",

  service_catalog_viewed: "track_service_commerce",
  service_viewed: "track_service_commerce",
  service_quote_created: "track_service_commerce",
  service_checkout_started: "track_service_commerce",
  service_order_confirmed: "track_service_commerce",
  service_quotation_requested: "track_service_commerce",
  service_custom_quote_requested: "track_service_commerce",
  service_payment_started: "track_service_commerce",
  service_payment_slip_selected: "track_service_commerce",
  service_payment_slip_uploaded: "track_service_commerce",
  service_payment_confirmed: "track_service_commerce",
} as const satisfies Record<string, ProductAnalyticsFlag>;

export type ProductAnalyticsEventName = keyof typeof PRODUCT_ANALYTICS_EVENT_FLAGS;
export type ProductAnalyticsProperties = Record<string, unknown>;

const ANALYTICS_SESSION_KEY = "solardream_analytics_session";
const SOURCE_KEY = "solardream_lead_source";
const SENSITIVE_KEY = /(?:^|_)(?:email|phone|telephone|mobile|name|address|message|note|notes|remark|remarks|token|password|secret|cookie|file|file_name|content|signature|signature_data|signature_value|location|latitude|longitude|lat|lon|lng)(?:_|$)/i;
const MAX_STRING_LENGTH = 120;

function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function getAnalyticsSessionId() {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    if (existing) return existing;
    const next = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, next);
    return next;
  } catch {
    return undefined;
  }
}

function getSource() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage.getItem(SOURCE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function sanitizePath(path: string) {
  return path
    .split("?")[0]
    .split("#")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\/SD-(?:QT|SV)-[A-Z0-9]{4,12}/gi, "/:reference")
    .replace(/\/track\/[^/]+/gi, "/track/:token")
    .replace(/\/portal\/[^/]+/gi, "/portal/:id")
    .replace(/\/proposals\/[^/]+/gi, "/proposals/:id");
}

export function sanitizeAnalyticsProperties(properties: ProductAnalyticsProperties) {
  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [rawKey, value] of Object.entries(properties)) {
    const key = toSnakeCase(rawKey);
    if (!key || (key !== "signature_method" && SENSITIVE_KEY.test(key))) continue;

    if (value === null || typeof value === "boolean") {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = Math.round(value * 100) / 100;
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      sanitized[key] = value.trim().slice(0, MAX_STRING_LENGTH);
    }
  }

  return sanitized;
}

function getContext() {
  if (typeof window === "undefined") return {};
  return {
    analytics_session_id: isAnalyticsConsentGranted() ? getAnalyticsSessionId() : undefined,
    source: getSource(),
    locale: document.documentElement.lang || undefined,
    page_path: sanitizePath(window.location.pathname),
  };
}

export function isProductAnalyticsEventName(value: string): value is ProductAnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(PRODUCT_ANALYTICS_EVENT_FLAGS, value);
}

export function normalizeAnalyticsPath(path: string) {
  return sanitizePath(path);
}

export function getFunnelStage(pathname: string) {
  const path = pathname.toLowerCase();
  if (/\/(?:wizard|build|visualizer)/.test(path)) return "plan";
  if (/\/checkout|\/cart|\/services/.test(path)) return "convert";
  if (/\/proposal|\/consultation|\/track|\/portal/.test(path)) return "decide";
  if (/\/(?:login|register|account)/.test(path)) return "identify";
  if (/\/support|\/profile|\/dashboard|\/my-assets/.test(path)) return "retain";
  return "discover";
}

export async function trackProductEvent(
  eventName: ProductAnalyticsEventName,
  properties: ProductAnalyticsProperties = {},
) {
  const featureFlagKey = PRODUCT_ANALYTICS_EVENT_FLAGS[eventName];
  const payload = sanitizeAnalyticsProperties({
    ...getContext(),
    ...properties,
  });

  return trackUmamiEvent(eventName, featureFlagKey, payload);
}
