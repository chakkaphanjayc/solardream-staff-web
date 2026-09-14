import { db } from "@/db";
import {
  installationJobTickets,
  invoices,
  paymentMilestones,
  proposals,
} from "@/db/schema";
import { buildErpnextBomItems } from "@/lib/erpnextBom";
import { getOrCreateErpnextCustomerForUser } from "@/lib/erpnext";
import { erpNextGateway } from "@/server/services/integrations/erpnext-gateway";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getCatalogProductsByIds } from "@/lib/erpnextCatalog";

type ErpRecord = Record<string, unknown>;
type InvoiceAccountingTreatment = "SUPPLY_ONLY" | "INSTALLATION";

const ECOMMERCE_INCOME_ACCOUNT =
  "4111-01 - รายได้จากการขายวัสดุอุปกรณ์ (E-commerce)";
const PROJECT_INCOME_ACCOUNT =
  "4111-02 - รายได้จากการรับเหมาติดตั้งระบบโซลาร์";
const DEFAULT_PAYMENT_MODE = "Bank Transfer";
const frappeRequest = erpNextGateway.compatibilityRequest.bind(erpNextGateway);

function isRecord(value: unknown): value is ErpRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getRecordName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : null;
}

function getConfigRecord(value: unknown): ErpRecord {
  return isRecord(value) ? value : {};
}

function getNestedRecord(value: unknown, key: string): ErpRecord {
  const record = getConfigRecord(value);
  return getConfigRecord(record[key]);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

type ExistingErpDocument = {
  name: string;
  docstatus: number;
};

async function findExistingPaymentEntry(transRef: string) {
  const fields = encodeURIComponent(JSON.stringify(["name", "docstatus"]));
  const filters = encodeURIComponent(
    JSON.stringify([
      ["Payment Entry", "reference_no", "=", transRef],
      ["Payment Entry", "docstatus", "!=", 2],
    ]),
  );
  const result = await frappeRequest(
    "GET",
    `/api/resource/Payment%20Entry?fields=${fields}&filters=${filters}&limit_page_length=1`,
  );
  const rows = Array.isArray(result.data) ? result.data : [];
  const row = isRecord(rows[0]) ? rows[0] : null;
  const name = getRecordName(row);
  return name
    ? {
        name,
        docstatus: Number(row?.docstatus ?? 0),
      }
    : null;
}

async function findRemoteSalesInvoice(
  orderId: string,
): Promise<ExistingErpDocument | null> {
  const fields = encodeURIComponent(JSON.stringify(["name", "docstatus"]));
  const filters = encodeURIComponent(
    JSON.stringify([
      ["Sales Invoice", "remarks", "=", `SolarDream Order: ${orderId}`],
      ["Sales Invoice", "docstatus", "!=", 2],
    ]),
  );
  const result = await frappeRequest(
    "GET",
    `/api/resource/Sales%20Invoice?fields=${fields}&filters=${filters}&limit_page_length=1`,
  );
  const rows = Array.isArray(result.data) ? result.data : [];
  const row = isRecord(rows[0]) ? rows[0] : null;
  const name = getRecordName(row);
  return name
    ? {
        name,
        docstatus: Number(row?.docstatus ?? 0),
      }
    : null;
}

async function findLocalSalesInvoice(orderId: string) {
  const jobTicket = await db.query.installationJobTickets.findFirst({
    where: eq(installationJobTickets.quotationId, orderId),
    columns: { id: true },
  });

  if (!jobTicket) return null;

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.jobTicketId, jobTicket.id),
    columns: { erpnextInvoiceId: true },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  return invoice?.erpnextInvoiceId || null;
}

async function submitErpDocument(
  doctype: "Sales Invoice" | "Payment Entry",
  document: ErpRecord,
) {
  const createResult = await frappeRequest(
    "POST",
    `/api/resource/${encodeURIComponent(doctype)}`,
    {
      data: document,
    },
  );
  const name = getRecordName(createResult.data);
  if (!name) {
    throw new Error(`ERPNext did not return a ${doctype} ID.`);
  }

  await submitExistingErpDocument(doctype, name);
  return name;
}

