"use server";

import { db } from "@/db";
import {
  activityLogs,
  installationJobTickets,
  paymentMilestones,
  paymentTransactions,
  proposals,
  users,
  verifiedSlips,
} from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { extractConfigurationItems } from "@/lib/erpnextBom";
import { safeSyncMilestonePaymentToERP } from "@/lib/erpnextPayments";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { requireStaff } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { getCatalogProductsByIds } from "@/lib/erpnextCatalog";
import { validateUploadFile, type UploadFileKind } from "@/lib/fileValidation";
import {
  getOrCreateCustomerFolder,
  getOrCreateProposalFolder,
  getOrCreateSubfolder,
  uploadFileToDrive,
} from "@/lib/googleDrive";

const EASYSLIP_VERIFY_URL = "https://api.easyslip.com/v1/verify";
const SLIP_READ_ERROR =
  "ไม่สามารถอ่าน QR Code บนสลิปได้ กรุณาใช้รูปภาพที่ชัดเจนและไม่ถูกตัดขอบ";
const MAX_PAYMENT_SLIP_BYTES = 12 * 1024 * 1024;
const PAYMENT_SLIP_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic", "pdf"];

class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

type EasySlipData = {
  transRef: string;
  receiverAccount: string;
  amount: number;
  rawData: Record<string, unknown>;
};

export type VerifySlipPaymentResult =
  | {
      success: true;
      orderId: string;
      milestoneId: string;
      transRef: string;
      paidAt: Date;
      isFullyPaid: boolean;
    }
  | {
      success: false;
      error: string;
    };

export type VerifySlipPaymentAsAdminResult =
  | {
      success: true;
      orderId: string;
      milestoneId: string;
      transRef: string;
      paidAt: Date;
      isFullyPaid: boolean;
      data: unknown;
    }
  | {
      success: false;
      error: string;
    };

export type CartCheckoutItem = {
  productId?: string;
  quantity: number;
  product?: {
    id?: string;
  };
};

export type CheckoutFulfillmentType =
  | "SUPPLY_ONLY"
  | "INSTALLATION";

function isSecureSlipUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRejectedVerification(payload: Record<string, unknown>): boolean {
  return payload.success === false || payload.valid === false;
}

function getEasySlipData(payload: Record<string, unknown>): EasySlipData | null {
  const slipData = isObject(payload.data) ? payload.data : payload;
  const receiver = isObject(slipData.receiver) ? slipData.receiver : null;
  const amountData = isObject(slipData.amount) ? slipData.amount : null;
  const transRef = typeof slipData.transRef === "string" ? slipData.transRef.trim() : "";
  const receiverAccount =
    receiver && typeof receiver.account === "string" ? receiver.account.trim() : "";
  const amount = amountData ? Number(amountData.amount) : Number.NaN;

  if (!transRef || !receiverAccount || !Number.isFinite(amount)) {
    return null;
  }

  return {
    transRef,
    receiverAccount,
    amount,
    rawData: slipData,
  };
}

function normalizeBankAccount(value: string): string {
  return value.replace(/[-\s]/g, "");
}

function getPostgresErrorCode(error: unknown): string | undefined {
  if (!isObject(error)) return undefined;
  if (typeof error.code === "string") return error.code;
  return getPostgresErrorCode(error.cause);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getOrderItemQuantities(
  configurationData: unknown,
): Map<string, number> {
  const quantities = new Map<string, number>();

  for (const item of extractConfigurationItems(configurationData)) {
    const productId =
      typeof item.productId === "string" ? item.productId.trim() : "";
    const quantity = Number(item.quantity ?? item.qty ?? item.count);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) continue;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  return quantities;
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}

function normalizeCartItems(cartItems: CartCheckoutItem[]) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new PaymentValidationError("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
  }
  if (cartItems.length > 100) {
    throw new PaymentValidationError("จำนวนรายการสินค้าเกินขีดจำกัด");
  }

  const quantities = new Map<string, number>();

  for (const item of cartItems) {
    const productId = (item.productId || item.product?.id || "").trim();
    const quantity = Number(item.quantity);

    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      quantity > 10_000
    ) {
      throw new PaymentValidationError("รายการสินค้าไม่ถูกต้อง");
    }

    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  return quantities;
}

