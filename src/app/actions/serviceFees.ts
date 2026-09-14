"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { serviceFeeConfigs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-guard";
import { locales } from "@/i18n/locales";

const serviceFeeSchema = z.object({
  name: z.string().trim().min(1, "Service fee name is required.").max(180),
  erpItemCode: z.string().trim().min(1, "ERPNext Item Code is required.").max(140),
  basePrice: z.number().finite().min(0).max(1_000_000_000),
  isActive: z.boolean().optional(),
});
const serviceFeeIdSchema = z.string().trim().min(1).max(200);

function revalidateServiceFeeSurfaces() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/admin/settings`);
    revalidatePath(`/${locale}/admin/settings/quotation`);
    revalidatePath(`/${locale}/admin/crm`);
    revalidatePath(`/${locale}/quotation`);
  }
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function getServiceFeeConfigs() {
  await requireAdmin();
  try {
    const serviceFees = await db.query.serviceFeeConfigs.findMany({
      orderBy: [
        desc(serviceFeeConfigs.isActive),
        desc(serviceFeeConfigs.createdAt),
      ],
    });

    return { success: true, serviceFees };
  } catch (error: unknown) {
    console.error("Failed to fetch service fee configs:", error);
    return { success: false, error: "Failed to fetch service fee configs." };
  }
}

export async function createServiceFeeConfig(data: {
  name: string;
  erpItemCode: string;
  basePrice?: number;
  isActive?: boolean;
}) {
  await requireAdmin();
  try {
    const parsed = serviceFeeSchema.safeParse({
      ...data,
      name: normalizeText(data.name),
      erpItemCode: normalizeText(data.erpItemCode),
      basePrice: Math.max(0, toFiniteNumber(data.basePrice, 0)),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Invalid service fee." };

    const [serviceFee] = await db.insert(serviceFeeConfigs)
      .values({
        name: parsed.data.name,
        erpItemCode: parsed.data.erpItemCode,
        basePrice: parsed.data.basePrice,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();

    if (!serviceFee) return { success: false, error: "Service fee could not be created." };
    revalidateServiceFeeSurfaces();

    return { success: true, serviceFee };
  } catch (error: unknown) {
    console.error("Failed to create service fee config:", error);
    return { success: false, error: "Failed to create service fee config." };
  }
}

export async function updateServiceFeeConfig(
  id: string,
  data: {
    name: string;
    erpItemCode: string;
    basePrice?: number;
    isActive?: boolean;
  }
) {
  await requireAdmin();
  try {
    const parsedId = serviceFeeIdSchema.safeParse(id);
    if (!parsedId.success) return { success: false, error: "Service fee was not found." };
    const parsed = serviceFeeSchema.safeParse({
      ...data,
      name: normalizeText(data.name),
      erpItemCode: normalizeText(data.erpItemCode),
      basePrice: Math.max(0, toFiniteNumber(data.basePrice, 0)),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Invalid service fee." };

    const [serviceFee] = await db.update(serviceFeeConfigs)
      .set({
        name: parsed.data.name,
        erpItemCode: parsed.data.erpItemCode,
        basePrice: parsed.data.basePrice,
        isActive: parsed.data.isActive ?? true,
      })
      .where(eq(serviceFeeConfigs.id, parsedId.data))
      .returning();

    if (!serviceFee) return { success: false, error: "Service fee was not found." };
    revalidateServiceFeeSurfaces();

    return { success: true, serviceFee };
  } catch (error: unknown) {
    console.error("Failed to update service fee config:", error);
    return { success: false, error: "Failed to update service fee config." };
  }
}

export async function deleteServiceFeeConfig(id: string) {
  await requireAdmin();
  try {
    const parsedId = serviceFeeIdSchema.safeParse(id);
    if (!parsedId.success) return { success: false, error: "Service fee was not found." };

    const [deleted] = await db.delete(serviceFeeConfigs)
      .where(eq(serviceFeeConfigs.id, parsedId.data))
      .returning({ id: serviceFeeConfigs.id });
    if (!deleted) return { success: false, error: "Service fee was not found." };

    revalidateServiceFeeSurfaces();

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete service fee config:", error);
    return { success: false, error: "Failed to delete service fee config." };
  }
}
