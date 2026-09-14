"use server";

import { db } from "@/db";
import { paymentSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const paymentSettingsSchema = z.object({
  promptpayId: z.string().trim().min(1).max(80),
  promptpayLimit: z.number().finite().int().min(1).max(10_000_000),
  bankName: z.string().trim().min(1).max(160),
  bankAccountName: z.string().trim().min(1).max(160),
  bankAccountNumber: z.string().trim().min(1).max(80),
});

const DEFAULT_PAYMENT_SETTINGS = {
  id: "default",
  promptpayId: "0812345678",
  promptpayLimit: 200000,
  bankName: "Kasikorn Bank (KBank)",
  bankAccountName: "SolarDream Co., Ltd.",
  bankAccountNumber: "012-3-45678-9",
  updatedAt: new Date(0),
};

export async function getPaymentSettings() {
  await requireAdmin();

  const config = await db.query.paymentSettings.findFirst({
    where: eq(paymentSettings.id, "default"),
  });

  return config ?? DEFAULT_PAYMENT_SETTINGS;
}

export async function updatePaymentSettings(data: {
  promptpayId: string;
  promptpayLimit: number;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
}) {
  await requireAdmin();
  const parsed = paymentSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid payment settings." };
  }

  try {
    const [updated] = await db
      .insert(paymentSettings)
      .values({
        id: "default",
        ...parsed.data,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: paymentSettings.id,
        set: {
          ...parsed.data,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!updated) return { success: false, error: "Payment settings were not saved." };

    revalidatePath("/admin/settings/payment");
    revalidatePath("/admin/settings/sandbox");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to save payment settings:", error);
    return { success: false, error: "Payment settings could not be saved." };
  }
}