async function submitExistingErpDocument(
  doctype: "Sales Invoice" | "Payment Entry",
  name: string,
) {
  await frappeRequest(
    "PUT",
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    {
      data: {
        docstatus: 1,
      },
    },
  );
}

async function ensureSalesInvoiceReady(name: string, expectedTotal: number) {
  const result = await frappeRequest(
    "GET",
    `/api/resource/Sales%20Invoice/${encodeURIComponent(name)}`,
  );
  const invoice = isRecord(result.data) ? result.data : null;
  if (!invoice) {
    throw new Error(`ERPNext Sales Invoice ${name} was not found.`);
  }

  const grandTotal = Number(invoice.grand_total);
  if (
    !Number.isFinite(grandTotal) ||
    Math.abs(grandTotal - expectedTotal) > 0.01
  ) {
    throw new Error(
      `ERPNext Sales Invoice ${name} total does not match order total.`,
    );
  }

  if (Number(invoice.docstatus ?? 0) === 0) {
    await submitExistingErpDocument("Sales Invoice", name);
  }
  return name;
}

async function createFullSalesInvoice(order: {
  id: string;
  userId: string;
  totalPrice: number;
  fulfillmentType: InvoiceAccountingTreatment;
  configurationData: unknown;
  erpnextCustomerId: string | null;
}) {
  const customerId =
    order.erpnextCustomerId ||
    (await getOrCreateErpnextCustomerForUser(
      order.userId,
      order.configurationData,
    ));
  const company = process.env.ERPNEXT_COMPANY_NAME?.trim();
  if (!company) {
    throw new Error("ERPNEXT_COMPANY_NAME is required for Sales Invoice sync.");
  }

  const warehouse =
    process.env.ERPNEXT_SALES_WAREHOUSE?.trim() ||
    "Finished Goods - Store A";
  const isSupplyOnly = order.fulfillmentType === "SUPPLY_ONLY";
  const incomeAccount = isSupplyOnly
    ? ECOMMERCE_INCOME_ACCOUNT
    : PROJECT_INCOME_ACCOUNT;
  const paymentTermsTemplate =
    process.env.ERPNEXT_PAYMENT_TERMS_TEMPLATE?.trim();
  const configurationItems = getConfigRecord(order.configurationData).items;
  const productIds = Array.isArray(configurationItems)
    ? configurationItems.flatMap((item) => {
        if (!isRecord(item) || typeof item.productId !== "string") return [];
        const productId = item.productId.trim();
        return productId ? [productId] : [];
      })
    : [];
  const productRows = productIds.length ? await getCatalogProductsByIds(productIds) : [];
  const productsById = new Map(
    productRows.map((product) => [product.id, product]),
  );
  const invoiceItems = isSupplyOnly
    ? buildErpnextBomItems(
        { items: configurationItems },
        productsById,
      ).map((item) => ({
        item_code: item.item_code,
        item_name: item.item_name,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
        description: item.description,
        warehouse,
        income_account: incomeAccount,
      }))
    : [
        {
          item_code:
            process.env.ERPNEXT_PROJECT_REVENUE_ITEM_CODE?.trim() ||
            "SOLAR-INSTALLATION-PROJECT",
          item_name: "Solar installation project",
          qty: 1,
          rate: Number(order.totalPrice),
          amount: Number(order.totalPrice),
          description: `Completed SolarDream installation project ${order.id}`,
          income_account: incomeAccount,
        },
      ];

  if (invoiceItems.length === 0) {
    const itemCode =
      process.env.ERPNEXT_DEFAULT_SALES_ITEM_CODE?.trim() || "SOLAR-GENERIC";
    invoiceItems.push({
      item_code: itemCode,
      item_name: "Solar equipment order",
      qty: 1,
      rate: Number(order.totalPrice),
      amount: Number(order.totalPrice),
      description: `SolarDream supply order ${order.id}`,
      warehouse,
      income_account: incomeAccount,
    });
  }

  const invoiceId = await submitErpDocument("Sales Invoice", {
    customer: customerId,
    company,
    posting_date: today(),
    due_date: today(),
    currency: "THB",
    update_stock: isSupplyOnly ? 1 : 0,
    ...(isSupplyOnly ? { set_warehouse: warehouse } : {}),
    ...(paymentTermsTemplate
      ? { payment_terms_template: paymentTermsTemplate }
      : {}),
    remarks: `SolarDream Order: ${order.id}`,
    items: invoiceItems,
  });

  await db
    .update(proposals)
    .set({
      erpnextCustomerId: customerId,
      configurationData: {
        ...getConfigRecord(order.configurationData),
        erpPaymentSync: {
          ...getNestedRecord(order.configurationData, "erpPaymentSync"),
          salesInvoiceId: invoiceId,
          invoiceAmount: Number(order.totalPrice),
          invoiceSyncedAt: new Date().toISOString(),
        },
      },
    })
    .where(eq(proposals.id, order.id));

  return invoiceId;
}

