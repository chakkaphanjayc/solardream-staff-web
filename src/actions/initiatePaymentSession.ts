"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryHolds, proposals } from "@/db/schema";
import { initializeOrderCheckout } from "@/app/actions/payments";
import { generateProposalQR } from "@/actions/generateProposalQR";
import { getConfiguredPromptPayId } from "@/lib/promptpay";

export type InitiatePaymentSessionResult =
  | {
      success: true;
      transactionId: string;
      qrString: string;
      qrImageUrl: string;
      amount: number;
      expiresAt: Date;
      reused: boolean;
      warning?: string;
    }
  | {
      success: false;
      error: string;
    };

export async function initiatePaymentSession(
  quotationId: string,
): Promise<InitiatePaymentSessionResult> {
  const normalizedQuotationId = quotationId.trim();
  if (!normalizedQuotationId) {
    return { success: false, error: "ไม่พบรหัสใบเสนอราคา" };
  }

  if (!getConfiguredPromptPayId()) {
    console.warn("[PAYMENT SESSION] NEXT_PUBLIC_PROMPTPAY_ID is not configured. Payment session was blocked.");
    return {
      success: false,
      error: "ระบบชำระเงินยังไม่ได้ตั้งค่า PromptPay กรุณาติดต่อทีมงาน",
    };
  }

  try {
    const checkout = await initializeOrderCheckout(normalizedQuotationId);
    if (checkout.success !== true || !("strategy" in checkout)) {
      return {
        success: false,
        error:
          "error" in checkout && typeof checkout.error === "string"
            ? checkout.error
            : "ไม่สามารถเตรียมรายการชำระเงินได้",
      };
    }
    if (checkout.strategy !== "SUPPLY_ONLY") {
      return {
        success: false,
        error: "การล็อกสต็อกใช้ได้เฉพาะคำสั่งซื้ออุปกรณ์เท่านั้น",
      };
    }

    const qrResult = await generateProposalQR(
      checkout.orderId,
      checkout.amountDue,
      "SUPPLY_ONLY",
    );
    if (!qrResult.success) {
      return qrResult;
    }

    const expiresAt = qrResult.transaction.expiresAt;
    await db.transaction(async (tx) => {
      await tx
        .update(inventoryHolds)
        .set({ expiresAt })
        .where(eq(inventoryHolds.orderId, checkout.orderId));

      await tx
        .update(proposals)
        .set({
          status: "AWAITING_PAYMENT_LOCKED",
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, checkout.orderId));
    });

    return {
      success: true,
      transactionId: qrResult.transaction.id,
      qrString: qrResult.transaction.qrString,
      qrImageUrl: qrResult.transaction.qrImageUrl,
      amount: qrResult.transaction.amount,
      expiresAt,
      reused: qrResult.transaction.reused,
    };
  } catch (error) {
    console.error("[PAYMENT SESSION] Failed to initiate payment session.", {
      quotationId: normalizedQuotationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      success: false,
      error: "ไม่สามารถเริ่มรอบชำระเงินได้ กรุณาลองใหม่อีกครั้ง",
    };
  }
}
