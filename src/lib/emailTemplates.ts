export const EMAIL_AUTOMATION_KEYS = [
  "welcome",
  "track_request_access",
  "proposal_ready",
  "payment_confirmed",
  "maintenance_appointment",
  "service_request_confirmed",
  "quotation_revised",
  "quotation_cancelled",
  "quotation_cancellation_requested",
  "project_completed",
  "warranty_registered",
  "warranty_access_otp",
  "policy_updated",
] as const;

export type EmailTemplateKey = (typeof EMAIL_AUTOMATION_KEYS)[number];

export type EmailAutomationDefinition = {
  templateKey: EmailTemplateKey;
  name: string;
  description: string;
  trigger: string;
  variables: readonly string[];
};

export const EMAIL_AUTOMATIONS: readonly EmailAutomationDefinition[] = [
  { templateKey: "welcome", name: "Welcome email", description: "Sent after account registration.", trigger: "User registration completed", variables: ["customer_name", "customer_email", "login_url", "site_url"] },
  { templateKey: "track_request_access", name: "Track request access", description: "Sends a secure request tracking link.", trigger: "Tracking access requested", variables: ["customer_name", "customer_email", "access_link", "request_links", "request_count", "link_expiry", "site_url"] },
  { templateKey: "proposal_ready", name: "Proposal ready", description: "Notifies a customer that a quotation is ready.", trigger: "Proposal ready or dispatched", variables: ["customer_name", "customer_email", "proposal_id", "document_no", "total_price", "action_url", "site_url"] },
  { templateKey: "payment_confirmed", name: "Payment confirmed", description: "Confirms a recorded payment.", trigger: "Payment marked paid", variables: ["customer_name", "customer_email", "proposal_id", "amount", "milestone_name", "trans_ref", "bank_account", "payment_subject", "project_progress_url", "action_url"] },
  { templateKey: "maintenance_appointment", name: "Maintenance appointment", description: "Confirms a scheduled service visit.", trigger: "Service appointment scheduled", variables: ["customer_name", "customer_email", "appointment_date", "action_url"] },
  { templateKey: "service_request_confirmed", name: "Service request confirmed", description: "Acknowledges a service request.", trigger: "Service request submitted", variables: ["customer_name", "order_reference", "tracking_url", "action_url"] },
  { templateKey: "quotation_revised", name: "Quotation revised", description: "Notifies a customer about a revised quotation.", trigger: "Quotation revision published", variables: ["customer_name", "proposal_id", "revision_number", "total_price", "action_url"] },
  { templateKey: "quotation_cancelled", name: "Quotation cancelled", description: "Notifies a customer that a quotation was cancelled.", trigger: "Quotation cancelled", variables: ["customer_name", "proposal_id", "total_price", "reason", "action_url"] },
  { templateKey: "quotation_cancellation_requested", name: "Cancellation request", description: "Alerts staff to a cancellation request.", trigger: "Customer requests cancellation", variables: ["customer_name", "customer_email", "proposal_id", "total_price", "reason", "action_url"] },
  { templateKey: "project_completed", name: "Project completed", description: "Confirms installation completion and after-sales handover.", trigger: "Project completed", variables: ["customer_name", "project_id", "action_url", "pdf_url", "certificate_hash", "warranty_years"] },
  { templateKey: "warranty_registered", name: "Digital warranty card ready", description: "Sends the customer their digital warranty card after handover registration.", trigger: "Warranty registration completed", variables: ["customer_name", "project_id", "warranty_card_url", "pdf_url", "warranty_subject", "warranty_days_remaining"] },
  { templateKey: "warranty_access_otp", name: "Guest warranty verification code", description: "Sends a one-time code for scoped guest warranty access.", trigger: "Guest warranty access requested", variables: ["customer_name", "otp_code", "expires_minutes", "site_url"] },
  { templateKey: "policy_updated", name: "Policy update", description: "Notifies users when terms, privacy, warnings, or other important site policies change.", trigger: "Admin publishes a policy update", variables: ["customer_name", "policy_summary", "action_url", "site_url"] },
];

export function getEmailAutomation(key: EmailTemplateKey) {
  return EMAIL_AUTOMATIONS.find((automation) => automation.templateKey === key);
}
