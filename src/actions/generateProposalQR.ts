"use server";

import generatePayload from "promptpay-qr";
import { db } from "@/db";
import {
  paymentMilestones,
  paymentTransactions,
  proposals,
  users,
} from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { getConfiguredPromptPayId } from "@/lib/promptpay";

const SUPPLY_EXPIRY_MS = 30 * 60 * 1000;
const PROJECT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const STAFF_ROLES = new Set([
  "ADMIN",
  "SUPER_ADMIN",
  "MANAGER",
  "STAFF",
]);

export type ProposalPaymentType =
  | "SUPPLY_ONLY"
  | "INSTALLATION";

export type GenerateProposalQRResult =
  | {
      success: true;
      transaction: {
        id: string;
        proposalId: string;
        amount: number;
        milestoneIndex: number | null;
        qrString: string;
        qrImageUrl: string;
        expiresAt: Date;
        status: "PENDING";
        createdAt: Date;
        reused: boolean;
      };
    }
  | {
      success: false;
      error: string;
    };

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildPromptPayImageUrl(targetId: string, amount: number) {
  return `https://promptpay.io/${encodeURIComponent(targetId)}/${amount.toFixed(2)}.png`;
}

export async function generateProposalQR(
  proposalId: string,
  amount: number,
  type: ProposalPaymentType,
): Promise<GenerateProposalQRResult> {
  try {
    const normalizedProposalId = proposalId.trim();
    const requestedAmount = roundCurrency(Number(amount));

    if (
      !normalizedProposalId ||
      !Number.isFinite(requestedAmount) ||
      requestedAmount <= 0
    ) {
      return { success: false, error: "Invalid payment request." };
    }
    if (type !== "SUPPLY_ONLY" && type !== "INSTALLATION") {
      return { success: false, error: "Invalid payment type." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const [proposal, actor] = await Promise.all([
      db.query.proposals.findFirst({
        where: eq(proposals.id, normalizedProposalId),
        columns: {
          id: true,
          userId: true,
          totalPrice: true,
          fulfillmentType: true,
        },
      }),
      db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { role: true },
      }),
    ]);

    if (
      !proposal ||
      (proposal.userId !== user.id &&
        (!actor || !STAFF_ROLES.has(actor.role)))
    ) {
      return { success: false, error: "Proposal not found." };
    }
    if (proposal.fulfillmentType !== type) {
      return {
        success: false,
        error: "Payment type does not match this proposal.",
      };
    }

    let payableAmount = roundCurrency(Number(proposal.totalPrice));
    let milestoneIndex: number | null = null;

    if (type === "INSTALLATION") {
      const activeMilestone = await db.query.paymentMilestones.findFirst({
        where: and(
          eq(paymentMilestones.orderId, proposal.id),
          eq(paymentMilestones.status, "ACTIVE"),
        ),
        columns: {
          milestoneOrder: true,
          amount: true,
        },
      });

      if (!activeMilestone) {
        return {
          success: false,
          error: "No active project payment milestone was found.",
        };
      }
      payableAmount = roundCurrency(Number(activeMilestone.amount));
      milestoneIndex = activeMilestone.milestoneOrder;
    }

    if (Math.abs(requestedAmount - payableAmount) > 0.01) {
      return {
        success: false,
        error: "Payment amount does not match the amount currently due.",
      };
    }

    const targetId = getConfiguredPromptPayId();
    if (!targetId) {
      console.warn("[PAYMENT QR] NEXT_PUBLIC_PROMPTPAY_ID is not configured. QR generation was blocked.");
      return {
        success: false,
        error: "ระบบชำระเงินยังไม่ได้ตั้งค่า PromptPay กรุณาติดต่อทีมงาน",
      };
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        (type === "SUPPLY_ONLY"
          ? SUPPLY_EXPIRY_MS
          : PROJECT_EXPIRY_MS),
    );

    const transaction = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`payment-qr:${proposal.id}:${milestoneIndex ?? "upfront"}`}))`,
      );

      await tx
        .update(paymentTransactions)
        .set({
          status: "EXPIRED",
          updatedAt: now,
        })
        .where(
          and(
            eq(paymentTransactions.proposalId, proposal.id),
            eq(paymentTransactions.status, "PENDING"),
            lte(paymentTransactions.expiresAt, now),
          ),
        );

      const pendingTransaction =
        await tx.query.paymentTransactions.findFirst({
          where: and(
            eq(paymentTransactions.proposalId, proposal.id),
            eq(paymentTransactions.status, "PENDING"),
            gt(paymentTransactions.expiresAt, now),
            milestoneIndex === null
              ? isNull(paymentTransactions.milestoneIndex)
              : eq(
                  paymentTransactions.milestoneIndex,
                  milestoneIndex,
                ),
            eq(
              paymentTransactions.amount,
              payableAmount.toFixed(2),
            ),
          ),
          orderBy: (table, { desc }) => [desc(table.createdAt)],
        });

      if (pendingTransaction) {
        return { row: pendingTransaction, reused: true };
      }

      const qrString = generatePayload(targetId, {
        amount: payableAmount,
      });
      const [createdTransaction] = await tx
        .insert(paymentTransactions)
        .values({
          proposalId: proposal.id,
          amount: payableAmount.toFixed(2),
          milestoneIndex,
          qrString,
          expiresAt,
          status: "PENDING",
          updatedAt: now,
        })
        .returning();

      return { row: createdTransaction, reused: false };
    });

    return {
      success: true,
      transaction: {
        id: transaction.row.id,
        proposalId: transaction.row.proposalId,
        amount: Number(transaction.row.amount),
        milestoneIndex: transaction.row.milestoneIndex,
        qrString: transaction.row.qrString,
        qrImageUrl: buildPromptPayImageUrl(
          targetId,
          Number(transaction.row.amount),
        ),
        expiresAt: transaction.row.expiresAt,
        status: "PENDING",
        createdAt: transaction.row.createdAt,
        reused: transaction.reused,
      },
    };
  } catch (error) {
    console.error("[PAYMENT QR] Failed to generate proposal QR.", {
      proposalId,
      type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      success: false,
      error: "Unable to generate a payment QR. Please try again.",
    };
  }
}