async function resolveSalesInvoice(order: {
  id: string;
  userId: string;
  totalPrice: number;
  fulfillmentType: InvoiceAccountingTreatment;
  configurationData: unknown;
  erpnextCustomerId: string | null;
}) {
  const syncConfig = getNestedRecord(order.configurationData, "erpPaymentSync");
  const configuredId =
    typeof syncConfig.salesInvoiceId === "string"
      ? syncConfig.salesInvoiceId.trim()
      : "";
  if (configuredId) {
    return ensureSalesInvoiceReady(configuredId, Number(order.totalPrice));
  }

  const localInvoiceId = await findLocalSalesInvoice(order.id);
  if (localInvoiceId) {
    return ensureSalesInvoiceReady(localInvoiceId, Number(order.totalPrice));
  }

  const remoteInvoice = await findRemoteSalesInvoice(order.id);
  if (remoteInvoice) {
    return ensureSalesInvoiceReady(
      remoteInvoice.name,
      Number(order.totalPrice),
    );
  }

  return createFullSalesInvoice(order);
}

async function getPaymentEntryDraft(
  salesInvoiceId: string,
  amount: number,
) {
  const body: ErpRecord = {
    dt: "Sales Invoice",
    dn: salesInvoiceId,
    party_amount: amount,
  };
  const bankAccount = process.env.ERPNEXT_BANK_ACCOUNT?.trim();
  if (bankAccount) body.bank_account = bankAccount;

  const result = await frappeRequest(
    "POST",
    "/api/method/erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
    body,
  );
  const message = isRecord(result.data) ? result.data.message : null;
  if (!isRecord(message)) {
    throw new Error("ERPNext did not return a Payment Entry draft.");
  }
  return message;
}

async function createAdvancePaymentEntry(input: {
  customerId: string;
  amount: number;
  transRef: string;
  milestoneName: string;
}) {
  const company = process.env.ERPNEXT_COMPANY_NAME?.trim();
  const advanceAccount =
    process.env.ERPNEXT_CUSTOMER_ADVANCE_ACCOUNT?.trim();
  const bankGlAccount =
    process.env.ERPNEXT_BANK_GL_ACCOUNT?.trim();
  const modeOfPayment =
    process.env.ERPNEXT_PAYMENT_MODE_OF_PAYMENT?.trim() || DEFAULT_PAYMENT_MODE;

  if (!company || !advanceAccount || !bankGlAccount) {
    throw new Error(
      "ERPNEXT_COMPANY_NAME, ERPNEXT_CUSTOMER_ADVANCE_ACCOUNT and ERPNEXT_BANK_GL_ACCOUNT are required for advance payment sync.",
    );
  }

  const remarks = `[Receive Advance] [Milestone Payment] Received Payment for Stage: ${input.milestoneName}`;
  return submitErpDocument("Payment Entry", {
    payment_type: "Receive",
    company,
    posting_date: today(),
    party_type: "Customer",
    party: input.customerId,
    paid_from: advanceAccount,
    paid_to: bankGlAccount,
    mode_of_payment: modeOfPayment,
    paid_amount: input.amount,
    received_amount: input.amount,
    source_exchange_rate: 1,
    target_exchange_rate: 1,
    reference_no: input.transRef,
    reference_date: today(),
    remarks,
    custom_remarks: 1,
    book_advance_payments_in_separate_party_account: 1,
    references: [],
  });
}

