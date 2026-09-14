"use server";

import { db } from "@/db";
import {
  paymentRequests,
  verifiedSlips,
  activityLogs,
  proposals,
  users,
} from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { secureApplyPromoCode } from "@/lib/promoCodeEngine";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import {
  extractDriveFileId,
  getOrCreateCustomerFolder,
  getOrCreateProposalFolder,
  getOrCreateSubfolder,
  uploadFileToDrive,
} from "@/lib/googleDrive";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { ensurePaymentRequestSchema } from "@/lib/paymentRequestSchema";
import { generateErpnextProjectForProposal } from "@/app/actions/erpnextProject";
import { SALES_NOTIFICATION_TOPICS } from "@/lib/salesNotificationConfig";

const MAX_PAYMENT_SLIP_BYTES = 12 * 1024 * 1024;
const PAYMENT_SLIP_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic", "pdf"];

type JsonRecord = Record<string, unknown>;

type PublicPaymentRequest = Pick<
  typeof paymentRequests.$inferSelect,
  | "id"
  | "proposalId"
  | "title"
  | "amountRequested"
  | "paymentType"
  | "paymentMethod"
  | "status"
  | "slipUrl"
  | "slipImageUrl"
  | "verifiedBy"
  | "verifiedAt"
  | "storageProvider"
  | "storageFileId"
  | "fallbackUrl"
  | "easySlipData"
>;

class PaymentRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentRequestValidationError";
  }
}

