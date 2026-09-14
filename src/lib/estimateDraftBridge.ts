import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users, wizardEstimateDrafts } from "@/db/schema";

export const ESTIMATE_DRAFT_COOKIE = "sd_estimate_bridge";
export const ESTIMATE_DRAFT_MAX_BODY_BYTES = 128 * 1024;
const MAX_STORED_BYTES = 96 * 1024;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{64}$/;
const SENSITIVE_KEY = /(?:password|secret|token|email|phone|mobile|customer.?name|full.?name|address|notes?|signature|cookie|authorization)/i;

export type EstimateJson = string | number | boolean | null | EstimateJson[] | { [key: string]: EstimateJson };
export type EstimateJsonObject = { [key: string]: EstimateJson };

const jsonObjectSchema = z.custom<EstimateJsonObject>((value) => Boolean(value) && typeof value === "object" && !Array.isArray(value));
const finiteNumber = z.number().finite();
const estimateSummarySchema = z.object({
  systemPackageId: z.string().trim().min(1).max(160), systemPackageLabel: z.string().trim().min(1).max(240), systemPackageSizeKwp: finiteNumber.nonnegative().max(100),
  proposalTier: z.string().trim().min(1).max(120), proposalTierEquipment: z.string().trim().min(1).max(500),
  systemSizeKwp: finiteNumber.nonnegative().max(100), panelCount: z.number().int().nonnegative().max(1_000), totalPrice: finiteNumber.nonnegative().max(1_000_000_000),
  monthlySavings: finiteNumber.nonnegative().max(10_000_000), paybackPeriod: z.string().trim().max(40), paybackPeriodYears: finiteNumber.nonnegative().max(100),
  estimatedInstallment: finiteNumber.nonnegative().max(100_000_000), roofFacing: z.string().trim().max(80), roofMaterial: z.string().trim().max(120),
  electricalPhase: z.union([z.string().trim().max(40), z.number().int().min(1).max(3)]), monthlyBill: finiteNumber.nonnegative().max(100_000_000),
  daytimeUsagePct: finiteNumber.min(0).max(100), electricityTariff: z.enum(["flat", "tou"]), futureLoad: finiteNumber.nonnegative().max(1_000_000),
  isManualSize: z.boolean(), adjustedSunHours: finiteNumber.nonnegative().max(24), daytimeDemandKwh: finiteNumber.nonnegative().max(1_000_000),
  selfConsumedDailyKwh: finiteNumber.nonnegative().max(1_000_000), wastedExcessDailyKwh: finiteNumber.nonnegative().max(1_000_000),
  monthlySelfConsumptionSavings: finiteNumber.nonnegative().max(100_000_000), cashFlow10Years: jsonObjectSchema, ecoImpact: jsonObjectSchema,
  activeFinancing: z.object({ id: z.string().trim().max(160), providerName: z.string().trim().max(240), financeType: z.string().trim().max(80) }).strict().nullable(),
}).strict();

const estimateExportSchema = z.object({
    wizardAnswers: jsonObjectSchema, selectedAddonIds: z.array(z.string().trim().min(1).max(120)).max(100), selectedFinancingId: z.string().trim().max(160).nullable(),
    downPaymentPct: finiteNumber.min(0).max(100), loanTermMonths: z.number().int().min(1).max(600), productOverrides: jsonObjectSchema,
    summary: estimateSummarySchema, configurationData: jsonObjectSchema,
  }).strict();

export const estimateDraftRequestSchema = z.object({
  version: z.literal(1),
  intent: z.enum(["SAVE", "REPORT", "PROPOSAL"]),
  estimate: estimateExportSchema,
}).strict();
const financialReportRequestSchema = z.object({ version: z.literal(1), estimate: estimateExportSchema }).strict();
export type EstimateDraftRequest = z.infer<typeof estimateDraftRequestSchema>;
export type FinancialReportRequest = z.infer<typeof financialReportRequestSchema>;

function sanitizeJson(value: unknown, depth = 0): EstimateJson {
  if (depth > 8 || value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 1_000);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeJson(item, depth + 1));
  if (typeof value === "object") {
    const result: EstimateJsonObject = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, 200)) {
      const key = rawKey.trim().slice(0, 100);
      if (!key || key === "__proto__" || key === "prototype" || key === "constructor" || SENSITIVE_KEY.test(key)) continue;
      result[key] = sanitizeJson(rawValue, depth + 1);
    }
    return result;
  }
  return null;
}

