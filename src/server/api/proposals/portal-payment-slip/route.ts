import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { activityLogs, paymentRequests, paymentSlipRegistry, proposals, verifiedSlips } from "@/db/schema";
import {
  validateUploadContentLength,
  validateUploadFile,
  type UploadFileKind,
} from "@/lib/fileValidation";
import {
  extractDriveFileId,
  getOrCreateCustomerFolder,
  getOrCreateProposalFolder,
  getOrCreateSubfolder,
  uploadFileToDrive,
} from "@/lib/googleDrive";
import { createAdminClient } from "@/utils/supabase/server";
import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { SALES_NOTIFICATION_TOPICS } from "@/lib/salesNotificationConfig";

export const maxDuration = 60;

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_SIZE + 1024 * 1024;
const ALLOWED_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic", "pdf"];

type JsonRecord = Record<string, unknown>;

class PaymentSlipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentSlipValidationError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getNestedRecord(value: unknown, path: readonly string[]): JsonRecord | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return isRecord(cursor) ? cursor : null;
}

function getNestedText(value: unknown, path: readonly string[]): string {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return "";
    cursor = cursor[key];
  }
  return typeof cursor === "string" ? cursor.trim() : "";
}

function getNestedNumber(value: unknown, path: readonly string[]): number {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return Number.NaN;
    cursor = cursor[key];
  }
  const parsed = typeof cursor === "number" ? cursor : typeof cursor === "string" ? Number(cursor) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeBankAccount(value: string): string {
  return value.replace(/[-\s]/g, "");
}

function getVerificationReviewReason(error: unknown) {
  return error instanceof PaymentSlipValidationError
    ? error.message
    : "Slip verification needs staff review.";
}