function toPublicPaymentRequest(
  paymentRequest: typeof paymentRequests.$inferSelect,
): PublicPaymentRequest {
  return {
    id: paymentRequest.id,
    proposalId: paymentRequest.proposalId,
    title: paymentRequest.title,
    amountRequested: paymentRequest.amountRequested,
    paymentType: paymentRequest.paymentType,
    paymentMethod: paymentRequest.paymentMethod,
    status: paymentRequest.status,
    slipUrl: paymentRequest.slipUrl,
    slipImageUrl: paymentRequest.slipImageUrl,
    verifiedBy: paymentRequest.verifiedBy,
    verifiedAt: paymentRequest.verifiedAt,
    storageProvider: paymentRequest.storageProvider,
    storageFileId: paymentRequest.storageFileId,
    fallbackUrl: paymentRequest.fallbackUrl,
    easySlipData: paymentRequest.easySlipData,
  };
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

function getPublicError(error: unknown, fallback: string) {
  return error instanceof PaymentRequestValidationError ? error.message : fallback;
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

function normalizeBankAccount(value: string): string {
  return value.replace(/[-\s]/g, "");
}

export async function generatePaymentRequestAction(
  proposalId: string,
  amount: number,
  title: string,
  options: { paymentType: "FULL" | "INSTALLMENT"; paymentMethod: "QR" | "BANK_TRANSFER" },
) {
  try {
    await requireStaff();
    await ensurePaymentRequestSchema();
    const user = await getAuthenticatedUser();

    // Check if proposal exists
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const [newPr] = await db
      .insert(paymentRequests)
      .values({
        proposalId,
        title,
        amountRequested: amount.toFixed(2),
        paymentType: options.paymentType,
        paymentMethod: options.paymentMethod,
        status: "PENDING",
      })
      .returning();

    // Log action
    await db.insert(activityLogs).values({
      entityId: proposalId,
      entityType: "QUOTATION",
      action: "PAYMENT_REQUEST_GENERATED",
      description: `สร้างคำขอชำระเงินใหม่: ${title} ยอดเงิน ${amount.toLocaleString("th-TH")} บาท`,
      userId: user.id,
    });

    await enqueueIntegrationEvent(db, {
      topic: SALES_NOTIFICATION_TOPICS.paymentRequested,
      aggregateType: "PROPOSAL",
      aggregateId: proposalId,
      payload: { paymentRequestId: newPr.id },
      dedupeKey: `sales.payment.requested:${newPr.id}`,
    });
    await processOutboxBestEffort(proposalId);

    revalidatePath(`/admin/crm/${proposalId}`);
    revalidatePath(`/th/admin/crm/${proposalId}`);
    revalidatePath(`/en/admin/crm/${proposalId}`);
    revalidatePath(`/checkout/${proposalId}/payment`);

    return { success: true, paymentRequest: toPublicPaymentRequest(newPr) };
  } catch (error: unknown) {
    console.error("[generatePaymentRequestAction] Error:", error);
    return {
      success: false,
      error: getPublicError(error, "Failed to generate payment request"),
    };
  }
}

export async function getPaymentRequestsAction(proposalId: string) {
  try {
    await ensurePaymentRequestSchema();
    const prs = await db.query.paymentRequests.findMany({
      where: eq(paymentRequests.proposalId, proposalId),
    });
    return { success: true, paymentRequests: prs };
  } catch (error: unknown) {
    console.error("[getPaymentRequestsAction] Error:", error);
    return {
      success: false,
      error: "Failed to fetch payment requests",
    };
  }
}

export async function processPaymentRequestSlipAction(
  paymentRequestId: string,
  formData: FormData
) {
  try {
    await ensurePaymentRequestSchema();
    const user = await getAuthenticatedUser();
    const normalizedId = paymentRequestId.trim();

    if (!normalizedId) {
      return { success: false, error: "รหัสคำขอชำระเงินไม่ถูกต้อง" };
    }

    const file = formData.get("file") ||
      formData.get("slip") ||
      formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "ไม่พบไฟล์สลิป" };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: PAYMENT_SLIP_FILE_KINDS,
      fallbackName: "payment-slip",
      maxBytes: MAX_PAYMENT_SLIP_BYTES,
    });

    // Fetch the payment request
    const paymentRequest = await db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, normalizedId),
      with: {
        proposal: {
          with: {
            user: {
              columns: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!paymentRequest) {
      return { success: false, error: "ไม่พบคำขอชำระเงินนี้ในระบบ" };
    }

    const order = paymentRequest.proposal;
    if (order.userId !== user.id) {
      // Check if user is staff/admin if not proposal owner
      const actor = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { role: true },
      });
      const isStaff = actor
        ? ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(actor.role)
        : false;

      if (!isStaff) {
        return { success: false, error: "Unauthorized access to this payment request" };
      }
    }

    // 1. Upload to Supabase Storage temporarily to verify via EasySlip API
    const supabase = await createClient();
    const tempFileName = `payment-slips/${crypto.randomUUID()}.${validatedFile.extension}`;

    const { error: uploadError } = await supabase.storage
      .from("proposals")
      .upload(tempFileName, file, {
        cacheControl: "3600",
        contentType: validatedFile.contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[processPaymentRequestSlipAction] Temporary slip upload failed:", uploadError.message);
      throw new PaymentRequestValidationError("ไม่สามารถอัปโหลดไฟล์สลิปได้");
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("proposals").getPublicUrl(tempFileName);

    // STEP A: Verification (EasySlip v2)
    let transRef = "";
    let receiverAccount = "";
    let actualAmount = Number(paymentRequest.amountRequested);
    let resData: Record<string, unknown> = {};
    let warningMsg: string | null = null;
    let requiresManualReview = false;

    const apiKey = process.env.EASYSLIP_API_KEY?.trim();
    if (!apiKey) {
      console.warn(
        "[PAYMENT VERIFICATION] EASYSLIP_API_KEY is not configured. Routing slip to staff review."
      );
      requiresManualReview = true;
      warningMsg =
        "ระบบรับสลิปแล้ว และส่งต่อให้ทีมงานตรวจสอบการชำระเงินด้วยตนเอง";
    } else {
      try {
        const verifyResponse = await fetch(
          "https://api.easyslip.com/v2/verify/bank",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: publicUrl,
            }),
            cache: "no-store",
          }
        );

        if (!verifyResponse.ok) {
          throw new Error(
            "ไม่สามารถเชื่อมต่อระบบตรวจสอบสลิปได้ หรือข้อมูลรูปภาพไม่ถูกต้อง"
          );
        }

        const payload: unknown = await verifyResponse.json().catch(() => ({}));
        if (isRecord(payload) && (payload.success === false || payload.valid === false)) {
          throw new PaymentRequestValidationError("สลิปนี้ไม่ถูกต้องหรือไม่สามารถระบุข้อมูลได้");
        }

        const rawSlip = getNestedRecord(payload, ["data", "rawSlip"]);
        if (!rawSlip) {
          throw new PaymentRequestValidationError("โครงสร้างข้อมูลสลิปไม่ถูกต้อง");
        }

        // Validate amount matches transaction.amount
        const expectedAmount = Number(paymentRequest.amountRequested);
        const slipAmount = getNestedNumber(rawSlip, ["amount", "amount"]);
        if (!Number.isFinite(slipAmount) || Math.abs(expectedAmount - slipAmount) > 0.01) {
          throw new PaymentRequestValidationError(
            `ยอดเงินในสลิป (${slipAmount}) ไม่ตรงกับยอดค้างชำระ (${expectedAmount})`
          );
        }

        // Check transRef for idempotency (prevent reusing the same slip)
        const slipTransRef = getNestedText(rawSlip, ["transRef"]);
        if (!slipTransRef) {
          throw new PaymentRequestValidationError("ไม่พบรหัสธุรกรรม (transRef) ในสลิป");
        }

        const existingSlip = await db.query.verifiedSlips.findFirst({
          where: eq(verifiedSlips.transRef, slipTransRef),
        });
        if (existingSlip) {
          throw new PaymentRequestValidationError("สลิปนี้ถูกใช้งานไปแล้วในระบบ ห้ามใช้สลิปซ้ำ");
        }

        // Validate receiver matches company bank account
        const companyBankAccount = process.env.COMPANY_BANK_ACCOUNT?.trim();
        const slipReceiverAccount = getNestedText(rawSlip, ["receiver", "account"]);
        if (companyBankAccount && slipReceiverAccount) {
          if (
            normalizeBankAccount(slipReceiverAccount) !==
            normalizeBankAccount(companyBankAccount)
          ) {
            throw new PaymentRequestValidationError("บัญชีผู้รับเงินไม่ตรงกับบัญชีของทางบริษัท");
          }
        }

        // Verification succeeded
        transRef = slipTransRef;
        receiverAccount = slipReceiverAccount || "";
        actualAmount = slipAmount;
        resData = isRecord(payload) ? payload : {};
      } catch (verifyError: unknown) {
        console.warn(
          "[PAYMENT VERIFICATION] EasySlip validation failed. Routing slip to staff review.",
          verifyError
        );
        requiresManualReview = true;
        const reviewReason = getPublicError(verifyError, "ไม่สามารถตรวจสอบสลิปได้");
        warningMsg = `ระบบรับสลิปแล้ว แต่ต้องรอทีมงานตรวจสอบเพิ่มเติม: ${
          reviewReason
        }`;
        resData = {
          verificationStatus: "AWAITING_STAFF_REVIEW",
          error: reviewReason,
        };
      }
    }

    // STEP B: Storage (Google Drive)
    const customerName =
      order.user?.name || order.user?.email?.split("@")[0] || "Customer";
    const bytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(bytes);

    let drivePreviewUrl = publicUrl; // Fallback to Supabase publicUrl
    let storageProvider = "SUPABASE_STORAGE";
    let storageFileId: string | null = null;
    let fallbackUrl: string | null = null;
    try {
      const customerFolderId = await getOrCreateCustomerFolder(
        customerName,
        order.userId
      );
      const proposalFolderId = await getOrCreateProposalFolder(
        customerFolderId,
        order.id
      );

      // Pick subfolder name based on fulfillment type
      const subfolderName =
        order.fulfillmentType === "SUPPLY_ONLY"
          ? "Supply_Only_Payments"
          : "Installation_Project_Payments";
      const destinationFolderId = await getOrCreateSubfolder(
        proposalFolderId,
        subfolderName
      );

      const googleDriveFilename = `Slip_PR_${order.id}_${normalizedId}.${validatedFile.extension}`;

      drivePreviewUrl = await uploadFileToDrive(
        destinationFolderId,
        fileBuffer,
        validatedFile.contentType,
        googleDriveFilename
      );
      storageProvider = "GOOGLE_DRIVE";
      storageFileId = extractDriveFileId(drivePreviewUrl);
      fallbackUrl = publicUrl;
    } catch (driveError: unknown) {
      console.warn(
        "[Google Drive] Setup missing or upload failed. Skipping drive storage and using Supabase preview url instead.",
        driveError
      );
      if (!warningMsg) {
        warningMsg =
          "ข้ามขั้นตอนการอัปโหลดไฟล์สลิปไปยัง Google Drive เนื่องจากเกิดข้อผิดพลาดหรือไม่ได้ตั้งค่าระบบ Cloud";
      } else {
        warningMsg += " และไม่ได้บันทึกไฟล์สลิปไปยัง Google Drive";
      }
    }

    // STEP C: Finalize
    const paidAt = new Date();
    await db.transaction(async (tx) => {
      if (!requiresManualReview) {
        // Create verified slips record only after real verification succeeds.
        await tx.insert(verifiedSlips).values({
          orderId: order.id,
          customerId: order.userId,
          transRef,
          receiverAccount: receiverAccount || "",
          amount: actualAmount.toFixed(2),
          slipImageUrl: drivePreviewUrl,
          rawData: (resData.data as Record<string, unknown> | undefined) || resData,
          verifiedAt: paidAt,
        });
      }

      // Update payment_request status. If verification could not run, staff reviews the uploaded slip.
      await tx
        .update(paymentRequests)
        .set({
          status: requiresManualReview ? "AWAITING_VERIFICATION" : "PAID",
          slipUrl: drivePreviewUrl,
          slipImageUrl: drivePreviewUrl,
          storageProvider,
          storageFileId,
          fallbackUrl,
          easySlipData: requiresManualReview
            ? {
              ...resData,
              uploadedAt: paidAt.toISOString(),
              verificationStatus: "AWAITING_STAFF_REVIEW",
              storageProvider,
              storageFileId,
              fallbackUrl,
            }
            : {
              ...((resData.data as Record<string, unknown> | undefined) || resData),
              storageProvider,
              storageFileId,
              fallbackUrl,
            },
        })
        .where(eq(paymentRequests.id, paymentRequest.id));

      // Add audit log activity
      await tx.insert(activityLogs).values({
        entityId: order.id,
        entityType: "QUOTATION",
        action: requiresManualReview ? "PAYMENT_SLIP_AWAITING_VERIFICATION" : "PAYMENT_REQUEST_PAID",
        description: requiresManualReview
          ? `Customer uploaded payment proof for "${paymentRequest.title}"; awaiting staff verification.`
          : `ชำระเงินตามคำขอสำเร็จ: "${paymentRequest.title}" ยอดเงิน ${actualAmount.toLocaleString("th-TH")} บาท (Ref: ${transRef})`,
        userId: user.id,
        createdAt: paidAt,
      });

      if (requiresManualReview) {
        await enqueueIntegrationEvent(tx, {
          topic: SALES_NOTIFICATION_TOPICS.paymentReviewRequired,
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: order.id,
          payload: {
            paymentRequestId: paymentRequest.id,
            source: "PAYMENT_REQUEST_SLIP_ACTION",
          },
          dedupeKey: `sales.payment.review-required:${paymentRequest.id}`,
        });
      } else {
        await enqueueIntegrationEvent(tx, {
          topic: "payment.received",
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: order.id,
          payload: {
            paymentRequestId: paymentRequest.id,
            source: "PAYMENT_REQUEST_SLIP_ACTION",
          },
          dedupeKey: `payment.received:${paymentRequest.id}`,
        });
        await enqueueIntegrationEvent(tx, {
          topic: SALES_NOTIFICATION_TOPICS.paymentReceived,
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: order.id,
          payload: {
            paymentRequestId: paymentRequest.id,
            source: "PAYMENT_REQUEST_SLIP_ACTION",
          },
          dedupeKey: `sales.payment.received:${paymentRequest.id}`,
        });
      }
    });

    await processOutboxBestEffort(order.id);

    revalidatePath(`/admin/crm/${order.id}`);
    revalidatePath(`/th/admin/crm/${order.id}`);
    revalidatePath(`/en/admin/crm/${order.id}`);
    revalidatePath(`/checkout/${order.id}/payment`);
    revalidatePath("/admin/documents");
    revalidatePath("/th/admin/documents");
    revalidatePath("/en/admin/documents");

    return {
      success: true,
      paymentRequestId: paymentRequest.id,
      warning: warningMsg,
    };
  } catch (error: unknown) {
    console.error("[processPaymentRequestSlipAction] Error:", error);
    return {
      success: false,
      error: getPublicError(error, "Failed to process payment slip."),
    };
  }
}

