"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { requireStaff } from "@/lib/auth-guard";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";

const MAX_SANDBOX_SLIP_BYTES = 12 * 1024 * 1024;
const SANDBOX_SLIP_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic", "pdf"];

function isTrustedSandboxSlipUrl(value: string) {
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredSupabaseUrl) return false;

  try {
    const url = new URL(value);
    const supabaseHost = new URL(configuredSupabaseUrl).hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.toLowerCase() === supabaseHost &&
      url.pathname.includes("/storage/v1/object/public/proposals/test-slips/")
    );
  } catch {
    return false;
  }
}

export async function uploadSandboxSlip(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    await requireStaff();

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { success: false, error: "กรุณาอัปโหลดไฟล์รูปภาพ" };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: SANDBOX_SLIP_FILE_KINDS,
      fallbackName: "sandbox-slip",
      maxBytes: MAX_SANDBOX_SLIP_BYTES,
    });

    const fileName = `sandbox-slip-${crypto.randomUUID()}.${validatedFile.extension}`;
    const filePath = `test-slips/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const supabaseAdmin = createAdminClient();

    const { error: uploadError } = await supabaseAdmin.storage
      .from("proposals")
      .upload(filePath, buffer, {
        contentType: validatedFile.contentType,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("[Sandbox Slip Upload] Storage upload failed:", uploadError.message);
      return { success: false, error: "ไม่สามารถอัปโหลดไฟล์ได้" };
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("proposals")
      .getPublicUrl(filePath);

    return { success: true, url: publicUrl };
  } catch (error: unknown) {
    console.error("[Sandbox Slip Upload] Failed:", error);
    return { success: false, error: "Failed to upload file" };
  }
}

export async function verifyTestSlip(slipImageUrl: string) {
  try {
    const normalizedSlipImageUrl = slipImageUrl.trim();
    if (!normalizedSlipImageUrl) {
      return { success: false, error: "Slip image URL is required" };
    }

    if (!isTrustedSandboxSlipUrl(normalizedSlipImageUrl)) {
      return { success: false, error: "Slip image URL is not from the sandbox upload storage." };
    }

    const apiKey = process.env.EASYSLIP_API_KEY;
    if (!apiKey) {
      return { success: false, error: "EASYSLIP_API_KEY is not configured" };
    }

    const response = await fetch("https://api.easyslip.com/v2/verify/bank", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: normalizedSlipImageUrl,
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return { success: response.ok, data: payload };
  } catch (error: unknown) {
    console.error("[Sandbox Slip Verify] Failed:", error);
    return { success: false, error: "Failed to verify slip" };
  }
}