async function runPaymentReconciliationMethod(
  document: ErpRecord,
  method: "get_unreconciled_entries" | "allocate_entries" | "reconcile",
  args: ErpRecord = {},
) {
  const result = await frappeRequest("POST", "/api/method/run_doc_method", {
    docs: JSON.stringify(document),
    method,
    args: JSON.stringify(args),
  });
  const response = isRecord(result.data) ? result.data : {};
  const docs = Array.isArray(response.docs) ? response.docs : [];
  const updatedDocument = docs.find(isRecord);
  if (!updatedDocument) {
    throw new Error(
      `ERPNext Payment Reconciliation did not return a document after ${method}.`,
    );
  }
  return updatedDocument;
}

async function reconcileAdvancePayment(input: {
  company: string;
  customerId: string;
  receivableAccount: string;
  advanceAccount: string;
  paymentEntryId: string;
  salesInvoiceId: string;
}) {
  let reconciliation: ErpRecord = {
    doctype: "Payment Reconciliation",
    modified: null,
    company: input.company,
    party_type: "Customer",
    party: input.customerId,
    receivable_payable_account: input.receivableAccount,
    default_advance_account: input.advanceAccount,
    payment_name: input.paymentEntryId,
    invoice_name: input.salesInvoiceId,
    invoice_limit: 1,
    payment_limit: 1,
  };

  reconciliation = await runPaymentReconciliationMethod(
    reconciliation,
    "get_unreconciled_entries",
  );
  const payments = Array.isArray(reconciliation.payments)
    ? reconciliation.payments.filter(isRecord)
    : [];
  const invoices = Array.isArray(reconciliation.invoices)
    ? reconciliation.invoices.filter(isRecord)
    : [];
  const payment = payments.find(
    (row) => row.reference_name === input.paymentEntryId,
  );
  const invoice = invoices.find(
    (row) => row.invoice_number === input.salesInvoiceId,
  );

  if (!payment || !invoice) {
    throw new Error(
      `ERPNext could not find advance ${input.paymentEntryId} or invoice ${input.salesInvoiceId} for reconciliation.`,
    );
  }

  reconciliation = await runPaymentReconciliationMethod(
    reconciliation,
    "allocate_entries",
    {
      payments: [payment],
      invoices: [invoice],
    },
  );
  const allocations = Array.isArray(reconciliation.allocation)
    ? reconciliation.allocation
    : [];
  if (allocations.length === 0) {
    throw new Error(
      `ERPNext did not allocate advance ${input.paymentEntryId} to invoice ${input.salesInvoiceId}.`,
    );
  }

  await runPaymentReconciliationMethod(reconciliation, "reconcile");
}

async function getInvoiceOutstandingAmount(salesInvoiceId: string) {
  const result = await frappeRequest(
    "GET",
    `/api/resource/Sales%20Invoice/${encodeURIComponent(salesInvoiceId)}`,
  );
  const invoice = isRecord(result.data) ? result.data : null;
  const outstandingAmount = Number(invoice?.outstanding_amount);
  if (!Number.isFinite(outstandingAmount)) {
    throw new Error(
      `ERPNext Sales Invoice ${salesInvoiceId} has an invalid outstanding amount.`,
    );
  }
  return outstandingAmount;
}

