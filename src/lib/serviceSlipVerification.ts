import "server-only";

import { ServiceSlipVerificationError, validateEasySlipServiceResponse } from "@/lib/serviceSlipContracts";
export { ServiceSlipVerificationError } from "@/lib/serviceSlipContracts";

export async function verifyServiceSlip(file: File, expectedAmount: string) {
  const apiKey = process.env.EASYSLIP_API_KEY?.trim();
  if (!apiKey) throw new ServiceSlipVerificationError("CONFIGURATION");
  const form = new FormData();
  form.set("image", file, file.name);
  form.set("matchAccount", "true");
  form.set("matchAmount", expectedAmount);
  form.set("checkDuplicate", "true");
  const response = await fetch("https://api.easyslip.com/v2/verify/bank", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ServiceSlipVerificationError(response.status === 409 ? "DUPLICATE" : "REJECTED");
  return validateEasySlipServiceResponse(payload, expectedAmount);
}
