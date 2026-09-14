"use server";

import { revalidatePath } from "next/cache";

import { checkAdmin } from "@/app/actions/auth";
import { db } from "@/db";
import { emailTemplates } from "@/db/schema";
import { EMAIL_AUTOMATIONS, type EmailTemplateKey } from "@/lib/emailTemplates";

export type EmailAutomationSettings = {
  templateKey: EmailTemplateKey;
  name: string;
  description: string;
  trigger: string;
  variables: readonly string[];
  isEnabled: boolean;
  listmonkTemplateId: number | null;
  updatedAt: Date | null;
};

function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return EMAIL_AUTOMATIONS.some((automation) => automation.templateKey === value);
}

export async function getEmailSettings(): Promise<{
  success: boolean;
  automations?: EmailAutomationSettings[];
  error?: string;
}> {
  await checkAdmin();
  try {
    const records = await db.query.emailTemplates.findMany();
    const byKey = new Map(records.map((record) => [record.templateKey, record]));
    return {
      success: true,
      automations: EMAIL_AUTOMATIONS.map((automation) => {
        const record = byKey.get(automation.templateKey);
        return {
          ...automation,
          isEnabled: record?.isEnabled ?? true,
          listmonkTemplateId: record?.listmonkTemplateId ?? null,
          updatedAt: record?.updatedAt ?? null,
        };
      }),
    };
  } catch (error) {
    console.error("[Email Settings] Failed to load Listmonk mappings:", error);
    return { success: false, error: "Failed to load email automation settings." };
  }
}

export async function saveEmailAutomation(input: {
  templateKey: string;
  isEnabled: boolean;
  listmonkTemplateId: number | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();
    if (!isEmailTemplateKey(input.templateKey)) return { success: false, error: "Unknown email automation." };
    if (input.listmonkTemplateId !== null && (!Number.isSafeInteger(input.listmonkTemplateId) || input.listmonkTemplateId <= 0)) {
      return { success: false, error: "Listmonk template ID must be a positive integer." };
    }

    await db.insert(emailTemplates).values({
      templateKey: input.templateKey,
      isEnabled: input.isEnabled,
      listmonkTemplateId: input.listmonkTemplateId,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: emailTemplates.templateKey,
      set: {
        isEnabled: input.isEnabled,
        listmonkTemplateId: input.listmonkTemplateId,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/admin/settings/email");
    revalidatePath("/th/admin/settings/email");
    revalidatePath("/en/admin/settings/email");
    return { success: true };
  } catch (error) {
    console.error("[Email Settings] Failed to save Listmonk mapping:", error);
    return { success: false, error: "Failed to save email automation." };
  }
}
