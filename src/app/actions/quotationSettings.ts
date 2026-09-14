"use server";

import { db } from "@/db";
import { quotationSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/app/actions/auth";
import { locales } from "@/i18n/locales";
import { z } from "zod";

const quotationSettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  companyAddress: z.string().trim().min(1).max(1000),
  taxId: z.string().trim().regex(/^\d{13}$/, "Tax ID must contain 13 digits."),
  phone: z.string().trim().max(64).nullable().optional(),
  email: z.string().trim().email().max(180).nullable().optional(),
  website: z.string().trim().max(255).nullable().optional(),
  taxMode: z.enum(["EXCLUSIVE", "INCLUSIVE", "NONE"]),
  termsAndConditions: z.string().trim().max(8000),
  paymentDetails: z.string().trim().max(4000),
  validityDays: z.number().finite().int().min(1).max(365),
});

function revalidateQuotationSettings() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/admin/settings/quotation`);
    revalidatePath(`/${locale}/admin/crm`);
    revalidatePath(`/${locale}/quotations`);
  }
}

function normalizeText(value: string | null | undefined, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function getQuotationSettings() {
  await checkAdmin();
  try {
    const settings = await db.query.quotationSettings.findFirst();
    return { success: true, settings: settings || null };
  } catch (error) {
    console.error("Failed to fetch quotation settings:", error);
    return { success: false, error: "Failed to fetch quotation settings." };
  }
}

export async function saveQuotationSettings(data: {
  companyName: string;
  companyAddress: string;
  taxId: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxMode: string;
  termsAndConditions: string;
  paymentDetails: string;
  validityDays: number;
}) {
  await checkAdmin();
  try {
    const parsed = quotationSettingsSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid quotation settings." };
    }

    const existing = await db.query.quotationSettings.findFirst();
    const values = {
      companyName: normalizeText(parsed.data.companyName, 180),
      companyAddress: normalizeText(parsed.data.companyAddress, 1000),
      taxId: normalizeText(parsed.data.taxId, 64),
      phone: normalizeText(parsed.data.phone, 64) || null,
      email: normalizeText(parsed.data.email, 180) || null,
      website: normalizeText(parsed.data.website, 255) || "solardream.co.th",
      taxMode: normalizeText(parsed.data.taxMode, 64),
      termsAndConditions: normalizeText(parsed.data.termsAndConditions, 8000),
      paymentDetails: normalizeText(parsed.data.paymentDetails, 4000),
      validityDays: parsed.data.validityDays,
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await db
        .update(quotationSettings)
        .set(values)
        .where(eq(quotationSettings.id, existing.id))
        .returning({ id: quotationSettings.id });
      if (!updated) return { success: false, error: "Quotation settings no longer exist. Refresh and try again." };
    } else {
      const [created] = await db.insert(quotationSettings).values(values).returning({ id: quotationSettings.id });
      if (!created) return { success: false, error: "Quotation settings could not be created." };
    }

    revalidateQuotationSettings();
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to save quotation settings:", error);
    return { success: false, error: "Failed to save quotation settings." };
  }
}
