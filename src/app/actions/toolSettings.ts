"use server";

import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ToolSettings, DEFAULT_TOOL_SETTINGS } from "@/lib/toolSettings";
import { requireAdmin } from "@/lib/auth-guard";
import { locales } from "@/i18n/locales";

const toolSettingsSchema = z.object({
  wizardBaseCapacityRatio: z.number().finite().positive().max(1),
  wizardValueMultiplier: z.number().finite().min(0.5).max(2),
  wizardBalancedMultiplier: z.number().finite().min(0.5).max(2),
  wizardPremiumMultiplier: z.number().finite().min(0.5).max(3),
  wizardSunHoursPerDay: z.number().finite().min(1).max(12),
  wizardElectricityCostPerUnit: z.number().finite().min(1).max(20),
  plannerDefaultWidth: z.number().finite().min(1).max(30),
  plannerDefaultHeight: z.number().finite().min(1).max(20),
  plannerDefaultPitch: z.number().finite().min(0).max(90),
  plannerMinWidth: z.number().finite().min(1).max(49),
  plannerMaxWidth: z.number().finite().min(2).max(50),
  plannerMinHeight: z.number().finite().min(1).max(29),
  plannerMaxHeight: z.number().finite().min(2).max(30),
  plannerMaxPitch: z.number().finite().min(10).max(90),
}).superRefine((value, context) => {
  if (value.plannerMinWidth >= value.plannerMaxWidth) {
    context.addIssue({ code: "custom", path: ["plannerMinWidth"], message: "Minimum roof width must be below the maximum." });
  }
  if (value.plannerMinHeight >= value.plannerMaxHeight) {
    context.addIssue({ code: "custom", path: ["plannerMinHeight"], message: "Minimum roof height must be below the maximum." });
  }
  if (value.plannerDefaultWidth < value.plannerMinWidth || value.plannerDefaultWidth > value.plannerMaxWidth) {
    context.addIssue({ code: "custom", path: ["plannerDefaultWidth"], message: "Default roof width must be within the configured bounds." });
  }
  if (value.plannerDefaultHeight < value.plannerMinHeight || value.plannerDefaultHeight > value.plannerMaxHeight) {
    context.addIssue({ code: "custom", path: ["plannerDefaultHeight"], message: "Default roof height must be within the configured bounds." });
  }
  if (value.plannerDefaultPitch > value.plannerMaxPitch) {
    context.addIssue({ code: "custom", path: ["plannerDefaultPitch"], message: "Default roof pitch must be within the configured bounds." });
  }
});

export async function getToolSettings(): Promise<ToolSettings> {
  await requireAdmin();
  try {
    const record = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, "default"),
      columns: { toolSettings: true },
    });

    if (record?.toolSettings) {
      return { ...DEFAULT_TOOL_SETTINGS, ...(record.toolSettings as Partial<ToolSettings>) };
    }
  } catch {
    // DB unavailable — return safe defaults
  }
  return DEFAULT_TOOL_SETTINGS;
}

export async function saveToolSettings(
  settings: ToolSettings
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    const parsed = toolSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid tool settings." };
    }

    await db.insert(systemSettings)
      .values({
        id: "default",
        toolSettings: parsed.data,
      })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: { toolSettings: parsed.data },
      });

    for (const locale of locales) {
      revalidatePath(`/${locale}/admin/settings/configurator`);
      revalidatePath(`/${locale}/wizard`);
      revalidatePath(`/${locale}/visualizer`);
    }
    revalidatePath("/", "layout");

    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to save tool settings:", err);
    return { success: false, error: "Failed to save settings" };
  }
}