async function ensureInvoiceHasZeroOutstanding(salesInvoiceId: string) {
  const outstandingAmount =
    await getInvoiceOutstandingAmount(salesInvoiceId);
  if (Math.abs(outstandingAmount) > 0.01) {
    throw new Error(
      `ERPNext Sales Invoice ${salesInvoiceId} still has ${outstandingAmount} outstanding after reconciliation.`,
    );
  }
}

async function settleSalesInvoice(input: {
  order: {
    id: string;
    userId: string;
    totalPrice: number;
    fulfillmentType: InvoiceAccountingTreatment;
    configurationData: unknown;
    erpnextCustomerId: string | null;
  };
  amount: number;
  transRef: string;
  remarks: string;
}) {
  const salesInvoiceId = await resolveSalesInvoice(input.order);
  const paymentEntryDraft = await getPaymentEntryDraft(
    salesInvoiceId,
    input.amount,
  );
  const references = Array.isArray(paymentEntryDraft.references)
    ? paymentEntryDraft.references
    : [];
  const invoiceReference = references.find(
    (reference) =>
      isRecord(reference) &&
      reference.reference_doctype === "Sales Invoice" &&
      reference.reference_name === salesInvoiceId,
  );

  if (!isRecord(invoiceReference)) {
    throw new Error(
      `ERPNext Payment Entry draft does not reference Sales Invoice ${salesInvoiceId}.`,
    );
  }

  const bankGlAccount = process.env.ERPNEXT_BANK_GL_ACCOUNT?.trim();
  const modeOfPayment =
    process.env.ERPNEXT_PAYMENT_MODE_OF_PAYMENT?.trim() || DEFAULT_PAYMENT_MODE;
  if (!bankGlAccount) {
    throw new Error(
      "ERPNEXT_BANK_GL_ACCOUNT is required for Payment Entry sync.",
    );
  }

  const paymentEntryId = await submitErpDocument("Payment Entry", {
    ...paymentEntryDraft,
    name: undefined,
    paid_to: bankGlAccount,
    mode_of_payment: modeOfPayment,
    paid_amount: input.amount,
    received_amount: input.amount,
    reference_no: input.transRef,
    reference_date: today(),
    remarks: input.remarks,
    custom_remarks: 1,
    references: [
      {
        ...invoiceReference,
        name: undefined,
        allocated_amount: input.amount,
      },
    ],
  });

  return { salesInvoiceId, paymentEntryId };
}

async function getProjectAdvancePaymentEntries(orderId: string) {
  const milestones = await db.query.paymentMilestones.findMany({
    where: and(
      eq(paymentMilestones.orderId, orderId),
      inArray(paymentMilestones.milestoneOrder, [1, 2]),
      eq(paymentMilestones.status, "PAID"),
    ),
    columns: {
      id: true,
      milestoneOrder: true,
      amount: true,
    },
    with: {
      verifiedSlip: {
        columns: {
          transRef: true,
        },
      },
    },
    orderBy: [asc(paymentMilestones.milestoneOrder)],
  });

  if (milestones.length !== 2) {
    throw new Error(
      `Project order ${orderId} does not have both paid advance milestones.`,
    );
  }

  return Promise.all(
    milestones.map(async (milestone) => {
      const transRef = milestone.verifiedSlip?.transRef;
      if (!transRef) {
        throw new Error(
          `Paid milestone ${milestone.id} has no verified slip reference.`,
        );
      }
      const paymentEntry = await findExistingPaymentEntry(transRef);
      if (!paymentEntry || paymentEntry.docstatus !== 1) {
        throw new Error(
          `Submitted advance Payment Entry was not found for milestone ${milestone.id}.`,
        );
      }
      return {
        milestoneId: milestone.id,
        paymentEntryId: paymentEntry.name,
        amount: Number(milestone.amount),
      };
    }),
  );
}

