"use server";

import { revalidatePath } from "next/cache";

import { checkAdmin } from "@/app/actions/auth";
import { saveSystemSetting } from "@/app/actions/systemSettings";
import {
  normalizeSalesNotificationConfig,
  SALES_NOTIFICATION_CONFIG_KEY,
  type SalesNotificationConfig,
} from "@/lib/salesNotificationConfig";
import { sendSalesNotificationTest } from "@/lib/salesNotificationDelivery";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function saveSalesNotificationConfigAction(
  input: SalesNotificationConfig,
): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();
    if (!isRecord(input)) return { success: false, error: "Invalid sales notification settings." };

    const config = normalizeSalesNotificationConfig(input);
    const result = await saveSystemSetting(SALES_NOTIFICATION_CONFIG_KEY, JSON.stringify(config));
    if (!result.success) return result;

    const { recordAuditEventBestEffort, resolveAuditActor } = await import("@/lib/auditLog");
    const actor = await resolveAuditActor();
    await recordAuditEventBestEffort({
      actorUserId: actor?.userId,
      actorType: actor?.actorType,
      action: "UPDATE_SALES_NOTIFICATION_CONFIG",
      resourceType: "SALES_NOTIFICATION_CONFIG",
      outcome: "SUCCESS",
      metadata: {
        enabled: config.enabled,
        lineEnabled: config.lineEnabled,
        discordEnabled: config.discordEnabled,
        rules: config.rules,
      },
    });

    revalidatePath("/admin/settings/notifications");
    revalidatePath("/th/admin/settings/notifications");
    revalidatePath("/en/admin/settings/notifications");
    return { success: true };
  } catch (error: unknown) {
    console.error("[Sales Notification Settings] Failed to save configuration:", error);
    return { success: false, error: "Failed to save sales notification settings." };
  }
}

export async function sendSalesNotificationTestAction(input: {
  channel: "line" | "discord";
  lineUserId?: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    await checkAdmin();
    if (input.channel === "line" && !input.lineUserId?.trim()) {
      return { success: false, error: "Select a linked LINE customer before sending a test." };
    }

    const result = await sendSalesNotificationTest(input);
    if (result.success) {
      return {
        success: true,
        message: input.channel === "line"
          ? "LINE test notification sent."
          : "Discord test notification sent.",
      };
    }

    return { success: false, error: result.error || "Notification test failed." };
  } catch (error: unknown) {
    console.error("[Sales Notification Settings] Test failed:", error);
    return { success: false, error: "Notification test failed." };
  }
}
