import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { proposals, serviceOfferings, serviceOrderItems, serviceOrderPayments, serviceOrders, serviceRequests } from "@/db/schema";
import { createErpnextCustomerIdempotently, frappeRequest } from "@/lib/erpnext";
import { createAdminClient } from "@/utils/supabase/server";
import { serviceInvoiceItemsMatch } from "@/lib/servicePricing";
import { deriveServiceTrackingReference } from "@/lib/trackingReference";
import { assertNoLegacyPublicErpSecrets } from "@/lib/serverEnv";

export const SERVICE_PAYMENT_VERIFIED_TOPIC = "erp.service_payment.verified";
export const SERVICE_QUOTE_REQUESTED_TOPIC = "erp.service_quote.requested";

type Json = Record<string, unknown>;
function record(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nameFrom(value: unknown) { const root = record(value); return text(root.name) || text(record(root.data).name); }
function today() { return new Date().toISOString().slice(0, 10); }
function servicePublicReference(order: typeof serviceOrders.$inferSelect) {
  return order.trackingRef || deriveServiceTrackingReference(order.trackingId);
}
async function submit(doctype: "Sales Invoice" | "Payment Entry", name: string) {
  await frappeRequest("PUT", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { data: { docstatus: 1 } });
}

async function getDocument(doctype: "Sales Invoice" | "Payment Entry", name: string) {
  const response = await frappeRequest("GET", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  const document = record(record(response.data).data);
  if (!text(document.name)) throw new Error(`ERPNext ${doctype} ${name} was not found.`);
  return document;
}

async function ensureInvoice(input: { name: string; customerId: string; amount: number; items: Array<{ item_code: string; qty: number; rate: number; amount: number }> }) {
  const invoice = await getDocument("Sales Invoice", input.name);
  if (text(invoice.customer) !== input.customerId || text(invoice.currency) !== "THB" || Number(invoice.update_stock) !== 0 || Math.round(Number(invoice.grand_total) * 100) !== Math.round(input.amount * 100) || !serviceInvoiceItemsMatch(invoice.items, input.items)) throw new Error("ERPNext service invoice snapshot does not exactly match the verified order items.");
  const docstatus = Number(invoice.docstatus);
  if (docstatus === 2) throw new Error("ERPNext service invoice is cancelled.");
  if (docstatus === 0) await submit("Sales Invoice", input.name);
}

async function ensurePaymentEntry(input: { name: string; invoiceId: string; amount: number; transRef: string }) {
  const entry = await getDocument("Payment Entry", input.name);
  const references = Array.isArray(entry.references) ? entry.references.map(record) : [];
  const reference = references.find((item) => item.reference_doctype === "Sales Invoice" && item.reference_name === input.invoiceId);
  if (!reference || Math.round(Number(reference.allocated_amount) * 100) !== Math.round(input.amount * 100) || Math.round(Number(entry.paid_amount) * 100) !== Math.round(input.amount * 100) || Math.round(Number(entry.received_amount) * 100) !== Math.round(input.amount * 100) || text(entry.reference_no) !== input.transRef) throw new Error("ERPNext Payment Entry does not exactly match the verified payment.");
  const docstatus = Number(entry.docstatus);
  if (docstatus === 2) throw new Error("ERPNext service Payment Entry is cancelled.");
  if (docstatus === 0) await submit("Payment Entry", input.name);
}

async function findOne(doctype: "Sales Invoice" | "Payment Entry", filters: unknown[]) {
  const fields = encodeURIComponent(JSON.stringify(["name", "docstatus"]));
  const encoded = encodeURIComponent(JSON.stringify(filters));
  const response = await frappeRequest("GET", `/api/resource/${encodeURIComponent(doctype)}?fields=${fields}&filters=${encoded}&limit_page_length=1`);
  const payload = record(response.data); const rows = Array.isArray(response.data) ? response.data : Array.isArray(payload.data) ? payload.data : [];
  const row = record(rows[0]); const name = text(row.name);
  return name ? { name, docstatus: Number(row.docstatus || 0) } : null;
}

async function findResourceName(doctype: "Quotation" | "Project" | "Task", filters: unknown[]) {
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const encoded = encodeURIComponent(JSON.stringify(filters));
  const response = await frappeRequest("GET", `/api/resource/${encodeURIComponent(doctype)}?fields=${fields}&filters=${encoded}&limit_page_length=1`);
  const payload = record(response.data);
  const rows = Array.isArray(response.data) ? response.data : Array.isArray(payload.data) ? payload.data : [];
  return text(record(rows[0]).name) || null;
}

function serviceTermsFor(items: Array<{ item_code: string; item_name: string }>) {
  const codes = items.map((item) => item.item_code.toUpperCase());
  const lines = [
    "SolarDream service terms for on-site fulfillment.",
    "Final scope, liability waivers, and payment collection are completed by authorized SolarDream staff at the service address.",
  ];
  if (codes.some((code) => code.includes("CLN") || code.includes("CLEAN"))) {
    lines.push("Panel cleaning excludes roof structural repair and hidden electrical defect remediation unless separately quoted.");
  }
  if (codes.some((code) => code.includes("INS") || code.includes("CHECK") || code.includes("DIAG"))) {
    lines.push("Inspection and diagnostic services document observed system condition at the visit time and may recommend a follow-up repair quotation.");
  }
  if (codes.some((code) => code.includes("REPAIR") || code.includes("INV"))) {
    lines.push("Repair work may require parts availability confirmation and customer approval before replacement work begins.");
  }
  return lines.join("\n");
}

async function attachPrivateSlip(input: { invoiceId: string; paymentId: string; bucket: string; path: string; contentType: string }) {
  assertNoLegacyPublicErpSecrets();
  const fileName = `service-payment-${input.paymentId}.${input.contentType === "image/png" ? "png" : "jpg"}`;
  const fields = encodeURIComponent(JSON.stringify(["name", "file_url"]));
  const filters = encodeURIComponent(JSON.stringify([["File", "attached_to_doctype", "=", "Sales Invoice"], ["File", "attached_to_name", "=", input.invoiceId], ["File", "file_name", "=", fileName]]));
  const existing = await frappeRequest("GET", `/api/resource/File?fields=${fields}&filters=${filters}&limit_page_length=1`);
  const existingRows = Array.isArray(record(existing.data).data) ? record(existing.data).data as unknown[] : [];
  const existingFile = record(existingRows[0]);
  if (text(existingFile.name) || text(existingFile.file_url)) return text(existingFile.name) || text(existingFile.file_url);
  const storage = createAdminClient();
  const download = await storage.storage.from(input.bucket).download(input.path);
  if (download.error || !download.data) throw new Error("Verified service slip could not be downloaded for ERP attachment.");
  const base = process.env.ERPNEXT_BASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.ERPNEXT_API_KEY?.trim(); const secret = process.env.ERPNEXT_API_SECRET?.trim();
  if (!base || !key || !secret) throw new Error("ERPNext attachment configuration is missing.");
  const form = new FormData();
  form.set("file", new File([await download.data.arrayBuffer()], fileName, { type: input.contentType }));
  form.set("is_private", "1"); form.set("attached_to_doctype", "Sales Invoice"); form.set("attached_to_name", input.invoiceId); form.set("doctype", "Sales Invoice"); form.set("docname", input.invoiceId);
  const response = await fetch(`${base}/api/method/upload_file`, { method: "POST", headers: { Authorization: `token ${key}:${secret}` }, body: form, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ERPNext slip attachment failed with status ${response.status}.`);
  const message = record(record(payload).message);
  const fileId = text(message.name) || text(message.file_url);
  if (!fileId) throw new Error("ERPNext slip attachment did not return a file ID.");
  return fileId;
}

export async function syncVerifiedServicePayment(orderId: string) {
  const order = await db.query.serviceOrders.findFirst({ where: eq(serviceOrders.id, orderId) });
  if (!order || !["VERIFIED", "PAID"].includes(order.paymentStatus)) throw new Error("Service ERP sync requires a verified order.");
  const payment = await db.query.serviceOrderPayments.findFirst({ where: eq(serviceOrderPayments.serviceOrderId, order.id) });
  if (!payment || payment.status !== "VERIFIED" || !payment.transRef) throw new Error("Service ERP sync requires a verified payment record.");
  const orderItems = await db.select().from(serviceOrderItems).where(eq(serviceOrderItems.serviceOrderId, order.id));
  const legacyOffering = orderItems.length ? null : await db.query.serviceOfferings.findFirst({ where: eq(serviceOfferings.id, order.serviceOfferingId) });
  const invoiceItems = orderItems.length ? orderItems.map((item) => { const snapshot = record(item.offeringSnapshot); const erpItemCode = text(snapshot.erpItemCode); if (!erpItemCode) throw new Error("Service offering ERP item code is missing."); return { item_code: erpItemCode, qty: 1, rate: item.totalSatang / 100, amount: item.totalSatang / 100 }; }) : [{ item_code: legacyOffering?.erpItemCode || "", qty: 1, rate: Number(payment.amountSnapshot), amount: Number(payment.amountSnapshot) }];
  if (invoiceItems.some((item) => !item.item_code)) throw new Error("Service offering ERP item code is missing.");
  const contact = record(order.contactSnapshot);
  const amount = Number(payment.amountSnapshot);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Service payment amount is invalid.");
  if (invoiceItems.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) !== Math.round(amount * 100)) throw new Error("Service invoice line sum does not exactly match the verified order total.");
  await db.update(serviceOrders).set({ erpPaymentSyncStatus: "PROCESSING", erpPaymentSyncError: null, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id));
  await db.update(serviceOrderPayments).set({ erpSyncStatus: "PROCESSING", erpSyncError: null, updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id));
  try {
    let customerId = order.erpCustomerId;
    if (!customerId) {
      const member = order.customerUserId ? await db.query.users.findFirst({ where: (table, { eq }) => eq(table.id, order.customerUserId!), columns: { erpnextCustomerId: true } }) : null;
      customerId = member?.erpnextCustomerId || (await createErpnextCustomerIdempotently({ name: text(contact.fullName) || text(contact.name) || `Service Customer ${order.id.slice(0, 8)}`, email: text(contact.email), phone: text(contact.phone), address: order.serviceAddress || undefined })).customerId;
      await db.update(serviceOrders).set({ erpCustomerId: customerId, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id));
    }
    let invoiceId = order.erpSalesInvoiceId || payment.erpSalesInvoiceId;
    if (!invoiceId) {
      const existing = await findOne("Sales Invoice", [["Sales Invoice", "remarks", "=", `SolarDream Service Order: ${order.id}`], ["Sales Invoice", "docstatus", "!=", 2]]);
      invoiceId = existing?.name || null;
      if (!invoiceId) {
        const company = process.env.ERPNEXT_COMPANY_NAME?.trim();
        if (!company) throw new Error("ERPNEXT_COMPANY_NAME is required for service invoicing.");
        const created = await frappeRequest("POST", "/api/resource/Sales%20Invoice", { data: { customer: customerId, company, posting_date: today(), due_date: today(), currency: "THB", update_stock: 0, remarks: `SolarDream Service Order: ${order.id}`, items: invoiceItems } });
        invoiceId = nameFrom(created.data);
        if (!invoiceId) throw new Error("ERPNext did not return the service Sales Invoice ID.");
      }
      await Promise.all([
        db.update(serviceOrders).set({ erpSalesInvoiceId: invoiceId, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id)),
        db.update(serviceOrderPayments).set({ erpSalesInvoiceId: invoiceId, updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id)),
      ]);
    }
    await ensureInvoice({ name: invoiceId, customerId, amount, items: invoiceItems });
    let slipFileId = order.erpSlipFileId || payment.erpSlipFileId;
    if (!slipFileId) {
      slipFileId = await attachPrivateSlip({ invoiceId, paymentId: payment.id, bucket: process.env.SERVICE_PAYMENT_STORAGE_BUCKET?.trim() || "private-service-payments", path: payment.storageFileId, contentType: payment.contentType });
      await Promise.all([
        db.update(serviceOrders).set({ erpSlipFileId: slipFileId, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id)),
        db.update(serviceOrderPayments).set({ erpSlipFileId: slipFileId, updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id)),
      ]);
    }
    let paymentEntryId = order.erpPaymentEntryId || payment.erpPaymentEntryId;
    if (!paymentEntryId) {
      const existing = await findOne("Payment Entry", [["Payment Entry", "reference_no", "=", payment.transRef], ["Payment Entry", "docstatus", "!=", 2]]);
      paymentEntryId = existing?.name || null;
      if (!paymentEntryId) {
        const draftResult = await frappeRequest("POST", "/api/method/erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry", { dt: "Sales Invoice", dn: invoiceId, party_amount: amount });
        const draft = record(record(draftResult.data).message);
        const references = Array.isArray(draft.references) ? draft.references.map(record) : [];
        const reference = references.find((item) => item.reference_doctype === "Sales Invoice" && item.reference_name === invoiceId);
        if (!reference) throw new Error("ERPNext Payment Entry draft does not reference the service invoice.");
        const paidTo = process.env.ERPNEXT_BANK_GL_ACCOUNT?.trim();
        if (!paidTo) throw new Error("ERPNEXT_BANK_GL_ACCOUNT is required for service payment sync.");
        const created = await frappeRequest("POST", "/api/resource/Payment%20Entry", { data: { ...draft, name: undefined, paid_to: paidTo, paid_amount: amount, received_amount: amount, reference_no: payment.transRef, reference_date: today(), remarks: `SolarDream Service Payment: ${order.id}`, references: [{ ...reference, name: undefined, allocated_amount: amount }] } });
        paymentEntryId = nameFrom(created.data);
        if (!paymentEntryId) throw new Error("ERPNext did not return the service Payment Entry ID.");
      }
      await Promise.all([
        db.update(serviceOrders).set({ erpPaymentEntryId: paymentEntryId, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id)),
        db.update(serviceOrderPayments).set({ erpPaymentEntryId: paymentEntryId, updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id)),
      ]);
    }
    await ensurePaymentEntry({ name: paymentEntryId, invoiceId, amount, transRef: payment.transRef });
    const invoiceResult = await frappeRequest("GET", `/api/resource/Sales%20Invoice/${encodeURIComponent(invoiceId)}`);
    const outstanding = Number(record(record(invoiceResult.data).data).outstanding_amount);
    if (!Number.isFinite(outstanding) || Math.abs(outstanding) > 0.01) throw new Error(`Service invoice still has ${outstanding} outstanding.`);
    await Promise.all([
      db.update(serviceOrders).set({ paymentStatus: "PAID", paidAt: new Date(), erpPaymentSyncStatus: "SYNCED", erpPaymentSyncError: null, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id)),
      db.update(serviceOrderPayments).set({ erpSyncStatus: "SYNCED", erpSyncError: null, updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id)),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown ERP sync failure";
    await Promise.all([
      db.update(serviceOrders).set({ erpPaymentSyncStatus: "RETRY", erpPaymentSyncError: message, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id)),
      db.update(serviceOrderPayments).set({ erpSyncStatus: "RETRY", erpSyncError: message, updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id)),
    ]);
    throw error;
  }
}

export async function syncRequestedServiceQuote(orderId: string) {
  const order = await db.query.serviceOrders.findFirst({ where: eq(serviceOrders.id, orderId) });
  if (!order || order.paymentRequirement !== "NOT_REQUIRED" || order.status !== "QUOTE_REQUESTED") throw new Error("Service quotation sync requires a quote-requested order.");
  const contact = record(order.contactSnapshot); const items = await db.select().from(serviceOrderItems).where(eq(serviceOrderItems.serviceOrderId, order.id));
  if (!items.length) throw new Error("Service quotation sync requires at least one order item.");
  let customerId = order.erpCustomerId;
  if (!customerId) customerId = (await createErpnextCustomerIdempotently({ name: text(contact.fullName) || `Service Customer ${order.id.slice(0, 8)}`, email: text(contact.email), phone: text(contact.phone), address: order.serviceAddress || undefined })).customerId;
  const marker = `SolarDream Service Request: ${order.id}`;
  const erpItems = items.map((item) => {
    const snapshot = record(item.offeringSnapshot);
    const name = record(snapshot.name);
    const itemCode = text(snapshot.erpItemCode) || text(snapshot.code);
    if (!itemCode) throw new Error("Service offering ERP item code is missing.");
    return {
      item_code: itemCode,
      item_name: text(name.en) || itemCode,
      description: text(name.th) || text(name.en) || itemCode,
      qty: 1,
      rate: item.totalSatang / 100,
      amount: item.totalSatang / 100,
    };
  });
  const company = process.env.ERPNEXT_COMPANY_NAME?.trim();
  if (!company) throw new Error("ERPNEXT_COMPANY_NAME is required for service quotation sync.");
  let quotationId = text(record(order.erpPayload).quotationId) || await findResourceName("Quotation", [["Quotation", "remarks", "=", marker]]);
  if (!quotationId) {
    const quotationData: Record<string, unknown> = {
        naming_series: "QTN-.YYYY.-",
        quotation_to: "Customer",
        party_name: customerId,
        customer: customerId,
        title: `Service request ${servicePublicReference(order)}`,
        transaction_date: today(),
        valid_till: new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10),
        company,
        currency: "THB",
        selling_price_list: process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling",
        remarks: marker,
        terms: serviceTermsFor(erpItems),
        items: erpItems,
    };
    const requestTypeField = process.env.ERPNEXT_QUOTATION_REQUEST_TYPE_FIELD?.trim();
    if (requestTypeField && /^[a-z][a-z0-9_]*$/.test(requestTypeField)) quotationData[requestTypeField] = "Service";
    let created;
    try { created = await frappeRequest("POST", "/api/resource/Quotation", { data: quotationData }); }
    catch (error) {
      const missingCustomField = requestTypeField && error instanceof Error && /unknown column|unknown field|field .* not found|does not exist/i.test(error.message);
      if (!missingCustomField) throw error;
      delete quotationData[requestTypeField];
      created = await frappeRequest("POST", "/api/resource/Quotation", { data: quotationData });
    }
    quotationId = nameFrom(created.data);
  }
  if (!quotationId) throw new Error("ERPNext did not return the service Quotation ID.");
  const publicReference = servicePublicReference(order);
  let projectId = text(record(order.erpPayload).projectId) || await findResourceName("Project", [["Project", "project_name", "=", `SolarDream Service ${publicReference}`]]);
  if (!projectId) {
    const created = await frappeRequest("POST", "/api/resource/Project", {
      data: {
        project_name: `SolarDream Service ${publicReference}`,
        status: "Open",
        customer: customerId,
        expected_start_date: order.appointmentDate.toISOString().slice(0, 10),
        notes: [
          marker,
          `Quotation: ${quotationId}`,
          `Service address: ${order.serviceAddress || ""}`,
          `Coordinates: ${order.latitude || ""}, ${order.longitude || ""}`,
          `On-site payment and contract signature required after task completion.`,
        ].join("\n"),
      },
    });
    projectId = nameFrom(created.data);
  }
  if (!projectId) throw new Error("ERPNext did not return the service Project ID.");
  const requests = await db.query.serviceRequests.findMany({ where: eq(serviceRequests.serviceOrderId, order.id) });
  const taskIds: string[] = [];
  for (const request of requests) {
    if (request.erpnextIssueId) { taskIds.push(request.erpnextIssueId); continue; }
    const subject = `Site visit: ${request.subject} (${request.id.slice(0, 8)})`;
    let taskId = await findResourceName("Task", [["Task", "project", "=", projectId], ["Task", "subject", "=", subject]]);
    if (!taskId) {
      const created = await frappeRequest("POST", "/api/resource/Task", {
        data: {
          subject,
          project: projectId,
          status: "Open",
          exp_start_date: order.appointmentDate.toISOString().slice(0, 10),
          description: [
            request.description,
            marker,
            `Service request: ${request.id}`,
            `Quotation: ${quotationId}`,
            `Customer: ${text(contact.fullName)}`,
            `Phone: ${text(contact.phone)}`,
            `Address: ${order.serviceAddress || ""}`,
          ].filter(Boolean).join("\n"),
        },
      });
      taskId = nameFrom(created.data);
    }
    if (!taskId) throw new Error("ERPNext did not return the service Task ID.");
    taskIds.push(taskId);
    await db.update(serviceRequests).set({ erpnextIssueId: taskId, erpnextSyncStatus: "SYNCED", erpnextLastSyncedAt: new Date() }).where(eq(serviceRequests.id, request.id));
  }
  await db.transaction(async (tx) => {
    await tx.update(serviceOrders).set({ erpCustomerId: customerId, erpPayload: { ...record(order.erpPayload), quotationId, projectId, taskIds, fulfillmentModel: "QUOTATION_ON_SITE_PAYMENT", syncedAt: new Date().toISOString() }, erpPaymentSyncStatus: "SYNCED", erpPaymentSyncError: null, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id));
    await tx.update(proposals).set({ erpnextCustomerId: customerId, erpnextQuotationId: quotationId, updatedAt: new Date() }).where(eq(proposals.serviceOrderId, order.id));
  });
}
