import "server-only";

import { sendConfiguredTemplateEmail } from "@/lib/email";
import type { EmailTemplateKey } from "@/lib/emailTemplates";

export type EmailTriggerAction = "USER_REGISTERED" | "PROPOSAL_READY" | "PROPOSAL_SIGNED" | "PAYMENT_CONFIRMED" | "MAINTENANCE_APPOINTMENT_SCHEDULED";

const triggerTemplateMap: Record<EmailTriggerAction, EmailTemplateKey> = {
  USER_REGISTERED: "welcome",
  PROPOSAL_READY: "proposal_ready",
  PROPOSAL_SIGNED: "proposal_ready",
  PAYMENT_CONFIRMED: "payment_confirmed",
  MAINTENANCE_APPOINTMENT_SCHEDULED: "maintenance_appointment",
};

export async function fireEmailTrigger(input: { action: EmailTriggerAction; recipient: string; values: Record<string, string | number | boolean | null | undefined> }) {
  return sendConfiguredTemplateEmail({ templateKey: triggerTemplateMap[input.action], to: input.recipient, values: input.values });
}