export async function createOrderFromCart(
  cartItems: CartCheckoutItem[],
  fulfillmentType: CheckoutFulfillmentType,
) {
  try {
    const user = await getAuthenticatedUser();

    if (
      fulfillmentType !== "SUPPLY_ONLY" &&
      fulfillmentType !== "INSTALLATION"
    ) {
      return { success: false as const, error: "ประเภทการสั่งซื้อไม่ถูกต้อง" };
    }

    const itemQuantities = normalizeCartItems(cartItems);
    const productIds = [...itemQuantities.keys()].sort();
    const productRows = (await getCatalogProductsByIds(productIds)).map((product) => ({
      ...product,
      name: `${product.brand} ${product.model}`.trim(),
    }));
    const productsById = new Map(
      productRows.map((product) => [product.id, product]),
    );

    const normalizedItems = productIds.map((productId) => {
      const product = productsById.get(productId);
      const quantity = itemQuantities.get(productId);

      if (!product || !quantity || !product.isActive || !product.isAvailable) {
        throw new PaymentValidationError(
          `สินค้า ${product?.name || productId} ไม่พร้อมจำหน่าย`,
        );
      }

      return {
        productId,
        productName: product.name,
        quantity,
        unitPrice: roundCurrency(product.price),
        totalPrice: roundCurrency(product.price * quantity),
      };
    });

    if (fulfillmentType === "SUPPLY_ONLY") {
      for (const item of normalizedItems) {
        const product = productsById.get(item.productId);
        if (!product || product.stock < item.quantity) {
          throw new PaymentValidationError(
            `สินค้า ${product?.name || item.productId} มีสต็อกไม่เพียงพอใน ERPNext`,
          );
        }
      }
    }

    const totalPrice = roundCurrency(
      normalizedItems.reduce((sum, item) => sum + item.totalPrice, 0),
    );
    if (totalPrice <= 0) {
      throw new PaymentValidationError("ยอดรวมออเดอร์ไม่ถูกต้อง");
    }

    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(proposals)
        .values({
          userId: user.id,
          systemSizeKwp: 0,
          panelCount: 0,
          totalPrice,
          monthlySavings: 0,
          paybackPeriod: "0.0",
          status:
            fulfillmentType === "SUPPLY_ONLY"
              ? "PENDING_PAYMENT"
              : "PENDING_SALES_REVIEW",
          projectStatus:
            fulfillmentType === "INSTALLATION"
              ? "WAITING_SURVEY"
              : null,
          fulfillmentType,
          isInstallationRequired:
            fulfillmentType === "INSTALLATION",
          configurationData: {
            items: normalizedItems,
            fulfillmentType,
            requiresInstallation:
              fulfillmentType === "INSTALLATION",
            checkoutCreatedAt: now.toISOString(),
          },
        })
        .returning({ id: proposals.id });

      if (fulfillmentType === "INSTALLATION") {
        const [jobTicket] = await tx
          .insert(installationJobTickets)
          .values({
            quotationId: order.id,
            jobType: "SURVEY",
            status: "PENDING_ASSIGNMENT",
            installationNotes:
              "SITE_SURVEY: Inspect roof structural capability and the electrical main distribution board.",
          })
          .returning({ id: installationJobTickets.id });

        return {
          orderId: order.id,
          jobTicketId: jobTicket.id,
          holdExpiresAt: null,
        };
      }

      return {
        orderId: order.id,
        jobTicketId: null,
        holdExpiresAt: null,
      };
    });

    if (fulfillmentType === "INSTALLATION") {
      return {
        success: true as const,
        strategy: fulfillmentType,
        orderId: result.orderId,
        jobTicketId: result.jobTicketId,
        projectStatus: "WAITING_SURVEY" as const,
        redirectTo: null,
        message:
          "บันทึกคำขอใบเสนอราคาแล้ว เจ้าหน้าที่ประสานงานวิศวกรรมจะติดต่อเพื่อนัดสำรวจหลังคาและตู้เมนไฟฟ้า",
      };
    }

    return {
      success: true as const,
      strategy: fulfillmentType,
      orderId: result.orderId,
      amountDue: totalPrice,
      inventoryHoldExpiresAt: null,
      redirectTo: `/checkout/${result.orderId}/payment`,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    if (error instanceof PaymentValidationError) {
      return { success: false as const, error: error.message };
    }

    console.error("[CHECKOUT] Failed to create order from cart.", {
      fulfillmentType,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      success: false as const,
      error: "ไม่สามารถสร้างออเดอร์ได้ กรุณาลองใหม่ภายหลัง",
    };
  }
}

export async function generateOrderMilestones(
  orderId: string,
  totalAmount: number,
) {
  const user = await getAuthenticatedUser();
  const normalizedOrderId = orderId.trim();
  const requestedTotal = Number(totalAmount);

  if (!normalizedOrderId || !Number.isFinite(requestedTotal) || requestedTotal <= 0) {
    return { success: false, error: "ยอดรวมออเดอร์ไม่ถูกต้อง" };
  }

  const [order, actor] = await Promise.all([
    db.query.proposals.findFirst({
      where: eq(proposals.id, normalizedOrderId),
      columns: {
        id: true,
        userId: true,
        totalPrice: true,
        fulfillmentType: true,
      },
    }),
    db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { role: true },
    }),
  ]);

  const isStaff = actor
    ? ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(actor.role)
    : false;

  if (!order || (order.userId !== user.id && !isStaff)) {
    throw new UnauthorizedError();
  }

  if (Math.abs(Number(order.totalPrice) - requestedTotal) > 0.01) {
    return { success: false, error: "ยอดรวมไม่ตรงกับออเดอร์" };
  }

  const normalizedTotal = roundCurrency(Number(order.totalPrice));

  const isSupplyOnly = order.fulfillmentType === "SUPPLY_ONLY";
  const isInstallation = order.fulfillmentType === "INSTALLATION";

  if (!isSupplyOnly && !isInstallation) {
    return {
      success: false,
      error: "ประเภทการดำเนินงานไม่ถูกต้องสำหรับการชำระเงิน",
    };
  }

  try {
    const milestones = await db.transaction(async (tx) => {
      const existing = await tx.query.paymentMilestones.findFirst({
        where: eq(paymentMilestones.orderId, order.id),
        columns: { id: true },
      });

      if (existing) {
        throw new PaymentValidationError(
          "ออเดอร์นี้มีแผนแบ่งชำระเงินอยู่แล้ว",
        );
      }

      const valuesToInsert = isSupplyOnly
        ? [
            {
              orderId: order.id,
              milestoneOrder: 1,
              milestoneName: "ชำระเงินค่าสินค้าเต็มจำนวน (100%)",
              percentage: "100.00",
              amount: normalizedTotal.toFixed(2),
              status: "ACTIVE" as const,
            },
          ]
        : [
            {
              orderId: order.id,
              milestoneOrder: 1,
              milestoneName: "มัดจำสั่งซื้อและจองคิวติดตั้ง (30%)",
              percentage: "30.00",
              amount: roundCurrency(normalizedTotal * 0.3).toFixed(2),
              status: "ACTIVE" as const,
            },
            {
              orderId: order.id,
              milestoneOrder: 2,
              milestoneName: "วันขนส่งอุปกรณ์และเริ่มติดตั้ง (50%)",
              percentage: "50.00",
              amount: roundCurrency(normalizedTotal * 0.5).toFixed(2),
              status: "PENDING" as const,
            },
            {
              orderId: order.id,
              milestoneOrder: 3,
              milestoneName: "ส่งมอบงานและเปิดระบบ (20%)",
              percentage: "20.00",
              amount: roundCurrency(
                normalizedTotal -
                  roundCurrency(normalizedTotal * 0.3) -
                  roundCurrency(normalizedTotal * 0.5),
              ).toFixed(2),
              status: "PENDING" as const,
            },
          ];

      return tx
        .insert(paymentMilestones)
        .values(valuesToInsert)
        .returning();
    });

    return { success: true, milestones };
  } catch (error) {
    if (error instanceof PaymentValidationError) {
      return { success: false, error: error.message };
    }
    if (getPostgresErrorCode(error) === "23505") {
      return {
        success: false,
        error: "ออเดอร์นี้มีแผนแบ่งชำระเงินอยู่แล้ว",
      };
    }
    console.error("[PAYMENT] Failed to generate order milestones.", {
      orderId: normalizedOrderId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      success: false,
      error: "ไม่สามารถสร้างแผนแบ่งชำระเงินได้ กรุณาลองใหม่ภายหลัง",
    };
  }
}

