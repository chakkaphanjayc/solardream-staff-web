"use server";

import { createClient } from "@/utils/supabase/server";

const EASYSLIP_VERIFY_URL = "https://api.easyslip.com/v2/verify/bank";
const MAX_SLIP_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_SLIP_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type JsonRecord = Record<string, unknown>;

export type VerifySlipActionResult =
  | {
      success: true;
      data: {
        sender: string | null;
        receiver: string | null;
        amount: number | null;
        transRef: string | null;
        bankReceiver: string | null;
        raw: unknown;
      };
    }
  | {
      success: false;
      error: string;
      errorCode?: string;
      data?: unknown;
    };

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current = value;

  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }

  return current;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function verifySlipAction(
  formData: FormData,
): Promise<VerifySlipActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("[EASYSLIP ACTION] Unauthorized verification attempt.");
      return { success: false, error: "Unauthorized" };
    }

    const apiKey = process.env.EASYSLIP_API_KEY?.trim();
    if (!apiKey) {
      console.error(
        "[EASYSLIP ACTION] EASYSLIP_API_KEY is not configured.",
      );
      return {
        success: false,
        error: "EASYSLIP_API_KEY is not configured.",
      };
    }

    const fileEntry =
      formData.get("file") ??
      formData.get("slip") ??
      formData.get("image");

    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      console.error("[EASYSLIP ACTION] No slip image was uploaded.");
      return {
        success: false,
        error: "Please upload a slip image.",
      };
    }

    if (!ALLOWED_SLIP_TYPES.has(fileEntry.type)) {
      console.error("[EASYSLIP ACTION] Unsupported slip file type.", {
        fileName: fileEntry.name,
        fileType: fileEntry.type,
      });
      return {
        success: false,
        error: "Only JPEG, PNG, and WebP slip images are supported.",
      };
    }

    if (fileEntry.size > MAX_SLIP_FILE_SIZE) {
      console.error("[EASYSLIP ACTION] Slip image exceeds 5 MB.", {
        fileName: fileEntry.name,
        fileSize: fileEntry.size,
      });
      return {
        success: false,
        error: "The slip image must not exceed 5 MB.",
      };
    }

    const requestBody = new FormData();
    requestBody.append("image", fileEntry, fileEntry.name);

    const response = await fetch(EASYSLIP_VERIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    const responseText = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("[EASYSLIP ACTION] Response was not valid JSON.", {
        status: response.status,
        responseText,
        parseError:
          parseError instanceof Error
            ? parseError.message
            : "Unknown JSON parsing error",
      });
      return {
        success: false,
        error: "EasySlip returned an invalid response.",
      };
    }

    console.log(
      "=== EASYSLIP V2 RAW RESPONSE ===",
      JSON.stringify(data, null, 2),
    );

    const isSuccessfulResponse =
      isRecord(data) && data.success === true;

    if (!response.ok || !isSuccessfulResponse) {
      const errorCode =
        getString(getNestedValue(data, ["error", "code"])) ||
        `HTTP_${response.status}`;
      const apiErrorMessage =
        getString(getNestedValue(data, ["error", "message"])) ||
        "EasySlip rejected the uploaded slip.";

      console.error("EasySlip Error Code:", errorCode);
      console.error("EasySlip Error Message:", apiErrorMessage);
      console.error("[EASYSLIP ACTION] V2 verification rejected.", {
        status: response.status,
        errorCode,
        apiErrorMessage,
      });

      return {
        success: false,
        error:
          response.status >= 500
            ? "EasySlip is temporarily unavailable. Please try again."
            : apiErrorMessage,
        errorCode,
        data,
      };
    }

    const rawSlip = getNestedValue(data, ["data", "rawSlip"]);
    const sender = getString(
      getNestedValue(rawSlip, ["sender", "account", "name", "th"]),
    );
    const receiver = getString(
      getNestedValue(rawSlip, ["receiver", "account", "name", "th"]),
    );
    const amount = getNumber(
      getNestedValue(rawSlip, ["amount", "amount"]),
    );
    const transRef = getString(
      getNestedValue(rawSlip, ["transRef"]),
    );
    const bankReceiver = getString(
      getNestedValue(rawSlip, ["receiver", "bank", "short"]),
    );

    console.log("Sender:", sender);
    console.log("Receiver:", receiver);
    console.log("Amount:", amount);
    console.log("Transaction Ref:", transRef);
    console.log("Bank Receiver:", bankReceiver);

    if (!isRecord(rawSlip) || !transRef || amount === null) {
      console.error(
        "[EASYSLIP ACTION] V2 response is missing required rawSlip fields.",
        {
          sender,
          receiver,
          amount,
          transRef,
          bankReceiver,
        },
      );
      return {
        success: false,
        error: "EasySlip returned incomplete slip information.",
        errorCode: "INVALID_RESPONSE",
        data,
      };
    }

    return {
      success: true,
      data: {
        sender,
        receiver,
        amount,
        transRef,
        bankReceiver,
        raw: data,
      },
    };
  } catch (error) {
    console.error("[EASYSLIP ACTION] Verification request failed.", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        success: false,
        error: "EasySlip verification timed out. Please try again.",
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to verify the payment slip.",
    };
  }
}