function serializePaymentRequest(row: typeof paymentRequests.$inferSelect) {
  const metadata = isRecord(row.easySlipData) ? row.easySlipData : {};
  const getMetadataText = (key: string) => {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  return {
    id: row.id,
    proposalId: row.proposalId,
    title: row.title,
    amountRequested: String(row.amountRequested),
    paymentType: row.paymentType,
    paymentMethod: row.paymentMethod,
    status: row.status,
    slipUrl: row.slipUrl,
    slipImageUrl: row.slipImageUrl,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() || null,
    storageProvider: row.storageProvider || getMetadataText("storageProvider"),
    storageFileId: row.storageFileId,
    fallbackUrl: row.fallbackUrl || getMetadataText("fallbackUrl"),
    verificationStatus: getMetadataText("verificationStatus"),
    verificationError: getMetadataText("verificationError"),
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = validateUploadContentLength(request.headers, MAX_REQUEST_BYTES);
    if (!contentLength.ok) {
      return portalJson(
        { success: false, error: contentLength.error },
        { status: contentLength.status },
      );
    }

    const formData = await request.formData();
    const proposalId = String(formData.get("proposal_id") || "").trim();
    const paymentRequestId = String(formData.get("payment_request_id") || "").trim();
    const file = formData.get("file");

    if (!proposalId || !paymentRequestId || !(file instanceof File)) {
      return portalJson(
        { success: false, error: "Missing payment request or slip file." },
        { status: 400 },
      );
    }

    const access = await resolvePortalAccess({
      request,
      proposalId,
      capability: "payments:write",
      mutation: true,
    });
    if (!access) {
      return portalJson({ success: false, error: "Unauthorized payment upload." }, { status: 401 });
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ALLOWED_FILE_KINDS,
      fallbackName: "payment-slip",
      maxBytes: MAX_FILE_SIZE,
    }).catch((error: unknown) => error instanceof Error ? error : new Error("Invalid upload file."));

    if (validatedFile instanceof Error) {
      return portalJson(
        { success: false, error: validatedFile.message },
        { status: 400 },
      );
    }

    const [proposal, paymentRequest] = await Promise.all([
      db.query.proposals.findFirst({
        where: eq(proposals.id, proposalId),
        columns: {
          id: true,
          userId: true,
          magicTokenSlug: true,
          fulfillmentType: true,
        },
        with: {
          user: {
            columns: {
              name: true,
              email: true,
            },
          },
        },
      }),
      db.query.paymentRequests.findFirst({
        where: and(
          eq(paymentRequests.id, paymentRequestId),
          eq(paymentRequests.proposalId, proposalId),
        ),
      }),
    ]);

    if (!proposal || !paymentRequest) {
      return portalJson(
        { success: false, error: "Payment request not found." },
        { status: 404 },
      );
    }

    if (paymentRequest.status === "PAID") {
      return portalJson(
        { success: false, error: "This payment request has already been marked paid and cannot receive a new slip." },
        { status: 409 },
      );
    }

    if (paymentRequest.status === "AWAITING_VERIFICATION") {
      return portalJson(
        { success: false, error: "Payment proof is already pending staff verification." },
        { status: 409 },
      );
    }

    const adminStorage = createAdminClient();
    const storagePath = [
      "portal-payment-slips",
      proposal.id,
      paymentRequest.id,
      `${Date.now()}-${validatedFile.safeFileName}`,
    ].join("/");

    const upload = await adminStorage.storage
      .from("proposals")
      .upload(storagePath, file, {
        contentType: validatedFile.contentType,
        upsert: true,
      });

    if (upload.error) {
      console.error("[Portal Payment Slip] Supabase storage upload failed:", upload.error);
      throw new Error("Payment proof storage upload failed.");
    }

    const { data: publicUrlData } = adminStorage.storage
      .from("proposals")
      .getPublicUrl(storagePath);

    let finalSlipUrl = publicUrlData.publicUrl;
    let storageProvider = "SUPABASE_STORAGE";
    let storageFileId: string | null = null;
    let fallbackUrl: string | null = null;
    let verificationStatus: "AWAITING_STAFF_REVIEW" | "VERIFIED" = "AWAITING_STAFF_REVIEW";
    let easySlipData: JsonRecord = {
      uploadedAt: new Date().toISOString(),
      source: access.mode === "guest" ? "guest-proposal-portal" : "customer-proposal-portal",
      verificationStatus,
      storageProvider,
    };
    let transRef = "";
    let receiverAccount = "";
    let actualAmount = Number(paymentRequest.amountRequested);

    try {
      const customerName = proposal.user?.name || proposal.user?.email?.split("@")[0] || "Customer";
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const customerFolderId = await getOrCreateCustomerFolder(customerName, proposal.userId);
      const proposalFolderId = await getOrCreateProposalFolder(customerFolderId, proposal.id);
      const destinationFolderId = await getOrCreateSubfolder(
        proposalFolderId,
        proposal.fulfillmentType === "SUPPLY_ONLY"
          ? "Supply_Only_Payments"
          : "Installation_Project_Payments",
      );

      finalSlipUrl = await uploadFileToDrive(
        destinationFolderId,
        fileBuffer,
        validatedFile.contentType,
        `Payment_Request_${paymentRequest.id}.${validatedFile.extension}`,
      );
      storageProvider = "GOOGLE_DRIVE";
      storageFileId = extractDriveFileId(finalSlipUrl);
      fallbackUrl = publicUrlData.publicUrl;
      easySlipData = {
        ...easySlipData,
        storageProvider,
        storageFileId,
        fallbackUrl,
      };
    } catch (driveError) {
      console.warn("[Portal Payment Slip] Google Drive mirror skipped:", driveError);
      easySlipData = {
        ...easySlipData,
        storageProvider,
      };
    }

    const apiKey = process.env.EASYSLIP_API_KEY?.trim();
    if (apiKey) {
      try {
        const verifyResponse = await fetch("https://api.easyslip.com/v2/verify/bank", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: publicUrlData.publicUrl }),
          cache: "no-store",
        });

        if (!verifyResponse.ok) {
          throw new PaymentSlipValidationError("EasySlip rejected this payment proof.");
        }

        const payload: unknown = await verifyResponse.json().catch(() => ({}));
        if (isRecord(payload) && (payload.success === false || payload.valid === false)) {
          throw new PaymentSlipValidationError("Slip payload is not valid.");
        }

        const rawSlip = getNestedRecord(payload, ["data", "rawSlip"]);
        if (!rawSlip) {
          throw new PaymentSlipValidationError("Slip data was incomplete.");
        }

        const expectedAmount = Number(paymentRequest.amountRequested);
        const slipAmount = getNestedNumber(rawSlip, ["amount", "amount"]);
        if (!Number.isFinite(slipAmount) || Math.abs(expectedAmount - slipAmount) > 0.01) {
          throw new PaymentSlipValidationError("Slip amount does not match payment request.");
        }

        const slipTransRef = getNestedText(rawSlip, ["transRef"]);
        if (!slipTransRef) {
          throw new PaymentSlipValidationError("Slip transaction reference is missing.");
        }

        const existingSlip = await db.query.verifiedSlips.findFirst({
          where: eq(verifiedSlips.transRef, slipTransRef),
          columns: { id: true },
        });
        if (existingSlip) {
          throw new PaymentSlipValidationError("This slip has already been used.");
        }

        const companyBankAccount = process.env.COMPANY_BANK_ACCOUNT?.trim();
        const slipReceiverAccount = getNestedText(rawSlip, ["receiver", "account"]);
        if (
          companyBankAccount &&
          slipReceiverAccount &&
          normalizeBankAccount(companyBankAccount) !== normalizeBankAccount(slipReceiverAccount)
        ) {
          throw new PaymentSlipValidationError("Receiver account does not match company account.");
        }

        verificationStatus = "VERIFIED";
        transRef = slipTransRef;
        receiverAccount = slipReceiverAccount;
        actualAmount = slipAmount;
        easySlipData = {
          ...(isRecord(payload) ? payload : {}),
          uploadedAt: easySlipData.uploadedAt,
          source: easySlipData.source,
          storageProvider: easySlipData.storageProvider,
          fallbackUrl: easySlipData.fallbackUrl,
          verificationStatus,
        };
      } catch (verificationError) {
        console.warn("[Portal Payment Slip] EasySlip verification needs staff review:", verificationError);
        easySlipData = {
          ...easySlipData,
          verificationStatus: "AWAITING_STAFF_REVIEW",
          verificationError: getVerificationReviewReason(verificationError),
        };
      }
    }

    const [updatedPaymentRequest] = await db.transaction(async (tx) => {
      if (verificationStatus === "VERIFIED") {
        await tx.insert(paymentSlipRegistry).values({
          transRef,
          sourceType: "PROPOSAL",
          sourceId: paymentRequest.id,
          amount: actualAmount.toFixed(2),
        });
        await tx.insert(verifiedSlips).values({
          orderId: proposal.id,
          customerId: proposal.userId,
          transRef,
          receiverAccount,
          amount: actualAmount.toFixed(2),
          slipImageUrl: finalSlipUrl,
          rawData: easySlipData,
        });
      }

      const [updated] = await tx.update(paymentRequests)
        .set({
          status: verificationStatus === "VERIFIED" ? "PAID" : "AWAITING_VERIFICATION",
          slipUrl: finalSlipUrl,
          slipImageUrl: finalSlipUrl,
          storageProvider,
          storageFileId,
          fallbackUrl,
          easySlipData,
        })
        .where(and(
          eq(paymentRequests.id, paymentRequest.id),
          eq(paymentRequests.proposalId, proposal.id),
        ))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: verificationStatus === "VERIFIED"
          ? "PAYMENT_REQUEST_PAID"
          : "PAYMENT_SLIP_AWAITING_VERIFICATION",
        description: verificationStatus === "VERIFIED"
          ? `Customer uploaded and auto-verified payment proof for ${paymentRequest.title}.`
          : `Customer uploaded payment proof for ${paymentRequest.title}; awaiting staff verification.`,
        userId: access.actorUserId,
      });

      if (verificationStatus === "VERIFIED") {
        await enqueueIntegrationEvent(tx, {
          topic: "payment.received",
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: proposal.id,
          payload: { paymentRequestId: paymentRequest.id, source: "PORTAL_AUTO_VERIFY" },
          dedupeKey: `payment.received:${paymentRequest.id}`,
        });
        await enqueueIntegrationEvent(tx, {
          topic: SALES_NOTIFICATION_TOPICS.paymentReceived,
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: proposal.id,
          payload: { paymentRequestId: paymentRequest.id, source: "PORTAL_AUTO_VERIFY" },
          dedupeKey: `sales.payment.received:${paymentRequest.id}`,
        });
      } else {
        await enqueueIntegrationEvent(tx, {
          topic: SALES_NOTIFICATION_TOPICS.paymentReviewRequired,
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: proposal.id,
          payload: { paymentRequestId: paymentRequest.id, source: "PORTAL_STAFF_REVIEW" },
          dedupeKey: `sales.payment.review-required:${paymentRequest.id}`,
        });
      }

      return [updated];
    });

    await processOutboxBestEffort(proposal.id);
    await publishPortalStateChanged(proposal.id, "PAYMENT_SLIP_UPDATED");

    revalidatePath(`/proposals/${proposal.magicTokenSlug}`);
    revalidatePath(`/th/proposals/${proposal.magicTokenSlug}`);
    revalidatePath(`/en/proposals/${proposal.magicTokenSlug}`);
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath(`/th/admin/crm/${proposal.id}`);
    revalidatePath(`/en/admin/crm/${proposal.id}`);
    revalidatePath(`/admin/quotations/${proposal.id}`);
    revalidatePath(`/th/admin/quotations/${proposal.id}`);
    revalidatePath(`/en/admin/quotations/${proposal.id}`);
    revalidatePath("/admin/documents");
    revalidatePath("/th/admin/documents");
    revalidatePath("/en/admin/documents");

    return portalJson({
      success: true,
      paymentRequest: serializePaymentRequest(updatedPaymentRequest),
    });
  } catch (error) {
    console.error("[Portal Payment Slip]:", error);
    return portalJson(
      { success: false, error: "Failed to upload payment proof." },
      { status: 500 },
    );
  }
}
