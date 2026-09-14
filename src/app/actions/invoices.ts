"use server";

import { db } from "@/db";
import { users, invoices, installationJobTickets, paymentMilestones, proposals } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { createClient } from "@/utils/supabase/server";
import { frappeRequest } from "@/lib/erpnext";
import { verifySlipPayment as verifyMilestoneSlipPayment } from "@/app/actions/payments";

type JsonRecord = Record<string, unknown>;
type SyncedInvoice = typeof invoices.$inferSelect;
type InstallationJobTicketSummary = typeof installationJobTickets.$inferSelect;

type ErpInvoiceRow = {
  name: string;
  status: string;
  roundedTotal: string | number | null;
  outstandingAmount: string | number | null;
  postingDate: string | null;
  project: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNestedText(value: unknown, path: readonly string[]): string | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return getText(cursor);
}

function parseErpInvoice(value: unknown): ErpInvoiceRow | null {
  if (!isRecord(value)) return null;
  const name = getText(value.name);
  if (!name) return null;

  return {
    name,
    status: getText(value.status) || "Unpaid",
    roundedTotal: typeof value.rounded_total === "number" || typeof value.rounded_total === "string" ? value.rounded_total : null,
    outstandingAmount: typeof value.outstanding_amount === "number" || typeof value.outstanding_amount === "string" ? value.outstanding_amount : null,
    postingDate: getText(value.posting_date),
    project: getText(value.project),
  };
}

function getErpInvoiceRows(response: unknown): ErpInvoiceRow[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];
  return response.data.map(parseErpInvoice).filter((row): row is ErpInvoiceRow => row !== null);
}

function getProjectSyncId(configurationData: unknown): string | null {
  return getNestedText(configurationData, ["erpProjectSync", "erpnextProjectId"]);
}

function mapErpInvoiceStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "PAID";
  if (normalized === "partially paid") return "PARTIALLY_PAID";
  return "UNPAID";
}

function getInvoiceAmount(invoice: ErpInvoiceRow): string {
  return String(invoice.roundedTotal ?? invoice.outstandingAmount ?? 0);
}

function getInvoiceDate(invoice: ErpInvoiceRow): Date {
  if (!invoice.postingDate) return new Date();
  const parsed = new Date(invoice.postingDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getInvoicePdfUrl(invoiceName: string): string | null {
  const baseUrl = process.env.ERPNEXT_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) return null;
  return `${baseUrl}/api/method/frappe.utils.print_format.download_pdf?doctype=Sales%20Invoice&name=${encodeURIComponent(invoiceName)}&format=Standard`;
}

function isSecureExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Server utility to query invoices directly from ERPNext by customer ID and sync/cache in Drizzle.
 */
export async function fetchCustomerInvoices(erpnextCustomerId: string) {
  try {
    // 1. Fetch user matching customer ID
    const user = await db.query.users.findFirst({
      where: eq(users.erpnextCustomerId, erpnextCustomerId),
    });

    if (!user) {
      return { error: `User with ERPNext Customer ID ${erpnextCustomerId} not found.` };
    }

    // 2. Fetch all user proposals
    const userProposals = await db.query.proposals.findMany({
      where: eq(proposals.userId, user.id),
    });

    // 3. Fetch all installation job tickets matching proposals
    const proposalIds = userProposals.map((p) => p.id);
    let jobTicketsList: InstallationJobTicketSummary[] = [];
    if (proposalIds.length > 0) {
      jobTicketsList = await db.query.installationJobTickets.findMany({
        where: inArray(installationJobTickets.quotationId, proposalIds),
      });
    }

    // 4. Query ERPNext Sales Invoices for customer ID
    const fields = encodeURIComponent(
      JSON.stringify(["name", "status", "rounded_total", "posting_date", "outstanding_amount", "project"])
    );
    const filters = encodeURIComponent(
      JSON.stringify([["Sales Invoice", "customer", "=", erpnextCustomerId]])
    );

    const res = await frappeRequest(
      "GET",
      `/api/resource/Sales Invoice?fields=${fields}&filters=${filters}`
    );

    const syncedInvoices: SyncedInvoice[] = [];

    const erpInvoices = getErpInvoiceRows(res);
    if (erpInvoices.length > 0) {
      for (const erpInv of erpInvoices) {
        let matchedJobTicketId: string | null = null;

        // Try mapping by ERPNext Project ID
        if (erpInv.project) {
          const matchedProposal = userProposals.find((p) => {
            return getProjectSyncId(p.configurationData) === erpInv.project;
          });
          if (matchedProposal) {
            const ticket = jobTicketsList.find((t) => t.quotationId === matchedProposal.id);
            if (ticket) matchedJobTicketId = ticket.id;
          }
        }

        // Fallback: If only a single job ticket exists, match to that
        if (!matchedJobTicketId && jobTicketsList.length === 1) {
          matchedJobTicketId = jobTicketsList[0].id;
        }

        if (matchedJobTicketId) {
          const mappedStatus = mapErpInvoiceStatus(erpInv.status);
          const amount = getInvoiceAmount(erpInv);
          const createdAtDate = getInvoiceDate(erpInv);
          const pdfUrl = getInvoicePdfUrl(erpInv.name);

          // Check if local cache has this invoice
          const existing = await db.query.invoices.findFirst({
            where: eq(invoices.erpnextInvoiceId, erpInv.name),
          });

          if (existing) {
            const [updated] = await db
              .update(invoices)
              .set({
                status: mappedStatus,
                amount,
                pdfUrl,
              })
              .where(eq(invoices.id, existing.id))
              .returning();
            syncedInvoices.push(updated);
          } else {
            const [inserted] = await db
              .insert(invoices)
              .values({
                jobTicketId: matchedJobTicketId,
                erpnextInvoiceId: erpInv.name,
                status: mappedStatus,
                amount,
                pdfUrl,
                createdAt: createdAtDate,
              })
              .returning();
            syncedInvoices.push(inserted);
          }
        }
      }
    }

    return { success: true, invoices: syncedInvoices };
  } catch (error: unknown) {
    console.error("[fetchCustomerInvoices Server Action]:", error);
    return { error: "Failed to fetch customer invoices." };
  }
}

/**
 * Fetch and return invoices cached locally for a specific proposal,
 * dynamically fetching updates from ERPNext first if linked customer ID exists.
 */
export async function getInvoicesForProposal(proposalId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "User not authenticated" };
    }

    // 1. Fetch proposal and check ownership
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });

    if (!proposal) {
      return { error: "Proposal not found" };
    }

    if (proposal.userId !== user.id) {
      return { error: "Access denied" };
    }

    // 2. Fetch associated installation job ticket
    const jobTicket = await db.query.installationJobTickets.findFirst({
      where: eq(installationJobTickets.quotationId, proposalId),
    });

    if (!jobTicket) {
      return { success: true, invoices: [] };
    }

    // 3. Keep cache fresh by fetching from ERPNext
    // Check if customer ID is linked (on proposal or user record)
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });
    const erpnextCustomerId = proposal.erpnextCustomerId || dbUser?.erpnextCustomerId;

    if (erpnextCustomerId) {
      await fetchCustomerInvoices(erpnextCustomerId);
    } else {
      // Fallback: Sync based on specific proposal ERPNext Project ID
      const erpnextProjectId = getProjectSyncId(proposal.configurationData);

      if (erpnextProjectId) {
        try {
          const fields = encodeURIComponent(
            JSON.stringify(["name", "status", "rounded_total", "posting_date", "outstanding_amount"])
          );
          const filters = encodeURIComponent(
            JSON.stringify([["Sales Invoice", "project", "=", erpnextProjectId]])
          );

          const res = await frappeRequest(
            "GET",
            `/api/resource/Sales Invoice?fields=${fields}&filters=${filters}`
          );

          const erpInvoices = getErpInvoiceRows(res);
          if (erpInvoices.length > 0) {
            for (const erpInv of erpInvoices) {
              const mappedStatus = mapErpInvoiceStatus(erpInv.status);
              const amount = getInvoiceAmount(erpInv);
              const createdAtDate = getInvoiceDate(erpInv);
              const pdfUrl = getInvoicePdfUrl(erpInv.name);

              const existing = await db.query.invoices.findFirst({
                where: eq(invoices.erpnextInvoiceId, erpInv.name),
              });

              if (existing) {
                await db
                  .update(invoices)
                  .set({
                    status: mappedStatus,
                    amount,
                    pdfUrl,
                  })
                  .where(eq(invoices.id, existing.id));
              } else {
                await db.insert(invoices).values({
                  jobTicketId: jobTicket.id,
                  erpnextInvoiceId: erpInv.name,
                  status: mappedStatus,
                  amount,
                  pdfUrl,
                  createdAt: createdAtDate,
                });
              }
            }
          }
        } catch (erpError) {
          console.error("[ERPNext Project Invoices Sync Error]:", erpError);
        }
      }
    }

    // 4. Query and return cached invoices from Drizzle
    const cachedInvoices = await db.query.invoices.findMany({
      where: eq(invoices.jobTicketId, jobTicket.id),
      orderBy: (inv, { desc }) => [desc(inv.createdAt)],
    });

    return { success: true, invoices: cachedInvoices };
  } catch (error: unknown) {
    console.error("[getInvoicesForProposal Server Action]:", error);
    return { error: "Failed to fetch invoices." };
  }
}

