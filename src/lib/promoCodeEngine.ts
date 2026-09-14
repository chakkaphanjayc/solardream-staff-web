import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { servicePromotions, servicePromotionRedemptions, paymentRequests } from "@/db/schema";
import { getSigningSecret } from "@/lib/portalTokens";

/** Zod input validation schema for strict promo code sanitization */
export const promoCodeInputSchema = z
  .string()
  .trim()
  .min(3, "รหัสส่วนลดต้องมีความยาวอย่างน้อย 3 ตัวอักษร")
  .max(32, "รหัสส่วนลดต้องมีความยาวไม่เกิน 32 ตัวอักษร")
  .regex(/^[A-Za-z0-9_-]+$/, "รหัสส่วนลดต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดกลางเท่านั้น")
  .transform((val) => val.toUpperCase());

/** In-memory rate limiting map for anti-brute-force protection */
const failedAttemptsMap = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window

function checkRateLimit(key: string): { allowed: boolean; remainingSeconds?: number } {
  const now = Date.now();
  const entry = failedAttemptsMap.get(key);

  if (!entry || now > entry.resetAt) {
    failedAttemptsMap.set(key, { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    const remainingSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remainingSeconds };
  }

  return { allowed: true };
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const entry = failedAttemptsMap.get(key);
  if (!entry || now > entry.resetAt) {
    failedAttemptsMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearRateLimit(key: string) {
  failedAttemptsMap.delete(key);
}

/** Computes HMAC-SHA256 digest for constant-time DB lookup */
export async function computePromoCodeDigest(code: string): Promise<string> {
  const normalized = code.trim().toUpperCase();
  const secretKey = (await getSigningSecret()) || "solardream-promo-secret-fallback";
  return createHmac("sha256", secretKey)
    .update(`promotion:${normalized}`)
    .digest("base64url");
}

export interface HardcodedPromoRule {
  code: string;
  discountAmount?: number;
  discountPercent?: number;
  minOrderAmount?: number;
  maxDiscountCap?: number;
  description: string;
}

const HARDCODED_PROMO_RULES: Record<string, HardcodedPromoRule> = {
  SOLAR2026: {
    code: "SOLAR2026",
    discountAmount: 3000,
    description: "ส่วนลดต้อนรับปี 2026 (3,000 บาท)",
  },
  EARLYBIRD: {
    code: "EARLYBIRD",
    discountPercent: 5,
    maxDiscountCap: 20000,
    description: "ส่วนลดมัดจำล่วงหน้า 5% (สูงสุด 20,000 บาท)",
  },
  SOLAR5000: {
    code: "SOLAR5000",
    discountAmount: 5000,
    minOrderAmount: 100000,
    description: "คูปองส่วนลดพิเศษ SolarAtelier (5,000 บาท สำหรับยอด 100,000 บาทขึ้นไป)",
  },
  CLEANENERGY: {
    code: "CLEANENERGY",
    discountPercent: 10,
    maxDiscountCap: 30000,
    minOrderAmount: 150000,
    description: "ส่วนลดแคมเปญพลังงานสะอาด 10% (สูงสุด 30,000 บาท)",
  },
};

export interface ApplyPromoCodeResult {
  success: boolean;
  error?: string;
  discountAmount?: number;
  newAmount?: number;
  promoCode?: string;
  promoDescription?: string;
}

/** Securely validates and applies a promotional code to a payment request */
export async function secureApplyPromoCode(
  paymentRequestId: string,
  rawPromoCode: string,
  actorHash: string = "anonymous"
): Promise<ApplyPromoCodeResult> {
  // 1. Sanitize & Validate Input using Zod
  const parseResult = promoCodeInputSchema.safeParse(rawPromoCode);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues[0]?.message || "รูปแบบรหัสส่วนลดไม่ถูกต้อง";
    return { success: false, error: errorMsg };
  }

  const cleanCode = parseResult.data;

  // 2. Anti-Brute-Force Rate Limiting Check
  const rateLimitKey = `promo_attempt:${paymentRequestId}`;
  const rateCheck = checkRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `คุณลองกรอกรหัสส่วนลดผิดบ่อยเกินไป กรุณารอ ${rateCheck.remainingSeconds} วินาทีก่อนลองใหม่`,
    };
  }

  // 3. Fetch Payment Request
  const pr = await db.query.paymentRequests.findFirst({
    where: eq(paymentRequests.id, paymentRequestId),
  });

  if (!pr) {
    recordFailedAttempt(rateLimitKey);
    return { success: false, error: "ไม่พบคำขอชำระเงินในระบบ" };
  }

  if (pr.status === "PAID") {
    return { success: false, error: "คำขอชำระเงินนี้ชำระแล้ว ไม่สามารถใช้ส่วนลดย้อนหลังได้" };
  }

  const originalAmount = Number(pr.amountRequested);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    return { success: false, error: "จำนวนเงินในคำขอชำระเงินไม่ถูกต้อง" };
  }

  const now = new Date();
  const codeDigest = await computePromoCodeDigest(cleanCode);

  // 4. Check DB-backed servicePromotions
  const dbPromotion = await db.query.servicePromotions.findFirst({
    where: and(
      eq(servicePromotions.codeDigest, codeDigest),
      eq(servicePromotions.isActive, true)
    ),
  });

  let discountAmount = 0;
  let promoDescription = "";

  if (dbPromotion) {
    // Validate date window
    if (dbPromotion.startsAt && dbPromotion.startsAt > now) {
      recordFailedAttempt(rateLimitKey);
      return { success: false, error: "รหัสส่วนลดนี้ยังไม่เปิดใช้งาน" };
    }
    if (dbPromotion.endsAt && dbPromotion.endsAt <= now) {
      recordFailedAttempt(rateLimitKey);
      return { success: false, error: "รหัสส่วนลดนี้หมดอายุแล้ว" };
    }

    // Validate minimum subtotal satang
    const originalSatang = Math.round(originalAmount * 100);
    if (originalSatang < dbPromotion.minimumSubtotalSatang) {
      const minThb = Math.round(dbPromotion.minimumSubtotalSatang / 100);
      return {
        success: false,
        error: `รหัสส่วนลดนี้ต้องมียอดชำระขั้นต่ำ ${minThb.toLocaleString("th-TH")} บาท`,
      };
    }

    // Validate overall usage limit
    if (dbPromotion.usageLimit !== null && dbPromotion.redemptionCount >= dbPromotion.usageLimit) {
      recordFailedAttempt(rateLimitKey);
      return { success: false, error: "รหัสส่วนลดนี้ถูกใช้งานครบสิทธิ์เต็มจำนวนแล้ว" };
    }

    // Calculate DB discount
    if (dbPromotion.discountType === "PERCENT_BPS") {
      // Basis points: 100 bps = 1%
      const discountSatang = Math.round((originalSatang * dbPromotion.value) / 10000);
      let finalSatang = discountSatang;
      if (dbPromotion.maximumDiscountSatang !== null && dbPromotion.maximumDiscountSatang > 0) {
        finalSatang = Math.min(discountSatang, dbPromotion.maximumDiscountSatang);
      }
      discountAmount = Math.round(finalSatang / 100);
    } else {
      // FIXED_SATANG
      const discountSatang = dbPromotion.value;
      let finalSatang = discountSatang;
      if (dbPromotion.maximumDiscountSatang !== null && dbPromotion.maximumDiscountSatang > 0) {
        finalSatang = Math.min(discountSatang, dbPromotion.maximumDiscountSatang);
      }
      discountAmount = Math.round(finalSatang / 100);
    }

    const thName = typeof dbPromotion.name === "object" && dbPromotion.name && "th" in dbPromotion.name
      ? String((dbPromotion.name as Record<string, unknown>).th)
      : cleanCode;
    promoDescription = `ส่วนลด ${thName} (-${discountAmount.toLocaleString("th-TH")} บาท)`;
  } else {
    // 5. Fallback to System Hardcoded Campaign Codes
    const fallbackRule = HARDCODED_PROMO_RULES[cleanCode];
    if (!fallbackRule) {
      recordFailedAttempt(rateLimitKey);
      return { success: false, error: "รหัสส่วนลดไม่ถูกต้อง หรือหมดอายุแล้ว" };
    }

    if (fallbackRule.minOrderAmount && originalAmount < fallbackRule.minOrderAmount) {
      return {
        success: false,
        error: `รหัสส่วนลดนี้ใช้ได้กับยอดชำระขั้นต่ำ ${fallbackRule.minOrderAmount.toLocaleString("th-TH")} บาทขึ้นไป`,
      };
    }

    if (fallbackRule.discountAmount) {
      discountAmount = fallbackRule.discountAmount;
    } else if (fallbackRule.discountPercent) {
      discountAmount = Math.round((originalAmount * fallbackRule.discountPercent) / 100);
      if (fallbackRule.maxDiscountCap) {
        discountAmount = Math.min(discountAmount, fallbackRule.maxDiscountCap);
      }
    }

    promoDescription = fallbackRule.description;
  }

  // Cap discount to original amount
  discountAmount = Math.min(originalAmount, Math.max(0, discountAmount));
  const newAmount = Math.max(0, originalAmount - discountAmount);

  // Clear rate limit on successful validation
  clearRateLimit(rateLimitKey);

  // 6. Perform Atomic DB Update & Log Audit Redemption
  if (dbPromotion) {
    await db.transaction(async (tx) => {
      await tx
        .update(servicePromotions)
        .set({
          redemptionCount: sql`${servicePromotions.redemptionCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(servicePromotions.id, dbPromotion.id));

      await tx.insert(servicePromotionRedemptions).values({
        promotionId: dbPromotion.id,
        serviceOrderId: pr.proposalId, // reference proposal/order
        actorHash: actorHash,
        discountSatang: Math.round(discountAmount * 100),
      });
    });
  }

  // Update Payment Request title & amount
  const newTitle = pr.title.includes("ส่วนลด")
    ? pr.title
    : `${pr.title} (ส่วนลด ${cleanCode}: -${discountAmount.toLocaleString("th-TH")}฿)`;

  await db
    .update(paymentRequests)
    .set({
      amountRequested: newAmount.toFixed(2),
      title: newTitle,
    })
    .where(eq(paymentRequests.id, paymentRequestId));

  return {
    success: true,
    discountAmount,
    newAmount,
    promoCode: cleanCode,
    promoDescription,
  };
}
