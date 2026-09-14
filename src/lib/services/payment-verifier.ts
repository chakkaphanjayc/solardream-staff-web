import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  activityLogs,
  installationTasks,
  installationWorkflowProjects,
  integrationOutbox,
  paymentMilestones,
  paymentSlipRegistry,
  projectProgressions,
  proposals,
  quotationWorkflows,
  verifiedSlips,
} from "@/db/schema";
import { createAdminClient } from "@/utils/supabase/server";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import {
  ServiceSlipVerificationError,
  validateEasySlipServiceResponse,
} from "@/lib/serviceSlipContracts";
import { syncMilestonePaymentToERP } from "@/lib/erpnextPayments";
import { frappeRequest } from "@/lib/erpnext";
import { updateErpnextTask } from "@/lib/techPortalErpnext";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { getConfiguredAdminSiteUrl, getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { sendDiscordPaymentAlert } from "@/lib/discord";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";
import {
  PAYMENT_ERP_SYNC_TOPIC,
  PAYMENT_NOTIFICATION_TOPIC,
} from "@/lib/paymentTopics";
import type { PortalAccess } from "@/lib/portalAccess";

const EASYSLIP_VERIFY_URL = "https://api.easyslip.com/v2/verify/bank";
const MAX_SLIP_BYTES = 12 * 1024 * 1024;
const ALLOWED_SLIP_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp"];

type JsonRecord = Record<string, unknown>;

export type PaymentVerificationSource = {
  file?: File;
  slipImageUrl?: string;
  rawPayload?: string;
  qrString?: string;
};

export type PaymentVerificationErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "DUPLICATE"
  | "AMOUNT"
  | "RECEIVER"
  | "REJECTED"
  | "INCOMPLETE"
  | "CONFIGURATION"
  | "EXTERNAL"
  | "ERP_SYNC";

export class PaymentVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: PaymentVerificationErrorCode,
  ) {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

type ErpSyncSnapshot = {
  salesInvoiceId: string | null;
  paymentEntryId: string | null;
  accountingTreatment: string | null;
};

type FinalizedPayment = {
  quotationId: string;
  milestoneId: string;
  milestoneIndex: number;
  milestoneName: string;
  amount: number;
  transRef: string;
  receiverAccount: string;
  slipImageUrl: string;
  paidAt: Date;
  isFullyPaid: boolean;
  nextMilestoneIndex: number | null;
  verifiedSlipId: string;
  idempotent: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPostgresErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  if (typeof error.code === "string") return error.code;
  return getPostgresErrorCode(error.cause);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeBankAccount(value: string) {
  return value.replace(/[^0-9a-z]/gi, "").toLowerCase();
}

function isSecureUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function mapEasySlipError(error: unknown): PaymentVerificationError {
  if (error instanceof PaymentVerificationError) return error;
  if (error instanceof ServiceSlipVerificationError) {
    switch (error.code) {
      case "CONFIGURATION":
        return new PaymentVerificationError(
          "Slip verification is not configured. Please try again later.",
          "CONFIGURATION",
        );
      case "DUPLICATE":
        return new PaymentVerificationError(
          "This slip has already been verified and cannot be reused.",
          "DUPLICATE",
        );
      case "AMOUNT":
        return new PaymentVerificationError(
          "The slip amount does not match this payment milestone.",
          "AMOUNT",
        );
      case "RECEIVER":
        return new PaymentVerificationError(
          "The receiving bank account does not match SolarDream.",
          "RECEIVER",
        );
      case "INCOMPLETE":
        return new PaymentVerificationError(
          "EasySlip could not read a complete transaction reference from this slip.",
          "INCOMPLETE",
        );
      case "REJECTED":
        return new PaymentVerificationError(
          "EasySlip rejected this slip as invalid or unauthentic.",
          "REJECTED",
        );
    }
  }

  return new PaymentVerificationError(
    "EasySlip could not verify this slip. Please upload a clear, uncropped slip and try again.",
    "EXTERNAL",
  );
}

async function callEasySlip(
  source: PaymentVerificationSource,
  expectedAmount: string,
) {
  const apiKey = process.env.EASYSLIP_API_KEY?.trim();
  if (!apiKey) {
    throw new PaymentVerificationError(
      "Slip verification is not configured. Please try again later.",
      "CONFIGURATION",
    );
  }

  const matchFields = {
    matchAccount: "true",
    matchAmount: expectedAmount,
    checkDuplicate: "true",
  };

  let body: BodyInit;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (source.file) {
    const form = new FormData();
    form.append("image", source.file, source.file.name || "payment-slip");
    for (const [key, value] of Object.entries(matchFields)) form.set(key, value);
    body = form;
  } else if (source.slipImageUrl) {
    if (!isSecureUrl(source.slipImageUrl)) {
      throw new PaymentVerificationError(
        "The slip image URL must use HTTPS.",
        "INVALID_INPUT",
      );
    }
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ url: source.slipImageUrl, ...matchFields });
  } else {
    const rawPayload = source.rawPayload?.trim() || source.qrString?.trim() || "";
    if (!rawPayload) {
      throw new PaymentVerificationError(
        "Upload a payment slip or provide the raw bank QR payload.",
        "INVALID_INPUT",
      );
    }
    const form = new FormData();
    form.set("data", rawPayload);
    for (const [key, value] of Object.entries(matchFields)) form.set(key, value);
    body = form;
  }

  let response: Response;
  try {
    response = await fetch(EASYSLIP_VERIFY_URL, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error: unknown) {
    console.error("[EasySlip] Verification request failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new PaymentVerificationError(
      "The bank verification service is temporarily unavailable. Please try again.",
      "EXTERNAL",
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    console.warn("[EasySlip] Verification was rejected.", { status: response.status });
    throw mapEasySlipError(new ServiceSlipVerificationError(response.status === 409 ? "DUPLICATE" : "REJECTED"));
  }

  const receiverAccount =
    process.env.EASYSLIP_RECEIVER_ACCOUNT?.trim() ||
    process.env.COMPANY_BANK_ACCOUNT?.trim() ||
    "";
  const receiverName =
    process.env.EASYSLIP_RECEIVER_NAME?.trim() ||
    process.env.COMPANY_BANK_ACCOUNT_NAME?.trim() ||
    "";

  try {
    return validateEasySlipServiceResponse(payload, expectedAmount, {
      account: receiverAccount,
      name: receiverName,
    });
  } catch (error: unknown) {
    throw mapEasySlipError(error);
  }
}

async function storeSlipFile(input: {
  file: File;
  quotationId: string;
  milestoneId: string;
  safeFileName: string;
  contentType: string;
}) {
  try {
    const path = [
      "payment-verification",
      input.quotationId,
      input.milestoneId,
      `${crypto.randomUUID()}-${input.safeFileName}`,
    ].join("/");
    const storage = createAdminClient().storage.from("proposals");
    const upload = await storage.upload(path, input.file, {
      contentType: input.contentType,
      upsert: false,
    });
    if (upload.error) throw upload.error;
    return storage.getPublicUrl(path).data.publicUrl;
  } catch (error: unknown) {
    console.warn("[Payment Verification] Slip archive upload failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return "";
  }
}

export async function advanceProjectPaymentPhase(input: {
  quotationId: string;
  milestoneIndex: number;
}) {
  const project = await db.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.proposalId, input.quotationId),
    columns: { id: true, erpnextProjectId: true },
  });
  if (!project) return;

  const phase =
    input.milestoneIndex <= 1
      ? "PHASE_1_DEPOSIT"
      : input.milestoneIndex === 2
        ? "PHASE_2_INSTALLATION"
        : "PHASE_3_HANDOVER";
  const completedPhases =
    input.milestoneIndex <= 1
      ? []
      : input.milestoneIndex === 2
        ? ["PHASE_1_DEPOSIT"]
        : ["PHASE_1_DEPOSIT", "PHASE_2_INSTALLATION"];

  await db
    .insert(projectProgressions)
    .values({
      proposalId: input.quotationId,
      currentPhase: phase,
      completedPhases,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: projectProgressions.proposalId,
      set: {
        currentPhase: phase,
        completedPhases,
        updatedAt: new Date(),
      },
    });

  const tasks = await db.query.installationTasks.findMany({
    where: eq(installationTasks.projectId, project.id),
    orderBy: [asc(installationTasks.sequence)],
    columns: {
      id: true,
      erpnextTaskId: true,
      taskCode: true,
      status: true,
    },
  });
  const taskSuffix = input.milestoneIndex <= 1
    ? ":SITE_SURVEY"
    : input.milestoneIndex === 2
      ? ":INSTALLATION"
      : ":HANDOVER";
  const task = tasks.find((candidate) => candidate.taskCode.endsWith(taskSuffix))
    || (input.milestoneIndex === 2
      ? tasks.find((candidate) => candidate.taskCode.endsWith(":INSTALLATION_EXECUTION"))
      : undefined);

  try {
    if (task && !["COMPLETED", "CANCELLED", "IN_PROGRESS"].includes(task.status)) {
      if (task.erpnextTaskId) {
        await updateErpnextTask({ taskId: task.erpnextTaskId, status: "Working", progress: 0 });
      }
      await db
        .update(installationTasks)
        .set({ status: "IN_PROGRESS", updatedAt: new Date() })
        .where(eq(installationTasks.id, task.id));
    }
    if (project.erpnextProjectId) {
      await frappeRequest(
        "PUT",
        `/api/resource/Project/${encodeURIComponent(project.erpnextProjectId)}`,
        { data: { status: "Open" } },
      );
    }
  } catch (error: unknown) {
    console.error("[Payment Verification] Project phase sync failed.", {
      quotationId: input.quotationId,
      milestoneIndex: input.milestoneIndex,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function enqueueErpSync(input: { quotationId: string; milestoneId: string; milestoneIndex: number; transRef: string }) {
  await db
    .insert(integrationOutbox)
    .values({
      topic: PAYMENT_ERP_SYNC_TOPIC,
      aggregateType: "PAYMENT_MILESTONE",
      aggregateId: input.quotationId,
      payload: { milestoneId: input.milestoneId, milestoneIndex: input.milestoneIndex, transRef: input.transRef },
      dedupeKey: `${PAYMENT_ERP_SYNC_TOPIC}:${input.milestoneId}`,
    })
    .onConflictDoNothing({ target: integrationOutbox.dedupeKey });
}

async function enqueuePaymentNotifications(input: { quotationId: string; verifiedSlipId: string }) {
  await db
    .insert(integrationOutbox)
    .values({
      topic: PAYMENT_NOTIFICATION_TOPIC,
      aggregateType: "PAYMENT_MILESTONE",
      aggregateId: input.quotationId,
      payload: { verifiedSlipId: input.verifiedSlipId },
      dedupeKey: `${PAYMENT_NOTIFICATION_TOPIC}:${input.verifiedSlipId}`,
    })
    .onConflictDoNothing({ target: integrationOutbox.dedupeKey });
}

async function finalizePayment(input: {
  quotationId: string;
  milestoneIndex: number;
  amount: number;
  transRef: string;
  receiverAccount: string;
  slipImageUrl: string;
  rawData: JsonRecord;
}) {
  const paidAt = new Date();

  return db.transaction(async (tx): Promise<FinalizedPayment> => {
    const milestone = await tx.query.paymentMilestones.findFirst({
      where: and(
        eq(paymentMilestones.orderId, input.quotationId),
        eq(paymentMilestones.milestoneOrder, input.milestoneIndex),
      ),
      columns: {
        id: true,
        orderId: true,
        milestoneOrder: true,
        milestoneName: true,
        amount: true,
        status: true,
      },
    });
    if (!milestone) {
      throw new PaymentVerificationError("Payment milestone not found.", "NOT_FOUND");
    }

    const existingSlip = await tx.query.verifiedSlips.findFirst({
      where: eq(verifiedSlips.transRef, input.transRef),
      columns: { id: true, orderId: true, amount: true },
    });
    if (existingSlip) {
      const existingMilestone = await tx.query.paymentMilestones.findFirst({
        where: eq(paymentMilestones.verifiedSlipId, existingSlip.id),
        columns: { id: true, orderId: true, milestoneOrder: true, milestoneName: true, status: true, amount: true, paidAt: true },
      });
      if (
        existingSlip.orderId === input.quotationId &&
        existingMilestone?.id === milestone.id &&
        Math.abs(Number(existingSlip.amount) - input.amount) <= 0.01
      ) {
        const next = await tx.query.paymentMilestones.findFirst({
          where: and(
            eq(paymentMilestones.orderId, input.quotationId),
            eq(paymentMilestones.milestoneOrder, input.milestoneIndex + 1),
          ),
          columns: { milestoneOrder: true },
        });
        return {
          quotationId: input.quotationId,
          milestoneId: milestone.id,
          milestoneIndex: milestone.milestoneOrder,
          milestoneName: milestone.milestoneName,
          amount: Number(existingSlip.amount),
          transRef: input.transRef,
          receiverAccount: input.receiverAccount,
          slipImageUrl: input.slipImageUrl,
          paidAt: existingMilestone.paidAt || paidAt,
          isFullyPaid: !next,
          nextMilestoneIndex: next?.milestoneOrder || null,
          verifiedSlipId: existingSlip.id,
          idempotent: true,
        };
      }
      throw new PaymentVerificationError(
        "This transaction reference has already been used for another payment.",
        "DUPLICATE",
      );
    }

    const registryEntry = await tx.query.paymentSlipRegistry.findFirst({
      where: eq(paymentSlipRegistry.transRef, input.transRef),
      columns: { sourceId: true },
    });
    if (registryEntry) {
      throw new PaymentVerificationError(
        "This transaction reference has already been used for another payment.",
        "DUPLICATE",
      );
    }

    if (milestone.status === "PAID") {
      throw new PaymentVerificationError(
        "This payment milestone has already been paid.",
        "CONFLICT",
      );
    }
    if (milestone.status !== "ACTIVE") {
      throw new PaymentVerificationError(
        "This payment milestone is not currently open for payment.",
        "CONFLICT",
      );
    }
    if (Math.abs(Number(milestone.amount) - input.amount) > 0.01) {
      throw new PaymentVerificationError(
        "The slip amount does not match this payment milestone.",
        "AMOUNT",
      );
    }

    const proposal = await tx.query.proposals.findFirst({
      where: eq(proposals.id, input.quotationId),
      columns: { id: true, userId: true, status: true, fulfillmentType: true },
    });
    if (!proposal) throw new PaymentVerificationError("Quotation not found.", "NOT_FOUND");

    try {
      await tx.insert(paymentSlipRegistry).values({
        transRef: input.transRef,
        sourceType: "PROPOSAL",
        sourceId: milestone.id,
        amount: input.amount.toFixed(2),
      });
      const [verifiedSlip] = await tx
        .insert(verifiedSlips)
        .values({
          orderId: input.quotationId,
          customerId: proposal.userId,
          transRef: input.transRef,
          receiverAccount: input.receiverAccount,
          amount: input.amount.toFixed(2),
          slipImageUrl: input.slipImageUrl,
          rawData: input.rawData,
          verifiedAt: paidAt,
        })
        .returning({ id: verifiedSlips.id });

      if (!verifiedSlip) {
        throw new Error("Verified slip record was not created.");
      }

      const nextMilestone = await tx.query.paymentMilestones.findFirst({
        where: and(
          eq(paymentMilestones.orderId, input.quotationId),
          eq(paymentMilestones.milestoneOrder, input.milestoneIndex + 1),
        ),
        columns: { id: true, milestoneOrder: true, status: true },
      });
      const [updatedMilestone] = await tx
        .update(paymentMilestones)
        .set({ status: "PAID", paidAt, verifiedSlipId: verifiedSlip.id })
        .where(and(eq(paymentMilestones.id, milestone.id), eq(paymentMilestones.status, "ACTIVE")))
        .returning({ id: paymentMilestones.id });
      if (!updatedMilestone) {
        throw new PaymentVerificationError("This payment milestone was updated by another request.", "CONFLICT");
      }

      if (nextMilestone) {
        await tx
          .update(paymentMilestones)
          .set({ status: "ACTIVE" })
          .where(and(eq(paymentMilestones.id, nextMilestone.id), eq(paymentMilestones.status, "PENDING")));
      }

      const isFullyPaid = !nextMilestone;
      const nextStatus = isFullyPaid
        ? "FULLY_PAID"
        : proposal.fulfillmentType === "INSTALLATION" && input.milestoneIndex === 1
          ? "INSTALLING"
          : proposal.status;
      const nextPaymentStatus = isFullyPaid
        ? "FULLY_PAID" as const
        : input.milestoneIndex <= 2
          ? "DEPOSIT_PAID" as const
          : "DEPOSIT_PENDING" as const;
      await tx.update(proposals).set({
        status: nextStatus,
        paymentStatus: nextPaymentStatus,
        currentMilestoneStep: nextMilestone?.milestoneOrder || input.milestoneIndex,
        ...(isFullyPaid ? { paidAt } : {}),
      }).where(eq(proposals.id, input.quotationId));

      await tx.insert(quotationWorkflows).values({
        proposalId: input.quotationId,
        currentStep: 3,
        paymentConfirmedAt: paidAt,
        updatedAt: paidAt,
      }).onConflictDoUpdate({
        target: quotationWorkflows.proposalId,
        set: { currentStep: 3, paymentConfirmedAt: paidAt, updatedAt: paidAt },
      });

      if (isFullyPaid) {
        await enqueueIntegrationEvent(tx, {
          topic: "payment.completed",
          eventVersion: 1,
          aggregateType: "PROPOSAL",
          aggregateId: input.quotationId,
          correlationId: "payment:" + verifiedSlip.id,
          payload: {
            proposalId: input.quotationId,
            paymentId: verifiedSlip.id,
            milestoneId: milestone.id,
            paidAt: paidAt.toISOString(),
          },
          dedupeKey: "payment.completed:" + verifiedSlip.id,
        });
      }

      await tx.insert(activityLogs).values({
        entityId: input.quotationId,
        entityType: "QUOTATION",
        action: "PAYMENT_VERIFIED_EASYSLIP",
        description: `Payment milestone ${milestone.milestoneOrder} verified by EasySlip. Transaction reference: ${input.transRef}.`,
        userId: proposal.userId,
        createdAt: paidAt,
      });

      return {
        quotationId: input.quotationId,
        milestoneId: milestone.id,
        milestoneIndex: milestone.milestoneOrder,
        milestoneName: milestone.milestoneName,
        amount: roundCurrency(input.amount),
        transRef: input.transRef,
        receiverAccount: input.receiverAccount,
        slipImageUrl: input.slipImageUrl,
        paidAt,
        isFullyPaid,
        nextMilestoneIndex: nextMilestone?.milestoneOrder || null,
        verifiedSlipId: verifiedSlip.id,
        idempotent: false,
      };
    } catch (error: unknown) {
      if (getPostgresErrorCode(error) === "23505") {
        throw new PaymentVerificationError(
          "This transaction reference or milestone has already been processed.",
          "DUPLICATE",
        );
      }
      throw error;
    }
  });
}

export async function verifyPaymentForQuotation(input: {
  access: PortalAccess;
  quotationId: string;
  milestoneIndex: number;
  source: PaymentVerificationSource;
}) {
  if (input.access.proposal.id !== input.quotationId) {
    throw new PaymentVerificationError("Quotation access was denied.", "UNAUTHORIZED");
  }
  if (!Number.isInteger(input.milestoneIndex) || input.milestoneIndex < 1 || input.milestoneIndex > 100) {
    throw new PaymentVerificationError("Payment milestone index is invalid.", "INVALID_INPUT");
  }

  let validatedFile: Awaited<ReturnType<typeof validateUploadFile>> | null = null;
  if (input.source.file) {
    try {
      validatedFile = await validateUploadFile({
        file: input.source.file,
        allowedKinds: ALLOWED_SLIP_KINDS,
        fallbackName: "payment-slip",
        maxBytes: MAX_SLIP_BYTES,
      });
    } catch (error: unknown) {
      throw new PaymentVerificationError(
        error instanceof Error ? error.message : "Upload a JPG, PNG, or WEBP payment slip.",
        "INVALID_INPUT",
      );
    }
  }

  const milestone = await db.query.paymentMilestones.findFirst({
    where: and(
      eq(paymentMilestones.orderId, input.quotationId),
      eq(paymentMilestones.milestoneOrder, input.milestoneIndex),
    ),
    columns: { id: true, status: true, amount: true },
  });
  if (!milestone) throw new PaymentVerificationError("Payment milestone not found.", "NOT_FOUND");
  if (milestone.status === "PAID") {
    throw new PaymentVerificationError("This payment milestone has already been paid.", "CONFLICT");
  }
  if (milestone.status !== "ACTIVE") {
    throw new PaymentVerificationError("This payment milestone is not currently open for payment.", "CONFLICT");
  }

  const expectedAmount = Number(milestone.amount);
  if (!Number.isFinite(expectedAmount)) {
    throw new PaymentVerificationError("This payment milestone has an invalid amount.", "EXTERNAL");
  }

  const slip = await callEasySlip(input.source, expectedAmount.toFixed(2));
  if (Math.abs(Number(slip.amount) - expectedAmount) > 0.01) {
    throw new PaymentVerificationError(
      "The slip amount does not match this payment milestone.",
      "AMOUNT",
    );
  }
  if (!slip.receiverAccount || !normalizeBankAccount(slip.receiverAccount)) {
    throw new PaymentVerificationError("The receiving bank account is missing.", "RECEIVER");
  }

  const slipImageUrl = input.source.file && validatedFile
    ? await storeSlipFile({
        file: input.source.file,
        quotationId: input.quotationId,
        milestoneId: milestone.id,
        safeFileName: validatedFile.safeFileName,
        contentType: validatedFile.contentType,
      })
    : input.source.slipImageUrl || "";

  const finalized = await finalizePayment({
    quotationId: input.quotationId,
    milestoneIndex: input.milestoneIndex,
    amount: Number(slip.amount),
    transRef: slip.transRef,
    receiverAccount: slip.receiverAccount,
    slipImageUrl,
    rawData: isRecord(slip.payload) ? slip.payload : { rawSlip: slip.rawSlip },
  });

  let erpSync: ErpSyncSnapshot | null = null;
  let erpSyncStatus: "SYNCED" | "PENDING" = "PENDING";
  try {
    const synced = await syncMilestonePaymentToERP(finalized.milestoneId, finalized.transRef);
    erpSync = {
      salesInvoiceId: "salesInvoiceId" in synced && typeof synced.salesInvoiceId === "string" ? synced.salesInvoiceId : null,
      paymentEntryId: "paymentEntryId" in synced && typeof synced.paymentEntryId === "string" ? synced.paymentEntryId : null,
      accountingTreatment: "accountingTreatment" in synced && typeof synced.accountingTreatment === "string" ? synced.accountingTreatment : null,
    };
    erpSyncStatus = "SYNCED";
    await advanceProjectPaymentPhase({ quotationId: input.quotationId, milestoneIndex: input.milestoneIndex });
  } catch (error: unknown) {
    console.error("[Payment Verification] ERPNext payment sync failed; queued for retry.", {
      quotationId: input.quotationId,
      milestoneId: finalized.milestoneId,
      transRef: finalized.transRef,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    await enqueueErpSync({
      quotationId: input.quotationId,
      milestoneId: finalized.milestoneId,
      milestoneIndex: finalized.milestoneIndex,
      transRef: finalized.transRef,
    });
  }

  await enqueuePaymentNotifications({
    quotationId: input.quotationId,
    verifiedSlipId: finalized.verifiedSlipId,
  });

  const paidMilestones = await db.query.paymentMilestones.findMany({
    where: eq(paymentMilestones.orderId, input.quotationId),
    columns: { amount: true, status: true },
  });
  const totalPaid = paidMilestones
    .filter((row) => row.status === "PAID")
    .reduce((total, row) => total + Number(row.amount), 0);
  const totalAmount = paidMilestones.reduce((total, row) => total + Number(row.amount), 0);

  return {
    payment: finalized,
    erpSync,
    erpSyncStatus,
    progress: {
      paidAmount: roundCurrency(totalPaid),
      totalAmount: roundCurrency(totalAmount),
      paidPercent: totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : 0,
    },
  };
}

export async function dispatchVerifiedPaymentNotifications(input: { quotationId: string; verifiedSlipId: string }) {
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, input.quotationId),
    columns: {
      id: true,
      erpnextQuotationId: true,
    },
    with: {
      user: {
        columns: {
          name: true,
          fullName: true,
          email: true,
          lineUserId: true,
          isLineBlocked: true,
        },
      },
    },
  });
  const slip = await db.query.verifiedSlips.findFirst({
    where: and(eq(verifiedSlips.id, input.verifiedSlipId), eq(verifiedSlips.orderId, input.quotationId)),
    columns: { transRef: true, receiverAccount: true, amount: true, verifiedAt: true },
  });
  const milestone = slip
    ? await db.query.paymentMilestones.findFirst({
        where: eq(paymentMilestones.verifiedSlipId, input.verifiedSlipId),
        columns: { milestoneName: true },
      })
    : null;
  if (!proposal?.user || !slip || !milestone) {
    throw new Error("Verified payment notification data is incomplete.");
  }

  const customerName = proposal.user.fullName || proposal.user.name || proposal.user.email;
  const quotationId = proposal.erpnextQuotationId || proposal.id;
  const publicSiteUrl = getConfiguredPublicSiteUrl();
  const language = "th";
  const projectProgressUrl = `${publicSiteUrl}/${language}/portal/${encodeURIComponent(proposal.id)}`;
  const adminUrl = `${getConfiguredAdminSiteUrl()}/${language}/admin/crm/${encodeURIComponent(proposal.id)}`;

  const [discordResult, customerResult] = await Promise.all([
    sendDiscordPaymentAlert({
      customerName,
      quotationId,
      milestoneName: milestone.milestoneName,
      amount: Number(slip.amount),
      bankAccount: slip.receiverAccount,
      transRef: slip.transRef,
      actionUrl: adminUrl,
    }),
    NotificationOrchestrator("PAYMENT_VERIFIED", {
      customerName,
      phone: "",
      email: proposal.user.email,
      lineUserId: proposal.user.isLineBlocked ? null : proposal.user.lineUserId,
      quotationId,
      projectId: proposal.id,
      proposalUrl: projectProgressUrl,
      paymentAmount: Number(slip.amount),
      paymentMilestoneName: milestone.milestoneName,
      paymentBankAccount: slip.receiverAccount,
      paymentTransRef: slip.transRef,
      projectProgressUrl,
      paymentActionUrl: projectProgressUrl,
      milestoneDetails: `Verified at ${slip.verifiedAt.toISOString()}`,
    }),
  ]);

  if (!discordResult) console.warn("[Payment Notifications] Discord payment alert was not delivered.");
  if (!customerResult.success) {
    throw new Error(customerResult.errors?.join("; ") || "Customer payment notification failed.");
  }

  return { discordDelivered: discordResult, customerNotification: customerResult };
}