export async function getInvoiceDetails(invoiceId: string) {
  try {
    const invoiceRecord = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
    });

    if (!invoiceRecord) {
      return { error: "Invoice not found" };
    }

    return { success: true, invoice: invoiceRecord };
  } catch (error: unknown) {
    console.error("[getInvoiceDetails Server Action]:", error);
    return { error: "Failed to retrieve invoice details." };
  }
}

export async function verifySlipPayment(invoiceId: string, slipUrl: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false as const, error: "Unauthorized" };
  }

  const normalizedInvoiceId = invoiceId.trim();
  const normalizedSlipUrl = slipUrl.trim();
  if (!normalizedInvoiceId || !isSecureExternalUrl(normalizedSlipUrl)) {
    return { success: false as const, error: "Invalid payment slip URL" };
  }

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, normalizedInvoiceId),
    columns: {
      jobTicketId: true,
    },
  });

  if (!invoice) {
    return { success: false as const, error: "Unauthorized" };
  }

  const jobTicket = await db.query.installationJobTickets.findFirst({
    where: eq(installationJobTickets.id, invoice.jobTicketId),
    columns: {
      quotationId: true,
    },
  });

  if (!jobTicket) {
    return { success: false as const, error: "Unauthorized" };
  }

  const ownedOrder = await db.query.proposals.findFirst({
    where: and(
      eq(proposals.id, jobTicket.quotationId),
      eq(proposals.userId, user.id),
    ),
    columns: {
      id: true,
    },
  });

  if (!ownedOrder) {
    return { success: false as const, error: "Unauthorized" };
  }

  const activeMilestone = await db.query.paymentMilestones.findFirst({
    where: and(
      eq(paymentMilestones.orderId, ownedOrder.id),
      eq(paymentMilestones.status, "ACTIVE"),
    ),
    columns: {
      id: true,
    },
  });

  if (!activeMilestone) {
    return {
      success: false as const,
      error: "ไม่พบงวดชำระเงินที่พร้อมชำระ",
    };
  }

  return verifyMilestoneSlipPayment(activeMilestone.id, normalizedSlipUrl);
}
