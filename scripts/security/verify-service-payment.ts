import { ServiceSlipVerificationError, validateEasySlipServiceResponse } from "../../src/lib/serviceSlipContracts";
import { isProcessingLeaseStale } from "../../src/lib/processingLease";

const payload = {
  success: true,
  data: {
    isDuplicate: false,
    isAmountMatched: true,
    matchedAccount: { bankNumber: "123-4-56789-0", nameTh: "บริษัท โซลาร์ดรีม จำกัด" },
    rawSlip: { transRef: "TX-EXAMPLE-001", amount: { amount: 1500 }, receiver: { account: { bank: { account: "1234567890" } }, bank: { short: "KBANK" } } },
  },
};
const verified = validateEasySlipServiceResponse(payload, "1500.00", { account: "1234567890", name: "บริษัท โซลาร์ดรีม จำกัด" });
if (verified.transRef !== "TX-EXAMPLE-001" || verified.amount !== "1500.00") throw new Error("Valid EasySlip v2 contract failed.");
for (const [mutation, code] of [
  [{ data: { ...payload.data, isDuplicate: true } }, "DUPLICATE"],
  [{ data: { ...payload.data, isAmountMatched: false } }, "AMOUNT"],
  [{ data: { ...payload.data, matchedAccount: null } }, "RECEIVER"],
] as const) {
  try { validateEasySlipServiceResponse({ ...payload, ...mutation }, "1500.00", { account: "1234567890", name: "บริษัท โซลาร์ดรีม จำกัด" }); throw new Error("Invalid EasySlip response was accepted."); }
  catch (error) { if (!(error instanceof ServiceSlipVerificationError) || error.code !== code) throw error; }
}
try { validateEasySlipServiceResponse(payload, "1500.01", { account: "1234567890", name: "บริษัท โซลาร์ดรีม จำกัด" }); throw new Error("Satang mismatch was accepted."); }
catch (error) { if (!(error instanceof ServiceSlipVerificationError) || error.code !== "AMOUNT") throw error; }
const now = new Date("2026-01-01T00:10:00.000Z");
if (!isProcessingLeaseStale(new Date("2026-01-01T00:04:59.000Z"), now, 300)) throw new Error("Stale verification lease was not reclaimable.");
if (isProcessingLeaseStale(new Date("2026-01-01T00:05:01.000Z"), now, 300)) throw new Error("Active verification lease was reclaimed early.");
process.stdout.write("Service payment EasySlip v2 fail-closed contracts passed.\n");