export function parseEstimateDraftRequest(value: unknown): EstimateDraftRequest {
  const sanitized = sanitizeJson(value);
  const parsed = estimateDraftRequestSchema.parse(sanitized);
  if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > MAX_STORED_BYTES) throw new Error("Estimate draft is too large.");
  return parsed;
}

export function parseFinancialReportRequest(value: unknown): FinancialReportRequest {
  const parsed = financialReportRequestSchema.parse(sanitizeJson(value));
  if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > MAX_STORED_BYTES) throw new Error("Financial report request is too large.");
  return parsed;
}

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function isValidEstimateDraftToken(value: string) { return TOKEN_PATTERN.test(value); }
export function estimateDraftCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: DRAFT_TTL_MS / 1_000 };
}

export async function createEstimateDraft(input: { request: EstimateDraftRequest; requestKey: string; previousToken?: string }) {
  const payload = { version: 1 as const, savedAt: new Date().toISOString(), intent: input.request.intent, estimate: input.request.estimate };
  const payloadSha256 = digest(JSON.stringify(input.request));
  const requestKeyDigest = digest(input.requestKey);
  const replay = await db.query.wizardEstimateDrafts.findFirst({ where: eq(wizardEstimateDrafts.requestKeyDigest, requestKeyDigest) });
  if (replay) {
    if (replay.payloadSha256 !== payloadSha256) throw new Error("Idempotency key was already used with different content.");
    if (!input.previousToken || digest(input.previousToken) !== replay.tokenDigest) throw new Error("Estimate draft replay token is unavailable.");
    return { token: input.previousToken, draftId: replay.id, replayed: true };
  }
  const token = randomBytes(48).toString("base64url");
  const tokenDigest = digest(token);
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
  const [created] = await db.transaction(async (tx) => {
    if (input.previousToken && isValidEstimateDraftToken(input.previousToken)) {
      await tx.update(wizardEstimateDrafts).set({ status: "REVOKED", updatedAt: new Date() }).where(and(eq(wizardEstimateDrafts.tokenDigest, digest(input.previousToken)), eq(wizardEstimateDrafts.status, "ACTIVE")));
    }
    return tx.insert(wizardEstimateDrafts).values({ tokenDigest, requestKeyDigest, payloadSha256, intent: input.request.intent, payload, expiresAt }).returning();
  });
  return { token, draftId: created.id, replayed: false };
}

export async function claimEstimateDraftToken(userId: string, rawToken: string) {
  if (!isValidEstimateDraftToken(rawToken)) return { claimed: false as const, terminal: true as const };
  const tokenDigest = digest(rawToken);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimate-draft:${tokenDigest}`}))`);
    const draft = await tx.query.wizardEstimateDrafts.findFirst({ where: eq(wizardEstimateDrafts.tokenDigest, tokenDigest) });
    if (!draft) return { claimed: false as const, terminal: true as const };
    if (draft.status === "CLAIMED") return { claimed: draft.claimedByUserId === userId, terminal: true as const };
    if (draft.status !== "ACTIVE" || draft.expiresAt <= new Date()) {
      if (draft.status === "ACTIVE") await tx.update(wizardEstimateDrafts).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(wizardEstimateDrafts.id, draft.id));
      return { claimed: false as const, terminal: true as const };
    }
    const [updatedUser] = await tx.update(users).set({ lastEstimateDraft: draft.payload }).where(eq(users.id, userId)).returning({ id: users.id });
    if (!updatedUser) throw new Error("Authenticated user is not synchronized.");
    await tx.update(wizardEstimateDrafts).set({ status: "CLAIMED", claimedByUserId: userId, claimedAt: new Date(), updatedAt: new Date() }).where(and(eq(wizardEstimateDrafts.id, draft.id), eq(wizardEstimateDrafts.status, "ACTIVE"), gt(wizardEstimateDrafts.expiresAt, new Date())));
    return { claimed: true as const, terminal: true as const };
  });
}

export async function claimEstimateDraftFromCookie(userId: string) {
  const store = await cookies();
  const token = store.get(ESTIMATE_DRAFT_COOKIE)?.value || "";
  if (!token) return { claimed: false as const, terminal: false as const };
  const result = await claimEstimateDraftToken(userId, token);
  if (result.terminal) store.delete(ESTIMATE_DRAFT_COOKIE);
  return result;
}