export async function initializeOrderCheckout(orderId: string) {
  const user = await getAuthenticatedUser();
  const normalizedOrderId = orderId.trim();

  if (!normalizedOrderId) {
    return { success: false as const, error: "ไม่พบรหัสออเดอร์" };
  }

  const [order, actor] = await Promise.all([
    db.query.proposals.findFirst({
      where: eq(proposals.id, normalizedOrderId),
      columns: {
        id: true,
        userId: true,
        totalPrice: true,
        fulfillmentType: true,
        configurationData: true,
      },
    }),
    db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { role: true },
    }),
  ]);

  const isStaff = actor
    ? ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(actor.role)
    : false;

  if (!order || (order.userId !== user.id && !isStaff)) {
    throw new UnauthorizedError();
  }

  const totalAmount = roundCurrency(Number(order.totalPrice));
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return { success: false as const, error: "ยอดรวมออเดอร์ไม่ถูกต้อง" };
  }

  if (order.fulfillmentType === "INSTALLATION") {
    let milestones = await db.query.paymentMilestones.findMany({
      where: eq(paymentMilestones.orderId, order.id),
      orderBy: (milestone, { asc }) => [asc(milestone.milestoneOrder)],
    });

    if (milestones.length === 0) {
      const generated = await generateOrderMilestones(order.id, totalAmount);
      if (!generated.success || !generated.milestones) return generated;
      milestones = generated.milestones as typeof milestones;
    }

    const firstMilestone = milestones.find(
      (milestone) => milestone.milestoneOrder === 1,
    );
    if (!firstMilestone) {
      return {
        success: false as const,
        error: "ไม่พบงวดชำระเงินแรกของโครงการ",
      };
    }

    return {
      success: true as const,
      strategy: "INSTALLATION" as const,
      orderId: order.id,
      amountDue: Number(firstMilestone.amount),
      paymentRequirement: {
        type: "MILESTONE" as const,
        amountDue: Number(firstMilestone.amount),
      },
      milestone: firstMilestone,
      inventoryHoldExpiresAt: null,
    };
  }

  const itemQuantities = getOrderItemQuantities(order.configurationData);
  if (itemQuantities.size === 0) {
    return {
      success: false as const,
      error: "ออเดอร์ไม่มีรายการสินค้าที่สามารถสำรองสต็อกได้",
    };
  }

  const productIds = [...itemQuantities.keys()].sort();
  const productRows = (await getCatalogProductsByIds(productIds)).map((product) => ({
    ...product,
    name: `${product.brand} ${product.model}`.trim(),
  }));
  const productsById = new Map(productRows.map((product) => [product.id, product]));

  for (const productId of productIds) {
    const product = productsById.get(productId);
    const requestedQuantity = itemQuantities.get(productId) || 0;
    if (!product || !product.isActive || !product.isAvailable || product.stock < requestedQuantity) {
      return {
        success: false as const,
        error: `สินค้า ${product?.name || productId} ไม่พร้อมจำหน่ายหรือมีสต็อกไม่เพียงพอใน ERPNext`,
      };
    }
  }

  return {
    success: true as const,
    strategy: "SUPPLY_ONLY" as const,
    orderId: order.id,
    amountDue: totalAmount,
    paymentRequirement: {
      type: "UPFRONT" as const,
      amountDue: totalAmount,
    },
    milestone: null,
    inventoryHoldExpiresAt: null,
  };
}

