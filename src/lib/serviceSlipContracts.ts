type RecordValue = Record<string, unknown>;

export class ServiceSlipVerificationError extends Error {
  constructor(public readonly code: "CONFIGURATION" | "REJECTED" | "DUPLICATE" | "AMOUNT" | "RECEIVER" | "INCOMPLETE") { super(code); this.name = "ServiceSlipVerificationError"; }
}
function record(value: unknown): RecordValue { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nested(value: unknown, path: string[]) { let cursor = value; for (const key of path) cursor = record(cursor)[key]; return cursor; }
function normalizedAccount(value: string) { return value.replace(/[^0-9a-z]/gi, "").toLowerCase(); }
function normalizedName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH"); }
function satang(value: unknown) { const amount = Number(value); return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN; }

export function validateEasySlipServiceResponse(payload: unknown, expectedAmount: string, receiverConfig = {
  account: process.env.EASYSLIP_RECEIVER_ACCOUNT?.trim() || process.env.COMPANY_BANK_ACCOUNT?.trim() || "",
  name: process.env.EASYSLIP_RECEIVER_NAME?.trim() || process.env.COMPANY_BANK_ACCOUNT_NAME?.trim() || "",
}) {
  const root = record(payload); const data = record(root.data);
  if (root.success !== true) throw new ServiceSlipVerificationError("REJECTED");
  if (data.isDuplicate !== false) throw new ServiceSlipVerificationError("DUPLICATE");
  if (data.matchedAccount === null || data.matchedAccount === undefined) throw new ServiceSlipVerificationError("RECEIVER");
  if (data.isAmountMatched !== true) throw new ServiceSlipVerificationError("AMOUNT");
  const rawSlip = record(data.rawSlip);
  const transRef = text(rawSlip.transRef) || text(data.transRef);
  const amount = nested(rawSlip, ["amount", "amount"]) ?? data.amount;
  if (!transRef || !Number.isSafeInteger(satang(amount))) throw new ServiceSlipVerificationError("INCOMPLETE");
  if (satang(amount) !== satang(expectedAmount)) throw new ServiceSlipVerificationError("AMOUNT");
  const matchedAccount = record(data.matchedAccount);
  const receiver = record(rawSlip.receiver); const accountNode = receiver.account;
  const receiverAccount = text(matchedAccount.bankNumber)
    || text(nested(accountNode, ["bank", "account"]))
    || text(nested(accountNode, ["proxy", "account"]));
  const receiverName = text(matchedAccount.nameTh) || text(matchedAccount.nameEn)
    || text(nested(accountNode, ["name", "th"])) || text(nested(accountNode, ["name", "en"]));
  // The account number is the security boundary.  A receiver name is useful
  // for an additional match when configured, but it is not available in every
  // EasySlip/bank response and should not make a valid account-only setup fail.
  if (!receiverConfig.account) throw new ServiceSlipVerificationError("CONFIGURATION");
  if (!receiverAccount || normalizedAccount(receiverAccount) !== normalizedAccount(receiverConfig.account)) throw new ServiceSlipVerificationError("RECEIVER");
  if (receiverConfig.name && (!receiverName || normalizedName(receiverName) !== normalizedName(receiverConfig.name))) {
    throw new ServiceSlipVerificationError("RECEIVER");
  }
  return { transRef, amount: (satang(amount) / 100).toFixed(2), receiverAccount, receiverName, rawSlip, payload: root };
}
