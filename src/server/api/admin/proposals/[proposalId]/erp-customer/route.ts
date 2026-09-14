import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { leads, proposals } from "@/db/schema";
import { requireStaffJson } from "@/lib/auth-guard";
import {
  bindProposalErpnextCustomer,
  createErpnextCustomerIdempotently,
  createERPNextLead,
  lookupErpnextCustomers,
} from "@/lib/erpnext";
import { portalJson } from "@/lib/portalAccess";

type RouteContext = { params: Promise<{ proposalId: string }> };
const requestSchema = z.object({
  recordType: z.enum(["LEAD", "PROPOSAL"]).default("PROPOSAL"),
  recordId: z.string().trim().min(1).max(128).optional(),
  action: z.enum(["LOOKUP", "CREATE", "BIND"]),
  customerId: z.string().trim().min(1).max(255).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const staff = await requireStaffJson();
  if (!staff.ok) return staff.response;
  try {
    const { proposalId } = await context.params;
    const input = requestSchema.parse(await request.json());
    const recordId = input.recordId || proposalId;
    if (input.recordType === "LEAD") {
      const lead = await db.query.leads.findFirst({ where: eq(leads.id, recordId) });
      if (!lead) return portalJson({ success: false, error: "Lead not found." }, { status: 404 });
      const contact = { email: lead.email, phone: lead.phone, name: lead.name };
      const snapshot = lead.configurationSnapshot && typeof lead.configurationSnapshot === "object" && !Array.isArray(lead.configurationSnapshot)
        ? lead.configurationSnapshot as Record<string, unknown>
        : {};
      const erpSync = snapshot.erpSync && typeof snapshot.erpSync === "object" && !Array.isArray(snapshot.erpSync)
        ? snapshot.erpSync as Record<string, unknown>
        : {};
      let erpLeadId = typeof erpSync.erpnextLeadId === "string" ? erpSync.erpnextLeadId.trim() : "";
      if (input.action === "LOOKUP") {
        const matches = await lookupErpnextCustomers(contact);
        if (matches.length > 1) {
          return portalJson({ success: false, error: "Multiple exact ERPNext customer matches require selection.", matches }, { status: 409 });
        }
        return portalJson({ success: true, matches });
      }
      let customerId = input.customerId?.trim() || "";
      if (input.action === "CREATE") {
        if (!erpLeadId) {
          const createdLead = await createERPNextLead({
            first_name: lead.name,
            email_id: lead.email || undefined,
            mobile_no: lead.phone || undefined,
            source: "SolarDream CRM",
            notes: `SolarDream CRM lead ID: ${lead.id}`,
            status: "Lead",
          });
          erpLeadId = createdLead.leadId || "";
          if (!erpLeadId) {
            return portalJson({ success: false, error: "ERPNext did not return a Lead ID." }, { status: 502 });
          }
        }
        customerId = (await createErpnextCustomerIdempotently({
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          address: lead.location || undefined,
          leadName: erpLeadId,
        })).customerId;
      }
      if (!customerId) return portalJson({ success: false, error: "ERPNext customer ID is required." }, { status: 400 });
      const boundAt = new Date().toISOString();
      await db.update(leads).set({
        configurationSnapshot: {
          ...snapshot,
          erpSync: {
            ...erpSync,
            erpnextLeadId: erpLeadId || null,
            erpLeadId: erpLeadId || null,
            erpnextCustomerId: customerId,
            erpCustomerId: customerId,
            customerBinding: {
              status: "BOUND",
              source: input.action === "CREATE" ? "STAFF_CREATE" : "STAFF_BIND",
              boundAt,
              boundByUserId: staff.user.id,
            },
          },
        },
        updatedAt: new Date(),
      }).where(eq(leads.id, lead.id));
      return portalJson({ success: true, customerId });
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, recordId),
      with: { user: true },
    });
    if (!proposal) return portalJson({ success: false, error: "Proposal not found." }, { status: 404 });
    const contact = {
      email: proposal.user?.email || "",
      phone: proposal.user?.phoneNumber || "",
      name: proposal.user?.fullName || proposal.user?.name || "",
    };
    if (input.action === "LOOKUP") {
      const matches = await lookupErpnextCustomers(contact);
      if (matches.length > 1) {
        return portalJson({ success: false, error: "Multiple exact ERPNext customer matches require selection.", matches }, { status: 409 });
      }
      return portalJson({ success: true, matches });
    }
    let customerId = input.customerId?.trim() || "";
    if (input.action === "CREATE") {
      const result = await createErpnextCustomerIdempotently({
        name: proposal.user?.fullName || proposal.user?.name || proposal.user?.email || "SolarDream Customer",
        email: contact.email,
        phone: contact.phone,
      });
      customerId = result.customerId;
    }
    if (!customerId) return portalJson({ success: false, error: "ERPNext customer ID is required." }, { status: 400 });
    const updated = await bindProposalErpnextCustomer({
      proposalId: proposal.id,
      customerId,
      actorUserId: staff.user.id,
      source: input.action === "CREATE" ? "STAFF_CREATE" : "STAFF_BIND",
    });
    return portalJson({ success: true, customerId: updated.erpnextCustomerId });
  } catch (error: unknown) {
    console.error("[ERPNext Customer Binding]", error);
    return portalJson({ success: false, error: "Unable to update ERPNext customer binding." }, { status: 400 });
  }
}