export async function verifySlipPayment(
  milestoneId: string,
  slipImageUrl: string,
): Promise<VerifySlipPaymentResult> {
  const user = await getAuthenticatedUser();
  const normalizedMilestoneId = milestoneId.trim();
  const normalizedSlipUrl = slipImageUrl.trim();

  if (!normalizedMilestoneId || !isSecureSlipUrl(normalizedSlipUrl)) {
    return { success: false, error: SLIP_READ_ERROR };
  }

  const milestone = await db.query.paymentMilestones.findFirst({
    where: eq(paymentMilestones.id, normalizedMilestoneId),
    columns: {
      id: true,
      orderId: true,
      status: true,
      milestoneOrder: true,
      amount: true,
    },
    with: {
      order: {
        columns: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!milestone || milestone.order.userId !== user.id) {
    throw new UnauthorizedError();
  }

  if (milestone.status !== "ACTIVE") {
    return {
      success: false,
      error: "งวดชำระเงินนี้ไม่อยู่ในสถานะพร้อมชำระ",
    };
  }

  const apiKey = process.env.EASYSLIP_API_KEY;
  if (!apiKey) {
    console.error("[EASYSLIP] EASYSLIP_API_KEY is not configured.");
    return {
      success: false,
      error: "ระบบตรวจสอบการชำระเงินไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",
    };
  }

  try {
    const response = await fetch(EASYSLIP_VERIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slipImageUrl: normalizedSlipUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn("[EASYSLIP] Slip verification was rejected.", {
        orderId: milestone.orderId,
        milestoneId: milestone.id,
        status: response.status,
      });
      return { success: false, error: SLIP_READ_ERROR };
    }

    const payload: unknown = await response.json();
    if (!isObject(payload) || isRejectedVerification(payload)) {
      console.warn("[EASYSLIP] Slip verification returned an invalid payload.", {
        orderId: milestone.orderId,
        milestoneId: milestone.id,
      });
      return { success: false, error: SLIP_READ_ERROR };
    }

    const slipData = getEasySlipData(payload);
    if (!slipData) {
      console.warn("[EASYSLIP] Required verification fields are missing.", {
        orderId: milestone.orderId,
        milestoneId: milestone.id,
      });
      return { success: false, error: SLIP_READ_ERROR };
    }

    const companyBankAccount = process.env.COMPANY_BANK_ACCOUNT?.trim();
    if (!companyBankAccount) {
      console.error("[PAYMENT] COMPANY_BANK_ACCOUNT is not configured.");
      return {
        success: false,
        error: "ระบบตรวจสอบบัญชีผู้รับไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",
      };
    }

    if (
      normalizeBankAccount(slipData.receiverAccount) !==
      normalizeBankAccount(companyBankAccount)
    ) {
      throw new PaymentValidationError("บัญชีผู้รับเงินไม่ตรงกับบัญชีบริษัท");
    }

    const paidAt = new Date();
    const transactionResult = await db.transaction(async (tx) => {
      const freshMilestone = await tx.query.paymentMilestones.findFirst({
        where: eq(paymentMilestones.id, normalizedMilestoneId),
        columns: {
          id: true,
          orderId: true,
          status: true,
          milestoneOrder: true,
          amount: true,
        },
        with: {
          order: {
            columns: {
              id: true,
              userId: true,
            },
          },
        },
      });

      if (!freshMilestone || freshMilestone.order.userId !== user.id) {
        throw new UnauthorizedError();
      }

      if (freshMilestone.status !== "ACTIVE") {
        throw new PaymentValidationError(
          "งวดชำระเงินนี้ไม่อยู่ในสถานะพร้อมชำระ",
        );
      }

      if (Math.abs(slipData.amount - Number(freshMilestone.amount)) > 0.01) {
        throw new PaymentValidationError("ยอดเงินไม่ตรงกับออเดอร์");
      }

      try {
        const [verifiedSlip] = await tx
          .insert(verifiedSlips)
          .values({
            orderId: freshMilestone.orderId,
            customerId: user.id,
            transRef: slipData.transRef,
            receiverAccount: slipData.receiverAccount,
            amount: slipData.amount.toFixed(2),
            slipImageUrl: normalizedSlipUrl,
            rawData: slipData.rawData,
            verifiedAt: paidAt,
          })
          .returning({ id: verifiedSlips.id });

        const [updatedMilestone] = await tx
          .update(paymentMilestones)
          .set({
            status: "PAID",
            paidAt,
            verifiedSlipId: verifiedSlip.id,
          })
          .where(
            and(
              eq(paymentMilestones.id, freshMilestone.id),
              eq(paymentMilestones.status, "ACTIVE"),
            ),
          )
          .returning({ id: paymentMilestones.id });

        if (!updatedMilestone) {
          throw new PaymentValidationError(
            "งวดชำระเงินนี้ไม่อยู่ในสถานะพร้อมชำระ",
          );
        }
      } catch (error) {
        if (getPostgresErrorCode(error) === "23505") {
          throw new PaymentValidationError(
            "สลิปนี้ถูกใช้งานในระบบไปแล้ว ห้ามใช้สลิปซ้ำ",
          );
        }
        throw error;
      }

      const nextMilestone = await tx.query.paymentMilestones.findFirst({
        where: and(
          eq(paymentMilestones.orderId, freshMilestone.orderId),
          eq(
            paymentMilestones.milestoneOrder,
            freshMilestone.milestoneOrder + 1,
          ),
        ),
        columns: {
          id: true,
          status: true,
        },
      });

      if (nextMilestone) {
        if (nextMilestone.status !== "PENDING") {
          throw new PaymentValidationError(
            "สถานะงวดชำระเงินถัดไปไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่",
          );
        }

        await tx
          .update(paymentMilestones)
          .set({
            status: "ACTIVE",
          })
          .where(
            and(
              eq(paymentMilestones.id, nextMilestone.id),
              eq(paymentMilestones.status, "PENDING"),
            ),
          );
      }

      const isFullyPaid = !nextMilestone;
      if (isFullyPaid) {
        await tx
          .update(proposals)
          .set({
            status: "FULLY_PAID",
            paidAt,
          })
          .where(
            and(
              eq(proposals.id, freshMilestone.orderId),
              eq(proposals.userId, user.id),
            ),
          );
      }

      return {
        orderId: freshMilestone.orderId,
        milestoneId: freshMilestone.id,
        isFullyPaid,
      };
    });

    after(async () => {
      await safeSyncMilestonePaymentToERP(
        transactionResult.milestoneId,
        slipData.transRef,
      );
    });

    return {
      success: true,
      orderId: transactionResult.orderId,
      milestoneId: transactionResult.milestoneId,
      transRef: slipData.transRef,
      paidAt,
      isFullyPaid: transactionResult.isFullyPaid,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    if (error instanceof PaymentValidationError) {
      return { success: false, error: error.message };
    }
    console.error("[EASYSLIP] Slip verification request failed.", {
      orderId: milestone.orderId,
      milestoneId: milestone.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: SLIP_READ_ERROR };
  }
}

export async function getPaymentMilestones(orderId: string) {
  try {
    const user = await getAuthenticatedUser();
    const normalizedOrderId = orderId.trim();

    // 1. Fetch proposal/order
    const order = await db.query.proposals.findFirst({
      where: eq(proposals.id, normalizedOrderId),
      columns: {
        id: true,
        userId: true,
        totalPrice: true,
        status: true,
        fulfillmentType: true,
        configurationData: true,
        systemSizeKwp: true,
        panelCount: true,
      },
    });

    if (!order) {
      return { success: false, error: "ไม่พบข้อมูลออเดอร์" };
    }

    // Verify ownership
    const actor = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { role: true },
    });
    const isStaff = actor
      ? ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(actor.role)
      : false;

    if (order.userId !== user.id && !isStaff) {
      throw new UnauthorizedError();
    }

    // 2. Fetch milestones
    let milestones = await db.query.paymentMilestones.findMany({
      where: eq(paymentMilestones.orderId, order.id),
      orderBy: (m, { asc }) => [asc(m.milestoneOrder)],
      with: {
        verifiedSlip: true,
      },
    });

    if (milestones.length === 0) {
      const genRes = await generateOrderMilestones(order.id, Number(order.totalPrice));
      if (!genRes.success) {
        return { success: false, error: genRes.error };
      }
      // Re-fetch milestones
      milestones = await db.query.paymentMilestones.findMany({
        where: eq(paymentMilestones.orderId, order.id),
        orderBy: (m, { asc }) => [asc(m.milestoneOrder)],
        with: {
          verifiedSlip: true,
        },
      });
    }

    return { success: true, milestones, order };
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    console.error("[PAYMENT] getPaymentMilestones failed:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการดึงข้อมูลแผนชำระเงิน",
    };
  }
}

/**
 * Process verified bank payment slip (EasySlip v2 + Google Drive storage)
 */
export async function processPaymentSlip(transactionId: string, formData: FormData) {
  try {
    const user = await getAuthenticatedUser();
    const normalizedTransactionId = transactionId.trim();

    if (!normalizedTransactionId) {
      return { success: false, error: "รหัสธุรกรรม/งวดชำระเงินไม่ถูกต้อง" };
    }

    const file = (formData.get("file") || formData.get("slip") || formData.get("image")) as File | null;
    if (!file) {
      return { success: false, error: "ไม่พบไฟล์สลิป" };
    }

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: PAYMENT_SLIP_FILE_KINDS,
      fallbackName: "payment-slip",
      maxBytes: MAX_PAYMENT_SLIP_BYTES,
    });

    // Fetch the payment milestone (acting as the transaction)
    const milestone = await db.query.paymentMilestones.findFirst({
      where: eq(paymentMilestones.id, normalizedTransactionId),
      with: {
        order: {
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

    if (!milestone) {
      return { success: false, error: "ไม่พบงวดชำระเงินนี้ในระบบ" };
    }

    const order = milestone.order;
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
        throw new UnauthorizedError();
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
      console.error("[processPaymentSlip] Temporary slip upload failed:", uploadError.message);
      throw new Error("Temporary slip upload failed.");
    }

    const { data: { publicUrl } } = supabase.storage
      .from("proposals")
      .getPublicUrl(tempFileName);

    // STEP A: Verification (EasySlip v2)
    let transRef = "";
    let receiverAccount = "";
    let actualAmount = Number(milestone.amount);
    let resData: Record<string, unknown> = {};
    let warningMsg: string | null = null;

    const apiKey = process.env.EASYSLIP_API_KEY?.trim();
    if (!apiKey) {
      throw new PaymentValidationError(
        "ระบบตรวจสอบสลิปอัตโนมัติยังไม่ได้ตั้งค่า กรุณาใช้คำขอชำระเงินในหน้า Quotation CRM เพื่อให้ทีมงานตรวจสอบสลิปด้วยตนเอง"
      );
    } else {
      try {
        const verifyResponse = await fetch("https://api.easyslip.com/v2/verify/bank", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: publicUrl,
          }),
          cache: "no-store",
        });

        if (!verifyResponse.ok) {
          throw new Error("ไม่สามารถเชื่อมต่อระบบตรวจสอบสลิปได้ หรือข้อมูลรูปภาพไม่ถูกต้อง");
        }

        const payload = await verifyResponse.json();
        if (payload.success === false || payload.valid === false) {
          throw new Error(payload.error || "สลิปนี้ไม่ถูกต้องหรือไม่สามารถระบุข้อมูลได้");
        }

        const rawSlip = payload.data?.rawSlip;
        if (!rawSlip) {
          throw new Error("โครงสร้างข้อมูลสลิปไม่ถูกต้อง");
        }

        // Validate amount matches transaction.amount
        const expectedAmount = Number(milestone.amount);
        const slipAmount = Number(rawSlip.amount?.amount);
        if (Math.abs(expectedAmount - slipAmount) > 0.01) {
          throw new Error(`ยอดเงินในสลิป (${slipAmount}) ไม่ตรงกับยอดค้างชำระ (${expectedAmount})`);
        }

        // Check transRef for idempotency (prevent reusing the same slip)
        const slipTransRef = rawSlip.transRef;
        if (!slipTransRef) {
          throw new Error("ไม่พบรหัสธุรกรรม (transRef) ในสลิป");
        }

        const existingSlip = await db.query.verifiedSlips.findFirst({
          where: eq(verifiedSlips.transRef, slipTransRef),
        });
        if (existingSlip) {
          throw new Error("สลิปนี้ถูกใช้งานไปแล้วในระบบ ห้ามใช้สลิปซ้ำ");
        }

        // Validate receiver matches company bank account
        const companyBankAccount = process.env.COMPANY_BANK_ACCOUNT?.trim();
        const slipReceiverAccount = rawSlip.receiver?.account;
        if (companyBankAccount && slipReceiverAccount) {
          if (normalizeBankAccount(slipReceiverAccount) !== normalizeBankAccount(companyBankAccount)) {
            throw new Error("บัญชีผู้รับเงินไม่ตรงกับบัญชีของทางบริษัท");
          }
        }

        // Verification succeeded
        transRef = slipTransRef;
        receiverAccount = slipReceiverAccount || "";
        actualAmount = slipAmount;
        resData = payload;
      } catch (verifyError: unknown) {
        console.warn("[PAYMENT VERIFICATION] EasySlip validation failed.", verifyError);
        throw verifyError instanceof Error
          ? verifyError
          : new PaymentValidationError("ไม่สามารถตรวจสอบสลิปได้");
      }
    }

    // STEP B: Storage (Google Drive)
    const customerName = order.user?.name || order.user?.email?.split("@")[0] || "Customer";
    const bytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(bytes);

    let drivePreviewUrl = publicUrl; // Fallback to Supabase publicUrl
    try {
      const customerFolderId = await getOrCreateCustomerFolder(customerName, order.userId);
      const proposalFolderId = await getOrCreateProposalFolder(customerFolderId, order.id);

      // Pick subfolder name based on fulfillment type
      const subfolderName = order.fulfillmentType === "SUPPLY_ONLY" ? "Supply_Only_Payments" : "Installation_Project_Payments";
      const destinationFolderId = await getOrCreateSubfolder(proposalFolderId, subfolderName);

      const googleDriveFilename = `Slip_${order.id}_${normalizedTransactionId}.${validatedFile.extension}`;
      
      drivePreviewUrl = await uploadFileToDrive(
        destinationFolderId,
        fileBuffer,
        validatedFile.contentType,
        googleDriveFilename
      );
    } catch (driveError: unknown) {
      console.warn("[Google Drive] Setup missing or upload failed. Skipping drive storage and using Supabase preview url instead.", driveError);
      warningMsg = "ข้ามขั้นตอนการอัปโหลดไฟล์สลิปไปยัง Google Drive เนื่องจากเกิดข้อผิดพลาดหรือไม่ได้ตั้งค่าระบบ Cloud";
    }

    // STEP C: Finalize
    const paidAt = new Date();
    const transactionResult = await db.transaction(async (tx) => {
      // Create verified slips record
      const [verifiedSlip] = await tx
        .insert(verifiedSlips)
        .values({
          orderId: order.id,
          customerId: order.userId,
          transRef,
          receiverAccount: receiverAccount || "",
          amount: actualAmount.toFixed(2),
          slipImageUrl: drivePreviewUrl,
          rawData: resData.data,
          verifiedAt: paidAt,
        })
        .returning({ id: verifiedSlips.id });

      // Update milestone status to PAID
      await tx
        .update(paymentMilestones)
        .set({
          status: "PAID",
          paidAt,
          verifiedSlipId: verifiedSlip.id,
        })
        .where(eq(paymentMilestones.id, milestone.id));

      // Get next milestone if any
      const nextMilestone = await tx.query.paymentMilestones.findFirst({
        where: and(
          eq(paymentMilestones.orderId, order.id),
          eq(paymentMilestones.milestoneOrder, milestone.milestoneOrder + 1)
        ),
      });

      if (nextMilestone) {
        await tx
          .update(paymentMilestones)
          .set({ status: "ACTIVE" })
          .where(eq(paymentMilestones.id, nextMilestone.id));
      }

      // Update proposal status based on fulfillment type and completeness
      const isFullyPaid = !nextMilestone;
      let nextProposalStatus = order.status;

      if (isFullyPaid) {
        nextProposalStatus = "FULLY_PAID";
      } else {
        // If first deposit of project is paid, update status/project status
        if (order.fulfillmentType === "INSTALLATION" && milestone.milestoneOrder === 1) {
          nextProposalStatus = "INSTALLING";
        }
      }

      await tx
        .update(proposals)
        .set({
          status: nextProposalStatus,
          ...(isFullyPaid ? { paidAt } : {}),
        })
        .where(eq(proposals.id, order.id));

      return {
        isFullyPaid,
        verifiedSlipId: verifiedSlip.id,
      };
    });

    // Run clean up and sync in background
    after(async () => {
      try {
        await supabase.storage.from("proposals").remove([tempFileName]);
      } catch (err) {
        console.warn("Failed to remove temporary Supabase slip file:", err);
      }

      await safeSyncMilestonePaymentToERP(
        milestone.id,
        transRef
      );
    });

    return {
      success: true,
      orderId: order.id,
      milestoneId: milestone.id,
      transRef,
      paidAt,
      isFullyPaid: transactionResult.isFullyPaid,
      drivePreviewUrl,
      warning: warningMsg || undefined,
    };

  } catch (error: unknown) {
    console.error("[processPaymentSlip] Error:", error);
    if (error instanceof PaymentValidationError) {
      return {
        success: false,
        error: error.message,
      };
    }
    return {
      success: false,
      error: "เกิดข้อผิดพลาดในการประมวลผลสลิป",
    };
  }
}

export async function simulateMilestonePayment(
  milestoneId: string,
  locale = "th",
) {
  try {
    const actor = await requireStaff();
    const normalizedMilestoneId = milestoneId.trim();

    if (!normalizedMilestoneId) {
      return { success: false as const, error: "ไม่พบรหัสงวดชำระเงิน" };
    }

    const result = await db.transaction(async (tx) => {
      // Find milestone
      const milestone = await tx.query.paymentMilestones.findFirst({
        where: eq(paymentMilestones.id, normalizedMilestoneId),
        with: {
          order: {
            with: {
              user: true,
            },
          },
        },
      });

      if (!milestone) {
        return { success: false as const, error: "ไม่พบงวดชำระเงินนี้" };
      }

      if (milestone.status === "PAID") {
        return {
          success: true as const,
          alreadyPaid: true,
          orderId: milestone.orderId,
        };
      }

      const now = new Date();
      const transRef = `SIM-${Math.random()
        .toString(36)
        .substring(2, 12)
        .toUpperCase()}`;

      // Insert mock verified slip
      const [verifiedSlip] = await tx
        .insert(verifiedSlips)
        .values({
          orderId: milestone.orderId,
          customerId: milestone.order.userId,
          transRef,
          receiverAccount: "SIMULATED_ACC",
          amount: milestone.amount,
          slipImageUrl: "https://placehold.co/600x400?text=Simulated+Payment",
          rawData: { simulated: true, adminSimulator: actor.email },
          verifiedAt: now,
        })
        .returning({ id: verifiedSlips.id });

      // Update milestone
      await tx
        .update(paymentMilestones)
        .set({
          status: "PAID",
          paidAt: now,
          verifiedSlipId: verifiedSlip.id,
        })
        .where(eq(paymentMilestones.id, milestone.id));

      // Create mockup PAID transaction
      await tx
        .insert(paymentTransactions)
        .values({
          proposalId: milestone.orderId,
          amount: milestone.amount,
          milestoneIndex: milestone.milestoneOrder,
          qrString: "SIMULATED_TEST_QR_STRING",
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          status: "PAID",
          easyslipData: {
            simulated: true,
            verifiedAt: now.toISOString(),
            adminSimulator: actor.email,
            sender: {
              account: {
                name: {
                  th: "ผู้ทดสอบระบบชำระเงิน (Admin Simulator)",
                  en: "Payment System Tester (Admin Simulator)",
                },
              },
              bank: {
                short: "SIM",
              },
            },
            transRef,
          },
        });

      // Find and activate next milestone
      const nextMilestone = await tx.query.paymentMilestones.findFirst({
        where: and(
          eq(paymentMilestones.orderId, milestone.orderId),
          eq(
            paymentMilestones.milestoneOrder,
            milestone.milestoneOrder + 1,
          ),
        ),
      });

      if (nextMilestone && nextMilestone.status === "PENDING") {
        await tx
          .update(paymentMilestones)
          .set({ status: "ACTIVE" })
          .where(eq(paymentMilestones.id, nextMilestone.id));
      }

      // Update order status if fully paid or progress to next step
      const isFullyPaid = !nextMilestone;
      let nextProposalStatus = milestone.order.status;

      if (isFullyPaid) {
        nextProposalStatus = "FULLY_PAID";
      } else {
        if (
          milestone.order.fulfillmentType === "INSTALLATION" &&
          milestone.milestoneOrder === 1
        ) {
          nextProposalStatus = "INSTALLING";
        }
      }

      await tx
        .update(proposals)
        .set({
          status: nextProposalStatus,
          ...(isFullyPaid ? { paidAt: now } : {}),
        })
        .where(eq(proposals.id, milestone.orderId));

      // Insert log
      await tx.insert(activityLogs).values({
        entityId: milestone.id,
        entityType: "PAYMENT_MILESTONE",
        action: "MANUAL_SIMULATED_PAYMENT",
        description: `Admin ${actor.name || actor.email} simulated payment for milestone ${milestone.milestoneOrder} (${milestone.milestoneName}) on order ${milestone.orderId}.`,
        userId: actor.id,
      });

      return {
        success: true as const,
        orderId: milestone.orderId,
        alreadyPaid: false,
      };
    });

    if (result.success) {
      revalidatePath(`/${locale}/admin/orders/${result.orderId}`);
    }

    return result;
  } catch (error: unknown) {
    console.error("[PAYMENT SIMULATOR] Simulated payment failed.", {
      milestoneId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      success: false as const,
      error: "ไม่สามารถทำรายการจำลองการชำระเงินได้",
    };
  }
}

export async function verifySlipPaymentAsAdmin(
  milestoneId: string,
  slipImageUrl: string,
  locale = "th",
): Promise<VerifySlipPaymentAsAdminResult> {
  const actor = await requireStaff();
  const normalizedMilestoneId = milestoneId.trim();
  const normalizedSlipUrl = slipImageUrl.trim();

  if (!normalizedMilestoneId || !isSecureSlipUrl(normalizedSlipUrl)) {
    return { success: false, error: SLIP_READ_ERROR };
  }

  const milestone = await db.query.paymentMilestones.findFirst({
    where: eq(paymentMilestones.id, normalizedMilestoneId),
    columns: {
      id: true,
      orderId: true,
      status: true,
      milestoneOrder: true,
      amount: true,
    },
    with: {
      order: {
        columns: {
          id: true,
          userId: true,
          status: true,
          fulfillmentType: true,
        },
      },
    },
  });

  if (!milestone) {
    return { success: false, error: "ไม่พบงวดงานชำระเงินนี้" };
  }

  if (milestone.status === "PAID") {
    return {
      success: false,
      error: "งวดชำระเงินนี้ชำระเงินเรียบร้อยแล้ว",
    };
  }

  const apiKey = process.env.EASYSLIP_API_KEY;
  if (!apiKey) {
    console.error("[EASYSLIP Sandbox] EASYSLIP_API_KEY is not configured.");
    return {
      success: false,
      error: "ระบบตรวจสอบการชำระเงิน (EasySlip API) ไม่พร้อมใช้งาน",
    };
  }

  try {
    const response = await fetch(EASYSLIP_VERIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slipImageUrl: normalizedSlipUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn("[EASYSLIP Sandbox] Slip verification was rejected.", {
        orderId: milestone.orderId,
        milestoneId: milestone.id,
        status: response.status,
      });
      return { success: false, error: SLIP_READ_ERROR };
    }

    const payload: unknown = await response.json();
    if (!isObject(payload) || isRejectedVerification(payload)) {
      console.warn("[EASYSLIP Sandbox] Slip verification returned an invalid payload.", {
        orderId: milestone.orderId,
        milestoneId: milestone.id,
      });
      return { success: false, error: SLIP_READ_ERROR };
    }

    const slipData = getEasySlipData(payload);
    if (!slipData) {
      console.warn("[EASYSLIP Sandbox] Required verification fields are missing.", {
        orderId: milestone.orderId,
        milestoneId: milestone.id,
      });
      return { success: false, error: SLIP_READ_ERROR };
    }

    const companyBankAccount = process.env.COMPANY_BANK_ACCOUNT?.trim();
    if (!companyBankAccount) {
      console.error("[PAYMENT Sandbox] COMPANY_BANK_ACCOUNT is not configured.");
      return {
        success: false,
        error: "ระบบตรวจสอบบัญชีผู้รับไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",
      };
    }

    if (
      normalizeBankAccount(slipData.receiverAccount) !==
      normalizeBankAccount(companyBankAccount)
    ) {
      throw new PaymentValidationError("บัญชีผู้รับเงินไม่ตรงกับบัญชีบริษัท");
    }

    const paidAt = new Date();
    const transactionResult = await db.transaction(async (tx) => {
      const freshMilestone = await tx.query.paymentMilestones.findFirst({
        where: eq(paymentMilestones.id, normalizedMilestoneId),
        columns: {
          id: true,
          orderId: true,
          status: true,
          milestoneOrder: true,
          amount: true,
        },
        with: {
          order: {
            columns: {
              id: true,
              userId: true,
              status: true,
              fulfillmentType: true,
            },
          },
        },
      });

      if (!freshMilestone) {
        throw new PaymentValidationError("ไม่พบงวดงานชำระเงินนี้");
      }

      if (Math.abs(slipData.amount - Number(freshMilestone.amount)) > 0.01) {
        throw new PaymentValidationError(
          `ยอดเงินไม่ตรงกับออเดอร์ (สลิป: ${slipData.amount} THB, ออเดอร์: ${Number(freshMilestone.amount)} THB)`
        );
      }

      try {
        const [verifiedSlip] = await tx
          .insert(verifiedSlips)
          .values({
            orderId: freshMilestone.orderId,
            customerId: freshMilestone.order.userId,
            transRef: slipData.transRef,
            receiverAccount: slipData.receiverAccount,
            amount: slipData.amount.toFixed(2),
            slipImageUrl: normalizedSlipUrl,
            rawData: slipData.rawData,
            verifiedAt: paidAt,
          })
          .returning({ id: verifiedSlips.id });

        await tx
          .update(paymentMilestones)
          .set({
            status: "PAID",
            paidAt,
            verifiedSlipId: verifiedSlip.id,
          })
          .where(eq(paymentMilestones.id, freshMilestone.id));

        // Create mockup transaction matching the real verify output
        await tx
          .insert(paymentTransactions)
          .values({
            proposalId: freshMilestone.orderId,
            amount: freshMilestone.amount,
            milestoneIndex: freshMilestone.milestoneOrder,
            qrString: "EASYSLIP_LIVE_TEST_QR_STRING",
            expiresAt: new Date(paidAt.getTime() + 24 * 60 * 60 * 1000),
            status: "PAID",
            easyslipData: slipData.rawData,
          });

      } catch (error) {
        if (getPostgresErrorCode(error) === "23505") {
          throw new PaymentValidationError(
            "สลิปนี้ถูกใช้งานในระบบไปแล้ว ห้ามใช้สลิปซ้ำ"
          );
        }
        throw error;
      }

      const nextMilestone = await tx.query.paymentMilestones.findFirst({
        where: and(
          eq(paymentMilestones.orderId, freshMilestone.orderId),
          eq(
            paymentMilestones.milestoneOrder,
            freshMilestone.milestoneOrder + 1,
          ),
        ),
        columns: {
          id: true,
          status: true,
        },
      });

      if (nextMilestone) {
        await tx
          .update(paymentMilestones)
          .set({
            status: "ACTIVE",
          })
          .where(
            and(
              eq(paymentMilestones.id, nextMilestone.id),
              eq(paymentMilestones.status, "PENDING"),
            ),
          );
      }

      const isFullyPaid = !nextMilestone;
      let nextProposalStatus = freshMilestone.order.status;

      if (isFullyPaid) {
        nextProposalStatus = "FULLY_PAID";
      } else {
        if (
          freshMilestone.order.fulfillmentType === "INSTALLATION" &&
          freshMilestone.milestoneOrder === 1
        ) {
          nextProposalStatus = "INSTALLING";
        }
      }

      await tx
        .update(proposals)
        .set({
          status: nextProposalStatus,
          ...(isFullyPaid ? { paidAt } : {}),
        })
        .where(eq(proposals.id, freshMilestone.orderId));

      await tx.insert(activityLogs).values({
        entityId: freshMilestone.id,
        entityType: "PAYMENT_MILESTONE",
        action: "LIVE_SANDBOX_EASYSLIP_VERIFIED",
        description: `Admin ${actor.name || actor.email} verified live payment slip via EasySlip for milestone ${freshMilestone.milestoneOrder} on order ${freshMilestone.orderId}.`,
        userId: actor.id,
      });

      return {
        orderId: freshMilestone.orderId,
        milestoneId: freshMilestone.id,
        isFullyPaid,
      };
    });

    after(async () => {
      await safeSyncMilestonePaymentToERP(
        transactionResult.milestoneId,
        slipData.transRef,
      );
    });

    revalidatePath(`/${locale}/admin/orders/${transactionResult.orderId}`);
    revalidatePath(`/${locale}/admin/settings/sandbox`);

    return {
      success: true,
      orderId: transactionResult.orderId,
      milestoneId: transactionResult.milestoneId,
      transRef: slipData.transRef,
      paidAt,
      isFullyPaid: transactionResult.isFullyPaid,
      data: payload,
    };
  } catch (error) {
    console.error("[PAYMENT Sandbox] Live EasySlip verification failed.", {
      milestoneId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (error instanceof PaymentValidationError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: "เกิดข้อผิดพลาดในการตรวจสอบสลิป",
    };
  }
}