async function settleProjectCompletion(input: {
  order: {
    id: string;
    userId: string;
    totalPrice: number;
    fulfillmentType: "INSTALLATION";
    configurationData: unknown;
    erpnextCustomerId: string | null;
  };
  finalAmount: number;
  transRef: string;
  milestoneName: string;
  existingFinalPaymentEntryId?: string;
}) {
  const customerId =
    input.order.erpnextCustomerId ||
    (await getOrCreateErpnextCustomerForUser(
      input.order.userId,
      input.order.configurationData,
    ));
  const company = process.env.ERPNEXT_COMPANY_NAME?.trim();
  const receivableAccount = process.env.ERPNEXT_RECEIVABLE_ACCOUNT?.trim();
  const advanceAccount =
    process.env.ERPNEXT_CUSTOMER_ADVANCE_ACCOUNT?.trim();
  if (!company || !receivableAccount || !advanceAccount) {
    throw new Error(
      "ERPNEXT_COMPANY_NAME, ERPNEXT_RECEIVABLE_ACCOUNT and ERPNEXT_CUSTOMER_ADVANCE_ACCOUNT are required for project completion sync.",
    );
  }

  const salesInvoiceId = await resolveSalesInvoice(input.order);
  let paymentEntryId = input.existingFinalPaymentEntryId;
  if (paymentEntryId) {
    const existingEntry = await findExistingPaymentEntry(input.transRef);
    if (existingEntry?.docstatus === 0) {
      await submitExistingErpDocument("Payment Entry", paymentEntryId);
    }
  }
  if (!paymentEntryId) {
    const settled = await settleSalesInvoice({
      order: input.order,
      amount: input.finalAmount,
      transRef: input.transRef,
      remarks: `[Milestone Payment] Received Payment for Stage: ${input.milestoneName}`,
    });
    paymentEntryId = settled.paymentEntryId;
  }

  const advances = await getProjectAdvancePaymentEntries(input.order.id);
  const expectedAdvanceTotal =
    Number(input.order.totalPrice) - input.finalAmount;
  const actualAdvanceTotal = advances.reduce(
    (total, advance) => total + advance.amount,
    0,
  );
  if (Math.abs(actualAdvanceTotal - expectedAdvanceTotal) > 0.01) {
    throw new Error(
      `Project advances total ${actualAdvanceTotal} does not match expected ${expectedAdvanceTotal}.`,
    );
  }

  if (Math.abs(await getInvoiceOutstandingAmount(salesInvoiceId)) <= 0.01) {
    return {
      salesInvoiceId,
      paymentEntryId,
      advancePaymentEntryIds: advances.map(
        (advance) => advance.paymentEntryId,
      ),
    };
  }

  for (const advance of advances) {
    await reconcileAdvancePayment({
      company,
      customerId,
      receivableAccount,
      advanceAccount,
      paymentEntryId: advance.paymentEntryId,
      salesInvoiceId,
    });
  }
  await ensureInvoiceHasZeroOutstanding(salesInvoiceId);

  return {
    salesInvoiceId,
    paymentEntryId,
    advancePaymentEntryIds: advances.map(
      (advance) => advance.paymentEntryId,
    ),
  };
}

