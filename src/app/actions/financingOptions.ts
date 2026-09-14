"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { financingOptions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import type { FinanceType } from "@/lib/financialPlan";
import { locales } from "@/i18n/locales";
import { z } from "zod";

const financingOptionSchema = z.object({
  providerName: z.string().trim().min(1, "Provider name is required.").max(180),
  financeType: z.enum(["CASH", "BANK_LOAN", "PPA", "LEASING"]),
  interestRate: z.number().finite().min(0).max(100).nullable().optional(),
  maxTermMonths: z.number().finite().int().min(0).max(1200).nullable().optional(),
  minSystemCost: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
  eligibilityRules: z.unknown().optional(),
  marketingTag: z.string().trim().max(240).nullable().optional(),
  isActive: z.boolean().optional(),
});
const financingOptionIdSchema = z.string().uuid();

function revalidateFinancingSurfaces() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/admin/settings`);
    revalidatePath(`/${locale}/admin/settings/financing`);
    revalidatePath(`/${locale}/admin/crm`);
    revalidatePath(`/${locale}/quotation`);
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNullableNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toNullableString(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : null;
}

function parseEligibilityRules(value: unknown) {
  if (value === null || value === undefined || value === "") return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  return {};
}

type FinancingOptionPayload = {
  providerName: string;
  financeType: FinanceType;
  interestRate?: number | null;
  maxTermMonths?: number | null;
  minSystemCost?: number | null;
  eligibilityRules?: unknown;
  marketingTag?: string | null;
  isActive?: boolean;
};

export async function createFinancingOption(data: FinancingOptionPayload) {
  await requireAdmin();
  try {
    const parsed = financingOptionSchema.safeParse({
      ...data,
      providerName: normalizeText(data.providerName),
      interestRate: toNullableNumber(data.interestRate),
      maxTermMonths: toNullableNumber(data.maxTermMonths),
      minSystemCost: toNullableNumber(data.minSystemCost),
      marketingTag: normalizeText(data.marketingTag) || null,
      eligibilityRules: parseEligibilityRules(data.eligibilityRules),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Invalid financing option." };

    const [record] = await db
      .insert(financingOptions)
      .values({
        providerName: parsed.data.providerName,
        financeType: parsed.data.financeType,
        interestRate: parsed.data.interestRate === null || parsed.data.interestRate === undefined ? null : String(parsed.data.interestRate),
        maxTermMonths: parsed.data.maxTermMonths ?? null,
        minSystemCost: parsed.data.minSystemCost === null || parsed.data.minSystemCost === undefined ? null : String(parsed.data.minSystemCost),
        eligibilityRules: parseEligibilityRules(parsed.data.eligibilityRules),
        marketingTag: parsed.data.marketingTag || null,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();

    if (!record) return { success: false, error: "Financing option could not be created." };
    revalidateFinancingSurfaces();

    return { success: true, financingOption: record };
  } catch (error: unknown) {
    console.error("Failed to create financing option:", error);
    return {
      success: false,
      error: "Failed to create financing option.",
    };
  }
}

export async function updateFinancingOption(
  id: string,
  data: FinancingOptionPayload,
) {
  await requireAdmin();
  try {
    const parsedId = financingOptionIdSchema.safeParse(id);
    if (!parsedId.success) return { success: false, error: "Financing option was not found." };
    const parsed = financingOptionSchema.safeParse({
      ...data,
      providerName: normalizeText(data.providerName),
      interestRate: toNullableNumber(data.interestRate),
      maxTermMonths: toNullableNumber(data.maxTermMonths),
      minSystemCost: toNullableNumber(data.minSystemCost),
      marketingTag: normalizeText(data.marketingTag) || null,
      eligibilityRules: parseEligibilityRules(data.eligibilityRules),
    });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Invalid financing option." };

    const [record] = await db
      .update(financingOptions)
      .set({
        providerName: parsed.data.providerName,
        financeType: parsed.data.financeType,
        interestRate: parsed.data.interestRate === null || parsed.data.interestRate === undefined ? null : String(parsed.data.interestRate),
        maxTermMonths: parsed.data.maxTermMonths ?? null,
        minSystemCost: parsed.data.minSystemCost === null || parsed.data.minSystemCost === undefined ? null : String(parsed.data.minSystemCost),
        eligibilityRules: parseEligibilityRules(parsed.data.eligibilityRules),
        marketingTag: parsed.data.marketingTag || null,
        isActive: parsed.data.isActive ?? true,
      })
      .where(eq(financingOptions.id, parsedId.data))
      .returning();

    if (!record) return { success: false, error: "Financing option was not found." };
    revalidateFinancingSurfaces();

    return { success: true, financingOption: record };
  } catch (error: unknown) {
    console.error("Failed to update financing option:", error);
    return {
      success: false,
      error: "Failed to update financing option.",
    };
  }
}

export async function deleteFinancingOption(id: string) {
  await requireAdmin();
  try {
    const parsedId = financingOptionIdSchema.safeParse(id);
    if (!parsedId.success) return { success: false, error: "Financing option was not found." };

    const [deleted] = await db.delete(financingOptions)
      .where(eq(financingOptions.id, parsedId.data))
      .returning({ id: financingOptions.id });
    if (!deleted) return { success: false, error: "Financing option was not found." };

    revalidateFinancingSurfaces();

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete financing option:", error);
    return {
      success: false,
      error: "Failed to delete financing option.",
    };
  }
}

export async function getFinancingOptions() {
  await requireAdmin();
  try {
    const records = await db.query.financingOptions.findMany({
      orderBy: [desc(financingOptions.isActive), desc(financingOptions.createdAt)],
    });

    return { success: true, financingOptions: records };
  } catch (error: unknown) {
    console.error("Failed to fetch financing options:", error);
    return {
      success: false,
      error: "Failed to fetch financing options.",
    };
  }
}
