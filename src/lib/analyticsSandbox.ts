import type { AnalyticsFlagKey } from "@/lib/analyticsConfig";

export type AnalyticsSandboxEventName =
  | "sign_up"
  | "lead_form_started"
  | "quotation_requested"
  | "proposal_signed";

type AnalyticsSandboxEventDefinition = {
  flagKey: Exclude<AnalyticsFlagKey, "analytics_enabled">;
  properties: Readonly<Record<string, string | number | boolean>>;
};

export const ANALYTICS_SANDBOX_EVENTS = {
  sign_up: {
    flagKey: "track_user_registration",
    properties: { method: "mock_test", role: "client" },
  },
  lead_form_started: {
    flagKey: "track_wizard_engagement",
    properties: { source: "sandbox_test" },
  },
  quotation_requested: {
    flagKey: "track_wizard_engagement",
    properties: {
      kw_size: "5kW_test",
      estimated_price: 185000,
      customer_type: "residential",
    },
  },
  proposal_signed: {
    flagKey: "track_proposal_lifecycle",
    properties: {
      quotation_id: "QT-MOCK-9999",
      revenue: 185000,
    },
  },
} as const satisfies Record<AnalyticsSandboxEventName, AnalyticsSandboxEventDefinition>;
