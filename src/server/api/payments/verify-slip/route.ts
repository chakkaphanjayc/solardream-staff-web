import { NextRequest } from "next/server";

import { validateUploadContentLength } from "@/lib/fileValidation";
import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";
import {
  PaymentVerificationError,
  verifyPaymentForQuotation,
  type PaymentVerificationSource,
} from "@/lib/services/payment-verifier";

export const maxDuration = 60;

const MAX_REQUEST_BYTES = 13 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function readRawPayload(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, 64_000);
  if (isRecord(value)) {
    try {
      return JSON.stringify(value).slice(0, 64_000);
    } catch {
      return "";
    }
  }
  return "";
}

function getStatus(error: PaymentVerificationError) {
  switch (error.code) {
    case "UNAUTHORIZED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "DUPLICATE":
      return 409;
    case "AMOUNT":
    case "RECEIVER":
    case "REJECTED":
    case "INCOMPLETE":
      return 422;
    case "CONFIGURATION":
    case "EXTERNAL":
    case "ERP_SYNC":
      return 503;
    case "INVALID_INPUT":
      return 400;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof PaymentVerificationError) return error.message;
  return "Payment verification failed. Please try again with a clear slip.";
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

    let quotationId = "";
    let milestoneIndex = 0;
    let source: PaymentVerificationSource = {};

    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const formData = await request.formData();
      quotationId = readText(formData.get("quotation_id"), 128);
      milestoneIndex = Number(readText(formData.get("milestone_index"), 8));

      const fileValue = formData.get("slip_image") || formData.get("file");
      if (fileValue instanceof File && fileValue.size > 0) {
        source = { file: fileValue };
      } else {
        source = {
          slipImageUrl: readText(formData.get("slip_image_url"), 2_048) || undefined,
          rawPayload: readRawPayload(formData.get("raw_payload")) || undefined,
          qrString: readText(formData.get("qr_string"), 8_192) || undefined,
        };
      }
    } else {
      const body: unknown = await request.json().catch(() => ({}));
      const record = isRecord(body) ? body : {};
      quotationId = readText(record.quotation_id ?? record.quotationId, 128);
      milestoneIndex = Number(readText(record.milestone_index ?? record.milestoneIndex, 8));

      const slipImage = readText(record.slip_image ?? record.slipImage, 2_048);
      source = {
        slipImageUrl: slipImage || undefined,
        rawPayload: readRawPayload(record.raw_payload ?? record.rawPayload ?? record.payload) || undefined,
        qrString: readText(record.qr_string ?? record.qrString, 8_192) || undefined,
      };
    }

    if (
      !quotationId ||
      !Number.isInteger(milestoneIndex) ||
      milestoneIndex < 1 ||
      (!source.file && !source.slipImageUrl && !source.rawPayload && !source.qrString)
    ) {
      return portalJson(
        {
          success: false,
          error: "Provide quotation_id, milestone_index, and a slip image or raw QR payload.",
        },
        { status: 400 },
      );
    }

    const access = await resolvePortalAccess({
      request,
      proposalId: quotationId,
      capability: "payments:write",
      mutation: true,
    });
    if (!access) {
      return portalJson(
        { success: false, error: "Quotation not found or payment access denied." },
        { status: 401 },
      );
    }

    const result = await verifyPaymentForQuotation({
      access,
      quotationId,
      milestoneIndex,
      source,
    });

    // Drain the notification and any deferred ERP sync while the request is
    // still warm. The outbox remains the durable retry path if a provider is
    // unavailable.
    const { processOutboxBestEffort } = await import("@/lib/outboxProcessor");
    await processOutboxBestEffort(quotationId);

    return portalJson({
      success: true,
      payment: {
        milestoneId: result.payment.milestoneId,
        milestoneIndex: result.payment.milestoneIndex,
        milestoneName: result.payment.milestoneName,
        amount: result.payment.amount,
        transRef: result.payment.transRef,
        paidAt: result.payment.paidAt.toISOString(),
        idempotent: result.payment.idempotent,
      },
      progress: result.progress,
      erpSync: {
        status: result.erpSyncStatus,
        paymentEntryId: result.erpSync?.paymentEntryId || null,
        salesInvoiceId: result.erpSync?.salesInvoiceId || null,
      },
    });
  } catch (error: unknown) {
    const paymentError = error instanceof PaymentVerificationError
      ? error
      : new PaymentVerificationError(
          getErrorMessage(error),
          "EXTERNAL",
        );
    console.warn("[Payment Verification API] Request failed.", {
      code: paymentError.code,
      error: paymentError.message,
    });
    return portalJson(
      { success: false, error: getErrorMessage(paymentError), code: paymentError.code },
      { status: getStatus(paymentError) },
    );
  }
}