export async function syncSupplyOnlyPaymentToERP(
  orderId: string,
  transRef: string,
) {
  const order = await db.query.proposals.findFirst({
    where: and(
      eq(proposals.id, orderId),
      eq(proposals.fulfillmentType, "SUPPLY_ONLY"),
    ),
    columns: {
      id: true,
      userId: true,
      totalPrice: true,
      fulfillmentType: true,
      configurationData: true,
      erpnextCustomerId: true,
    },
  });

  if (!order) {
    throw new Error(`Paid supply-only order ${orderId} was not found.`);
  }

  const existingPaymentEntry = await findExistingPaymentEntry(transRef);
  if (existingPaymentEntry) {
    if (existingPaymentEntry.docstatus === 0) {
      await submitExistingErpDocument(
        "Payment Entry",
        existingPaymentEntry.name,
      );
    }
    return {
      salesInvoiceId:
        getNestedRecord(order.configurationData, "erpPaymentSync")
          .salesInvoiceId || null,
      paymentEntryId: existingPaymentEntry.name,
      accountingTreatment: "FULL_SALE" as const,
      skipped: true,
    };
  }

  const amount = Number(order.totalPrice);
  const { salesInvoiceId, paymentEntryId } = await settleSalesInvoice({
    order,
    amount,
    transRef,
    remarks: `Full payment received for SolarDream supply order ${order.id}`,
  });

  await recordPaymentSync({
    orderId: order.id,
    milestoneId: "UPFRONT",
    paymentEntryId,
    transRef,
    amount,
    salesInvoiceId,
    accountingTreatment: "FULL_SALE",
  });

  return {
    salesInvoiceId,
    paymentEntryId,
    accountingTreatment: "FULL_SALE" as const,
    skipped: false,
  };
}

export async function syncMilestonePaymentToERP(
  milestoneId: string,
  transRef: string,
) {
  const milestone = await db.query.paymentMilestones.findFirst({
    where: and(
      eq(paymentMilestones.id, milestoneId),
      eq(paymentMilestones.status, "PAID"),
    ),
    columns: {
      id: true,
      orderId: true,
      milestoneName: true,
      milestoneOrder: true,
      amount: true,
    },
    with: {
      order: {
        columns: {
          id: true,
          userId: true,
          totalPrice: true,
          fulfillmentType: true,
          configurationData: true,
          erpnextCustomerId: true,
        },
      },
    },
  });

  if (!milestone) {
    throw new Error(`Paid milestone ${milestoneId} was not found.`);
  }

  const existingPaymentEntry = await findExistingPaymentEntry(transRef);
  const isProjectCompletion =
    milestone.order.fulfillmentType === "INSTALLATION" &&
    milestone.milestoneOrder === 3;
  if (existingPaymentEntry && !isProjectCompletion) {
    if (existingPaymentEntry.docstatus === 0) {
      await submitExistingErpDocument(
        "Payment Entry",
        existingPaymentEntry.name,
      );
    }
    return {
      salesInvoiceId:
        getNestedRecord(milestone.order.configurationData, "erpPaymentSync")
          .salesInvoiceId || null,
      paymentEntryId: existingPaymentEntry.name,
      skipped: true,
    };
  }

  const amount = Number(milestone.amount);
  const customerId =
    milestone.order.erpnextCustomerId ||
    (await getOrCreateErpnextCustomerForUser(
      milestone.order.userId,
      milestone.order.configurationData,
    ));
  const isAdvancePayment =
    milestone.order.fulfillmentType === "INSTALLATION" &&
    milestone.milestoneOrder <= 2;

  if (isAdvancePayment) {
    const paymentEntryId = await createAdvancePaymentEntry({
      customerId,
      amount,
      transRef,
      milestoneName: milestone.milestoneName,
    });
    await recordPaymentSync({
      orderId: milestone.orderId,
      milestoneId: milestone.id,
      paymentEntryId,
      transRef,
      amount,
      salesInvoiceId: null,
      accountingTreatment: "ADVANCE_PAYMENT",
    });
    return {
      salesInvoiceId: null,
      paymentEntryId,
      accountingTreatment: "ADVANCE_PAYMENT" as const,
      skipped: false,
    };
  }

  if (isProjectCompletion) {
    const completion = await settleProjectCompletion({
      order: {
        ...milestone.order,
        fulfillmentType: "INSTALLATION",
      },
      finalAmount: amount,
      transRef,
      milestoneName: milestone.milestoneName,
      existingFinalPaymentEntryId: existingPaymentEntry?.name,
    });
    await recordPaymentSync({
      orderId: milestone.orderId,
      milestoneId: milestone.id,
      paymentEntryId: completion.paymentEntryId,
      transRef,
      amount,
      salesInvoiceId: completion.salesInvoiceId,
      accountingTreatment: "FINAL_INVOICE_PAYMENT",
      advancePaymentEntryIds: completion.advancePaymentEntryIds,
    });
    return {
      ...completion,
      accountingTreatment: "FINAL_INVOICE_PAYMENT" as const,
      skipped: false,
    };
  }

  const remarks =
    milestone.order.fulfillmentType === "SUPPLY_ONLY"
      ? `Full payment received for SolarDream supply order ${milestone.orderId}`
      : `[Milestone Payment] Received Payment for Stage: ${milestone.milestoneName}`;
  const { salesInvoiceId, paymentEntryId } = await settleSalesInvoice({
    order: milestone.order,
    amount,
    transRef,
    remarks,
  });

  await recordPaymentSync({
    orderId: milestone.orderId,
    milestoneId: milestone.id,
    paymentEntryId,
    transRef,
    amount,
    salesInvoiceId,
    accountingTreatment:
      milestone.order.fulfillmentType === "SUPPLY_ONLY"
        ? "FULL_SALE"
        : "FINAL_INVOICE_PAYMENT",
  });

  return {
    salesInvoiceId,
    paymentEntryId,
    accountingTreatment:
      milestone.order.fulfillmentType === "SUPPLY_ONLY"
        ? ("FULL_SALE" as const)
        : ("FINAL_INVOICE_PAYMENT" as const),
    skipped: false,
  };
}

