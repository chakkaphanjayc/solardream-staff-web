import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailTemplates, users } from "@/db/schema";
import { getEmailAutomation, type EmailTemplateKey } from "@/lib/emailTemplates";
import { sendTransactional } from "@/lib/listmonk";

type EmailValues = Record<string, unknown>;

function getEnvironmentTemplateId(templateKey: EmailTemplateKey) {
  const variableName = `LISTMONK_TEMPLATE_${templateKey.toUpperCase()}`;
  const value = Number(process.env[variableName]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function sendConfiguredTemplateEmail(input: {
  templateKey: EmailTemplateKey;
  to: string;
  values: EmailValues;
}) {
  const automation = getEmailAutomation(input.templateKey);
  if (!automation) return { success: false as const, reason: "Unknown email automation" };

  const config = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.templateKey, input.templateKey),
    columns: { isEnabled: true, listmonkTemplateId: true },
  });

  if (config?.isEnabled === false) return { success: false as const, reason: "Automation disabled" };
  const templateId = config?.listmonkTemplateId ?? getEnvironmentTemplateId(input.templateKey);
  if (!templateId) {
    console.warn("[Listmonk] Email automation has no template mapping.", {
      templateKey: input.templateKey,
      fallbackEnvironmentVariable: `LISTMONK_TEMPLATE_${input.templateKey.toUpperCase()}`,
    });
    return { success: false as const, reason: "No Listmonk template mapped" };
  }

  const normalizedRecipient = input.to.trim().toLowerCase();
  const recipient = await db.query.users.findFirst({
    where: eq(users.email, normalizedRecipient),
    columns: { preferredLanguage: true },
  });
  const requestedLanguage = input.values.lang;
  const lang = recipient?.preferredLanguage === "th"
    ? "th"
    : recipient?.preferredLanguage === "en"
      ? "en"
      : requestedLanguage === "th"
        ? "th"
        : "en";

  const result = await sendTransactional({
    subscriberEmail: normalizedRecipient,
    subscriberMode: "fallback",
    templateId,
    data: { ...input.values, lang },
  });
  if (!result.success) return { success: false as const, error: result.error };
  return { success: true as const, messageId: `listmonk:${templateId}` };
}

export async function sendWelcomeEmail(email: string, name?: string | null) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://solar-dream.org").replace(/\/$/, "");
  return sendConfiguredTemplateEmail({
    templateKey: "welcome",
    to: email,
    values: { customer_name: name?.trim() || email.split("@")[0], customer_email: email, login_url: `${siteUrl}/login`, site_url: siteUrl },
  });
}

export async function sendDynamicQuotationCancellationEmail(input: {
  proposalId: string;
  customerName: string;
  customerEmail: string;
  systemSizeKwp: number;
  totalPrice: number;
  crmUrl?: string;
}) {
  return sendConfiguredTemplateEmail({
    templateKey: "quotation_cancelled",
    to: input.customerEmail,
    values: { customer_name: input.customerName, proposal_id: input.proposalId, total_price: input.totalPrice, system_size_kwp: input.systemSizeKwp, action_url: input.crmUrl || "" },
  });
}

export async function sendDynamicQuotationRevisionEmail(input: {
  proposalId: string;
  customerName: string;
  customerEmail: string;
  revisionNumber: number;
  totalPrice?: number;
  crmUrl?: string;
  featureKey?: string;
}) {
  return sendConfiguredTemplateEmail({
    templateKey: "quotation_revised",
    to: input.customerEmail,
    values: { customer_name: input.customerName, proposal_id: input.proposalId, revision_number: input.revisionNumber, total_price: input.totalPrice ?? "", action_url: input.crmUrl || "" },
  });
}

export async function sendCancellationRequestAdminEmail(input: {
  proposalId: string;
  customerName: string;
  customerEmail: string;
  totalPrice: number;
  reason?: string;
}) {
  const recipient = process.env.SOLARDREAM_SALES_EMAIL?.trim() || "sales@solardream.co.th";
  return sendConfiguredTemplateEmail({
    templateKey: "quotation_cancellation_requested",
    to: recipient,
    values: { customer_name: input.customerName, customer_email: input.customerEmail, proposal_id: input.proposalId, total_price: input.totalPrice, reason: input.reason || "", action_url: "" },
  });
}
