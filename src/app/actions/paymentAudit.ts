"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activityLogs,
  paymentMilestones,
  paymentTransactions,
  proposals,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { and, eq } from "drizzle-orm";

export async function manuallyMarkPaymentTransactionPaid(
  transactionId: string,
  locale = "th",
) {
  try {
    const actor = await requireStaff();
    const normalizedTransactionId = transactionId.trim();

    if (!normalizedTransactionId) {
      return { success: false as const, error: "ไม่พบรหัสธุรกรรม" };
    }

    const result = await db.transaction(async (tx) => {
      const transaction = await tx.query.paymentTransactions.findFirst({
        where: eq(paymentTransactions.id, normalizedTransactionId),
      });

      if (!transaction) {
        return { success: false as const, error: "ไม่พบธุรกรรมนี้" };
      }
      if (transaction.status === "PAID") {
        return {
          success: true as const,
          proposalId: transaction.proposalId,
          alreadyPaid: true,
        };
      }

      const now = new Date();
      await tx
        .update(paymentTransactions)
        .set({
          status: "PAID",
          updatedAt: now,
          easyslipData: {
            ...(transaction.easyslipData &&
            typeof transaction.easyslipData === "object" &&
            !Array.isArray(transaction.easyslipData)
              ? transaction.easyslipData
              : {}),
            manualOverride: {
              actorId: actor.id,
              actorEmail: actor.email,
              markedPaidAt: now.toISOString(),
            },
          },
        })
        .where(
          and(
            eq(paymentTransactions.id, transaction.id),
            eq(paymentTransactions.proposalId, transaction.proposalId),
          ),
        );

      if (transaction.milestoneIndex !== null) {
        await tx
          .update(paymentMilestones)
          .set({
            status: "PAID",
            paidAt: now,
          })
          .where(
            and(
              eq(paymentMilestones.orderId, transaction.proposalId),
              eq(
                paymentMilestones.milestoneOrder,
                transaction.milestoneIndex,
              ),
            ),
          );

        const nextMilestone = await tx.query.paymentMilestones.findFirst({
          where: and(
            eq(paymentMilestones.orderId, transaction.proposalId),
            eq(
              paymentMilestones.milestoneOrder,
              transaction.milestoneIndex + 1,
            ),
          ),
          columns: {
            id: true,
            status: true,
          },
        });

        if (nextMilestone?.status === "PENDING") {
          await tx
            .update(paymentMilestones)
            .set({ status: "ACTIVE" })
            .where(eq(paymentMilestones.id, nextMilestone.id));
        }
      }

      const remainingMilestone =
        await tx.query.paymentMilestones.findFirst({
          where: and(
            eq(paymentMilestones.orderId, transaction.proposalId),
            eq(paymentMilestones.status, "PENDING"),
          ),
          columns: { id: true },
        });
      const activeMilestone =
        await tx.query.paymentMilestones.findFirst({
          where: and(
            eq(paymentMilestones.orderId, transaction.proposalId),
            eq(paymentMilestones.status, "ACTIVE"),
          ),
          columns: { id: true },
        });

      if (
        transaction.milestoneIndex === null ||
        (!remainingMilestone && !activeMilestone)
      ) {
        await tx
          .update(proposals)
          .set({
            status: "FULLY_PAID",
            paidAt: now,
          })
          .where(eq(proposals.id, transaction.proposalId));
      }

      await tx.insert(activityLogs).values({
        entityId: transaction.id,
        entityType: "PAYMENT_TRANSACTION",
        action: "MANUAL_PAYMENT_OVERRIDE",
        description: `${actor.name || actor.email || actor.id} manually marked payment transaction ${transaction.id} as PAID for proposal ${transaction.proposalId}.`,
        userId: actor.id,
      });

      return {
        success: true as const,
        proposalId: transaction.proposalId,
        alreadyPaid: false,
      };
    });

    if (result.success) {
      revalidatePath(`/${locale}/admin/orders/${result.proposalId}`);
    }
    return result;
  } catch (error) {
    console.error("[PAYMENT AUDIT] Manual override failed.", {
      transactionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      success: false as const,
      error: "ไม่สามารถอัปเดตสถานะธุรกรรมได้",
    };
  }
}