export async function getPaymentRequestStatusAction(paymentRequestId: string) {
  try {
    await ensurePaymentRequestSchema();
    const pr = await db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, paymentRequestId),
      columns: { status: true },
    });
    if (!pr) return { success: false, error: "Payment request not found" };
    return { success: true, status: pr.status };
  } catch (error: unknown) {
    console.error("[getPaymentRequestStatusAction] Error:", error);
    return {
      success: false,
      error: "Failed to check status",
    };
  }
}

export async function verifyClientPaymentSlipAction(
  paymentRequestId: string,
  decision: "APPROVE" | "REJECT",
) {
  try {
    const actor = await requireStaff();
    await ensurePaymentRequestSchema();
    const user = await getAuthenticatedUser();
    const normalizedId = paymentRequestId.trim();

    if (!normalizedId) {
      return { success: false, error: "Invalid payment request ID" };
    }

    const paymentRequest = await db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, normalizedId),
      with: {
        proposal: true,
      },
    });

    if (!paymentRequest) {
      return { success: false, error: "Payment request not found" };
    }

    if (!paymentRequest.slipUrl) {
      return { success: false, error: "This payment request has no uploaded slip." };
    }

    const nextStatus = decision === "APPROVE" ? "PAID" : "FAILED";
    const action = decision === "APPROVE"
      ? "PAYMENT_SLIP_VERIFIED"
      : "PAYMENT_SLIP_REJECTED";
    const description = decision === "APPROVE"
      ? `Staff verified payment slip for "${paymentRequest.title}".`
      : `Staff rejected payment slip for "${paymentRequest.title}".`;

    const [updatedPaymentRequest] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(paymentRequests)
        .set({
          status: nextStatus,
          ...(decision === "APPROVE"
            ? {
                verifiedBy: actor.id,
                verifiedAt: new Date(),
              }
            : {}),
          easySlipData: {
            ...((paymentRequest.easySlipData as Record<string, unknown>) || {}),
            verificationStatus: nextStatus,
            ...(decision === "APPROVE"
              ? {
                  verifiedAt: new Date().toISOString(),
                  verifiedBy: actor.id,
                }
              : {}),
          },
        })
        .where(eq(paymentRequests.id, paymentRequest.id))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: paymentRequest.proposalId,
        entityType: "QUOTATION",
        action,
        description,
        userId: user.id,
      });

      if (decision === "APPROVE") {
        await enqueueIntegrationEvent(tx, {
          topic: "payment.received",
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: paymentRequest.proposalId,
          payload: { paymentRequestId: paymentRequest.id },
          dedupeKey: `payment.received:${paymentRequest.id}`,
        });
        await enqueueIntegrationEvent(tx, {
          topic: SALES_NOTIFICATION_TOPICS.paymentReceived,
          aggregateType: "PAYMENT_REQUEST",
          aggregateId: paymentRequest.proposalId,
          payload: { paymentRequestId: paymentRequest.id, source: "STAFF_APPROVAL" },
          dedupeKey: `sales.payment.received:${paymentRequest.id}`,
        });
      }

      return [updated];
    });

    if (decision === "APPROVE") {
      await processOutboxBestEffort(paymentRequest.proposalId);
      const projectResult = await generateErpnextProjectForProposal(paymentRequest.proposalId);
      if (!projectResult.success) {
        console.error("[verifyClientPaymentSlipAction] Field Project bridge failed:", projectResult.error);
      }
    }
    await publishPortalStateChanged(paymentRequest.proposalId, action);

    revalidatePath(`/admin/crm/${paymentRequest.proposalId}`);
    revalidatePath(`/th/admin/crm/${paymentRequest.proposalId}`);
    revalidatePath(`/en/admin/crm/${paymentRequest.proposalId}`);
    revalidatePath(`/admin/quotations/${paymentRequest.proposalId}`);
    revalidatePath(`/th/admin/quotations/${paymentRequest.proposalId}`);
    revalidatePath(`/en/admin/quotations/${paymentRequest.proposalId}`);
    revalidatePath(`/proposals/${paymentRequest.proposal.magicTokenSlug}`);
    revalidatePath(`/th/proposals/${paymentRequest.proposal.magicTokenSlug}`);
    revalidatePath(`/en/proposals/${paymentRequest.proposal.magicTokenSlug}`);
    revalidatePath("/admin/documents");
    revalidatePath("/th/admin/documents");
    revalidatePath("/en/admin/documents");

    return { success: true, paymentRequest: toPublicPaymentRequest(updatedPaymentRequest) };
  } catch (error: unknown) {
    console.error("[verifyClientPaymentSlipAction] Error:", error);
    return {
      success: false,
      error: getPublicError(error, "Failed to verify payment slip"),
    };
  }
}

export async function applyPaymentPromoCodeAction(
  paymentRequestId: string,
  promoCode: string,
) {
  try {
    await ensurePaymentRequestSchema();
    const result = await secureApplyPromoCode(paymentRequestId, promoCode);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const pr = await db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, paymentRequestId),
    });

    if (pr) {
      revalidatePath(`/admin/crm/${pr.proposalId}`);
      revalidatePath(`/th/admin/crm/${pr.proposalId}`);
      revalidatePath(`/en/admin/crm/${pr.proposalId}`);
      return {
        success: true,
        discountAmount: result.discountAmount,
        newAmount: result.newAmount,
        promoDescription: result.promoDescription,
        paymentRequest: toPublicPaymentRequest(pr),
      };
    }

    return {
      success: true,
      discountAmount: result.discountAmount,
      newAmount: result.newAmount,
      promoDescription: result.promoDescription,
    };
  } catch (error: unknown) {
    console.error("[applyPaymentPromoCodeAction] Error:", error);
    return {
      success: false,
      error: "ไม่สามารถปรับใช้รหัสส่วนลดได้",
    };
  }
}