async function recordPaymentSync(input: {
  orderId: string;
  milestoneId: string;
  paymentEntryId: string;
  transRef: string;
  amount: number;
  salesInvoiceId: string | null;
  accountingTreatment:
    | "FULL_SALE"
    | "ADVANCE_PAYMENT"
    | "FINAL_INVOICE_PAYMENT";
  advancePaymentEntryIds?: string[];
}) {
  const currentOrder = await db.query.proposals.findFirst({
    where: eq(proposals.id, input.orderId),
    columns: { configurationData: true },
  });
  const currentConfig = getConfigRecord(currentOrder?.configurationData);
  const currentSync = getNestedRecord(currentConfig, "erpPaymentSync");
  const paymentEntries = getConfigRecord(currentSync.paymentEntries);

  await db
    .update(proposals)
    .set({
      configurationData: {
        ...currentConfig,
        erpPaymentSync: {
          ...currentSync,
          ...(input.salesInvoiceId
            ? { salesInvoiceId: input.salesInvoiceId }
            : {}),
          paymentEntries: {
            ...paymentEntries,
            [input.milestoneId]: {
              paymentEntryId: input.paymentEntryId,
              transRef: input.transRef,
              amount: input.amount,
              accountingTreatment: input.accountingTreatment,
              ...(input.advancePaymentEntryIds
                ? {
                    reconciledAdvancePaymentEntryIds:
                      input.advancePaymentEntryIds,
                  }
                : {}),
              syncedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        },
      },
    })
    .where(eq(proposals.id, input.orderId));
}

export async function safeSyncMilestonePaymentToERP(
  milestoneId: string,
  transRef: string,
) {
  try {
    return await syncMilestonePaymentToERP(milestoneId, transRef);
  } catch (error) {
    console.error("[ERPNext Payment Sync] Failed.", {
      milestoneId,
      transRef,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

export async function safeSyncSupplyOnlyPaymentToERP(
  orderId: string,
  transRef: string,
) {
  try {
    return await syncSupplyOnlyPaymentToERP(orderId, transRef);
  } catch (error) {
    console.error("[ERPNext Supply Payment Sync] Failed.", {
      orderId,
      transRef,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}
