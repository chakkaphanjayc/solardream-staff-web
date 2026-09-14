"use server";

import { db } from "@/db";
import { financingOptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  calculateFinancialPlan,
  type FinancialsPayload,
} from "@/lib/financialPlan";

/**
 * Calculates financial returns and matches eligible bank financing options.
 */
export async function calculateFinancials(
  systemCost: number,
  monthlyBill: number,
  estimatedSavingsPerMonth: number,
  propertyType: string,
): Promise<FinancialsPayload> {
  try {
    const allOptions = await db.query.financingOptions.findMany({
      where: eq(financingOptions.isActive, true),
    });
    return calculateFinancialPlan(systemCost, monthlyBill, estimatedSavingsPerMonth, propertyType, allOptions);
  } catch (error) {
    console.error("Error in calculateFinancials server action:", error);
    // Return safe default values if something fails
    return {
      paybackPeriodYears: 0,
      lifetimeSavings25Years: 0,
      financingOptions: [],
    };
  }
}
