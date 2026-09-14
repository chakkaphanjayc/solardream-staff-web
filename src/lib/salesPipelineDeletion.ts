import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  activityLogs,
  chatBackups,
  chatThreads,
  consultationLeads,
  inboundRequests,
  installationAuditEvents,
  installationChecklistItems,
  installationEvidence,
  installationTasks,
  installationWorkflowProjects,
  integrationOutbox,
  leads,
  paymentSlipRegistry,
  proposals,
  serviceOrderPayments,
  serviceOrders,
  servicePortalAuditEvents,
  servicePortalClaimIntents,
  servicePortalTokens,
  servicePromotionRedemptions,
  serviceRequests,
  users,
} from "@/db/schema";

export type SalesPipelineDeleteTarget =
  | { type: "LEAD"; id: string }
  | { type: "CONSULTATION_LEAD"; id: string }
  | { type: "PROPOSAL"; id: string }
  | { type: "INBOUND_REQUEST"; id: string }
  | { type: "THREAD"; id: string }
  | {
      type: "CUSTOMER";
      id: string;
      customerName?: string | null;
      email?: string | null;
      phone?: string | null;
    };

export type SalesPipelineDeleteActor = {
  id: string;
  label: string;
};

export type SalesPipelineDeleteResult = {
  success: boolean;
  error?: string;
  counts?: {
    leads: number;
    consultationLeads: number;
    inboundRequests: number;
    proposals: number;
    serviceOrders: number;
    customerThreads: number;
  };
  erpnextQuotationIds?: string[];
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function add(set: Set<string>, value: string | null | undefined): boolean {
  if (!value || set.has(value)) return false;
  set.add(value);
  return true;
}

function addMany(set: Set<string>, values: Iterable<string | null | undefined>): boolean {
  let changed = false;
  for (const value of values) changed = add(set, value) || changed;
  return changed;
}

function matchesContact(
  record: {
    name?: string | null;
    fullName?: string | null;
    customerName?: string | null;
    email?: string | null;
    phone?: string | null;
  },
  customer: {
    name: string;
    email: string;
    phone: string;
  },
): boolean {
  const emailMatches = Boolean(customer.email) && normalize(record.email) === customer.email;
  const phoneMatches = Boolean(customer.phone) && normalize(record.phone) === customer.phone;
  const name = normalize(record.name || record.fullName || record.customerName);
  const hasStableContact = Boolean(customer.email || customer.phone);
  const nameMatches = !hasStableContact && Boolean(customer.name) && name === customer.name;
  return emailMatches || phoneMatches || nameMatches;
}

function getThreadTarget(target: Extract<SalesPipelineDeleteTarget, { type: "THREAD" }>): SalesPipelineDeleteTarget {
  if (target.id.startsWith("inbound:")) {
    return { type: "INBOUND_REQUEST", id: target.id.slice("inbound:".length) };
  }

  if (target.id.startsWith("consultation:")) {
    return { type: "CONSULTATION_LEAD", id: target.id.slice("consultation:".length) };
  }

  if (target.id.startsWith("legacy:")) {
    return { type: "LEAD", id: target.id.slice("legacy:".length) };
  }

  return { type: "PROPOSAL", id: target.id };
}

function collectConfigurationReferences(
  configurationData: unknown,
  references: {
    inboundIds: Set<string>;
    consultationIds: Set<string>;
    legacyIds: Set<string>;
    serviceOrderIds: Set<string>;
  },
): boolean {
  const config = asRecord(configurationData);
  let changed = false;

  for (const key of ["inboundRequestId", "inbound_request_id"]) {
    changed = add(references.inboundIds, getString(config[key])) || changed;
  }
  for (const key of ["sourceConsultationLeadId", "consultationLeadId", "consultation_lead_id"]) {
    changed = add(references.consultationIds, getString(config[key])) || changed;
  }
  for (const key of ["sourceLeadId", "leadId", "legacyLeadId", "legacy_lead_id"]) {
    changed = add(references.legacyIds, getString(config[key])) || changed;
  }
  for (const key of ["serviceOrderId", "service_order_id"]) {
    const serviceOrderId = getString(config[key]);
    if (serviceOrderId && isUuid(serviceOrderId)) {
      changed = add(references.serviceOrderIds, serviceOrderId) || changed;
    }
  }

  return changed;
}

/**
 * Removes a sales aggregate in one transaction. A sales aggregate is the
 * explicit lead -> quotation -> customer-thread chain, not the customer's
 * login account. Customer accounts are deliberately retained for privacy and
 * to avoid deleting unrelated after-sales records.
 */
export async function deleteLinkedSalesRecords(
  targets: SalesPipelineDeleteTarget[],
  actor: SalesPipelineDeleteActor,
): Promise<SalesPipelineDeleteResult> {
  const cleanTargets = targets.filter((target) => target.id.trim());
  if (cleanTargets.length === 0) {
    return { success: false, error: "No sales records were selected." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [allLeads, allConsultations, allInboundRequests, allProposals] = await Promise.all([
        tx.select().from(leads),
        tx.select().from(consultationLeads),
        tx.select().from(inboundRequests),
        tx.select().from(proposals),
      ]);

      const legacyIds = new Set<string>();
      const consultationIds = new Set<string>();
      const inboundIds = new Set<string>();
      const proposalIds = new Set<string>();
      const userIds = new Set<string>();
      const serviceOrderIds = new Set<string>();
      const customerTargets = cleanTargets.filter(
        (target): target is Extract<SalesPipelineDeleteTarget, { type: "CUSTOMER" }> => target.type === "CUSTOMER",
      );
      const customerMode = customerTargets.length > 0;
      const customerContact = customerTargets.reduce(
        (result, target) => ({
          name: result.name || normalize(target.customerName),
          email: result.email || normalize(target.email),
          phone: result.phone || normalize(target.phone),
        }),
        { name: "", email: "", phone: "" },
      );

      for (const target of cleanTargets) {
        const resolvedTarget = target.type === "THREAD" ? getThreadTarget(target) : target;
        if (resolvedTarget.type === "LEAD") add(legacyIds, resolvedTarget.id);
        if (resolvedTarget.type === "CONSULTATION_LEAD") add(consultationIds, resolvedTarget.id);
        if (resolvedTarget.type === "PROPOSAL") add(proposalIds, resolvedTarget.id);
        if (resolvedTarget.type === "INBOUND_REQUEST") add(inboundIds, resolvedTarget.id);
        if (resolvedTarget.type === "CUSTOMER") {
          add(userIds, resolvedTarget.id);
          if (allLeads.some((row) => row.id === resolvedTarget.id)) add(legacyIds, resolvedTarget.id);
          if (allConsultations.some((row) => row.id === resolvedTarget.id)) add(consultationIds, resolvedTarget.id);
          if (allInboundRequests.some((row) => row.id === resolvedTarget.id)) add(inboundIds, resolvedTarget.id);
          if (allProposals.some((row) => row.id === resolvedTarget.id)) add(proposalIds, resolvedTarget.id);
        }
      }

      const customerUsers = customerMode
        ? await tx
            .select({ id: users.id })
            .from(users)
            .where(
              or(
                ...[
                  ...customerTargets.map((target) => eq(users.id, target.id)),
                  customerContact.email ? eq(users.email, customerContact.email) : null,
                  customerContact.phone ? eq(users.phoneNumber, customerContact.phone) : null,
                ].filter((condition): condition is ReturnType<typeof eq> => Boolean(condition)),
              ),
            )
        : [];
      addMany(userIds, customerUsers.map((user) => user.id));

      const customerMatches = (record: {
        name?: string | null;
        fullName?: string | null;
        customerName?: string | null;
        email?: string | null;
        phone?: string | null;
      }) => customerMode && matchesContact(record, customerContact);

      // A small fixed-point walk handles both the direct foreign keys and the
      // older JSON references used by imported/legacy sales records.
      for (let pass = 0; pass < 8; pass += 1) {
        let changed = false;

        for (const lead of allLeads) {
          if (
            legacyIds.has(lead.id) ||
            customerMatches({ name: lead.name, email: lead.email, phone: lead.phone })
          ) {
            changed = add(legacyIds, lead.id) || changed;
          }
        }

        for (const consultation of allConsultations) {
          if (
            consultationIds.has(consultation.id) ||
            legacyIds.has(consultation.legacyLeadId || "") ||
            customerMatches({
              customerName: consultation.customerName,
              email: consultation.email,
              phone: consultation.phone,
            }) ||
            (customerMode && Boolean(consultation.userId) && userIds.has(consultation.userId || ""))
          ) {
            changed = add(consultationIds, consultation.id) || changed;
            changed = add(legacyIds, consultation.legacyLeadId) || changed;
            changed = add(userIds, consultation.userId) || changed;
          }
        }

        for (const inbound of allInboundRequests) {
          if (
            inboundIds.has(inbound.id) ||
            proposalIds.has(inbound.quotationId || "") ||
            consultationIds.has(inbound.consultationLeadId || "") ||
            customerMatches({
              customerName: inbound.customerName,
              email: inbound.email,
              phone: inbound.phone,
            })
          ) {
            changed = add(inboundIds, inbound.id) || changed;
            changed = add(proposalIds, inbound.quotationId) || changed;
            changed = add(consultationIds, inbound.consultationLeadId) || changed;
          }
        }

        for (const proposal of allProposals) {
          const config = asRecord(proposal.configurationData);
          const isExplicitlyLinked =
            proposalIds.has(proposal.id) ||
            consultationIds.has(proposal.wizardLeadId || "") ||
            (customerMode && userIds.has(proposal.userId)) ||
            customerMatches({
              name: getString(config.customerName) || getString(config.name),
              email: getString(config.customerEmail) || getString(config.email),
              phone: getString(config.customerPhone) || getString(config.phone),
            });

          const proposalReferences = {
            inboundIds: new Set<string>(),
            consultationIds: new Set<string>(),
            legacyIds: new Set<string>(),
            serviceOrderIds: new Set<string>(),
          };
          collectConfigurationReferences(proposal.configurationData, proposalReferences);

          if (
            isExplicitlyLinked ||
            Array.from(proposalReferences.inboundIds).some((id) => inboundIds.has(id)) ||
            Array.from(proposalReferences.consultationIds).some((id) => consultationIds.has(id)) ||
            Array.from(proposalReferences.legacyIds).some((id) => legacyIds.has(id))
          ) {
            changed = add(proposalIds, proposal.id) || changed;
            changed = add(userIds, proposal.userId) || changed;
            changed = add(consultationIds, proposal.wizardLeadId) || changed;
            changed = add(serviceOrderIds, proposal.serviceOrderId) || changed;
            changed = addMany(inboundIds, proposalReferences.inboundIds) || changed;
            changed = addMany(consultationIds, proposalReferences.consultationIds) || changed;
            changed = addMany(legacyIds, proposalReferences.legacyIds) || changed;
            changed = addMany(serviceOrderIds, proposalReferences.serviceOrderIds) || changed;
          }
        }

        for (const proposal of allProposals) {
          if (proposalIds.has(proposal.id)) {
            changed = add(serviceOrderIds, proposal.serviceOrderId) || changed;
          }
        }

        if (!changed) break;
      }

      const selectedLeads = allLeads.filter((row) => legacyIds.has(row.id));
      const selectedConsultations = allConsultations.filter((row) => consultationIds.has(row.id));
      const selectedInboundRequests = allInboundRequests.filter((row) => inboundIds.has(row.id));
      const selectedProposals = allProposals.filter((row) => proposalIds.has(row.id));

      if (
        selectedLeads.length === 0 &&
        selectedConsultations.length === 0 &&
        selectedInboundRequests.length === 0 &&
        selectedProposals.length === 0
      ) {
        return { success: false, error: "The selected sales record no longer exists." };
      }

      const selectedProposalIds = selectedProposals.map((proposal) => proposal.id);
      const selectedInboundIds = selectedInboundRequests.map((request) => request.id);
      const selectedConsultationIds = selectedConsultations.map((consultation) => consultation.id);
      const selectedLeadIds = selectedLeads.map((lead) => lead.id);
      const selectedServiceOrderIds = Array.from(serviceOrderIds).filter(isUuid);
      const selectedUserIds = Array.from(userIds);
      const selectedEntityIds = [
        ...selectedLeadIds,
        ...selectedConsultationIds,
        ...selectedInboundIds,
        ...selectedProposalIds,
        ...selectedServiceOrderIds,
      ];

      // Preserve audit events, but remove queued work that could otherwise
      // re-process an aggregate after it has been deleted.
      const auditEntities = [
        ...selectedLeadIds.map((id) => ({ entityId: id, entityType: "LEAD" })),
        ...selectedConsultationIds.map((id) => ({ entityId: id, entityType: "CONSULTATION_LEAD" })),
        ...selectedInboundIds.map((id) => ({ entityId: id, entityType: "INBOUND_REQUEST" })),
        ...selectedProposalIds.map((id) => ({ entityId: id, entityType: "QUOTATION" })),
      ].filter((entity) => isUuid(entity.entityId));

      if (auditEntities.length > 0) {
        await tx.insert(activityLogs).values(
          auditEntities.map((entity) => ({
            entityId: entity.entityId,
            entityType: entity.entityType,
            action: "LINKED_RECORDS_DELETED",
            description: `${actor.label} deleted the linked sales thread, including its lead, quotation, and customer activity records.`,
            userId: actor.id,
          })),
        );
      }

      if (selectedEntityIds.length > 0) {
        await tx
          .delete(integrationOutbox)
          .where(inArray(integrationOutbox.aggregateId, selectedEntityIds));
      }

      const customerThreadIds = new Set<string>();
      const chatConditions = [];
      if (selectedProposalIds.length > 0) {
        chatConditions.push(inArray(chatThreads.entityId, selectedProposalIds));
      }

      // Lead-only threads do not have an entityId. Remove their customer chat
      // room when the complete customer aggregate is being removed.
      const shouldDeleteCustomerRooms =
        customerMode || selectedProposalIds.length === 0;
      if (shouldDeleteCustomerRooms && selectedUserIds.length > 0) {
        chatConditions.push(inArray(chatThreads.customerId, selectedUserIds));
      }

      if (chatConditions.length > 0) {
        const chatRows = await tx
          .select({ id: chatThreads.id })
          .from(chatThreads)
          .where(or(...chatConditions));
        addMany(customerThreadIds, chatRows.map((row) => row.id));
        if (chatRows.length > 0) {
          await tx.delete(chatBackups).where(inArray(chatBackups.threadId, chatRows.map((row) => row.id)));
          await tx.delete(chatThreads).where(inArray(chatThreads.id, chatRows.map((row) => row.id)));
        }
      }

      if (selectedServiceOrderIds.length > 0) {
        await tx.delete(servicePromotionRedemptions).where(inArray(servicePromotionRedemptions.serviceOrderId, selectedServiceOrderIds));
        await tx.delete(serviceOrderPayments).where(inArray(serviceOrderPayments.serviceOrderId, selectedServiceOrderIds));
        await tx.delete(servicePortalClaimIntents).where(inArray(servicePortalClaimIntents.serviceOrderId, selectedServiceOrderIds));
        await tx.delete(servicePortalAuditEvents).where(inArray(servicePortalAuditEvents.serviceOrderId, selectedServiceOrderIds));
        await tx.delete(serviceRequests).where(inArray(serviceRequests.serviceOrderId, selectedServiceOrderIds));
        await tx.delete(paymentSlipRegistry).where(
          and(
            eq(paymentSlipRegistry.sourceType, "SERVICE_ORDER"),
            inArray(paymentSlipRegistry.sourceId, selectedServiceOrderIds),
          ),
        );
        await tx.delete(servicePortalTokens).where(inArray(servicePortalTokens.serviceOrderId, selectedServiceOrderIds));
        await tx.delete(serviceOrders).where(inArray(serviceOrders.id, selectedServiceOrderIds));
      }

      if (selectedProposalIds.length > 0) {
        const workflowProjects = await tx
          .select({ id: installationWorkflowProjects.id })
          .from(installationWorkflowProjects)
          .where(inArray(installationWorkflowProjects.proposalId, selectedProposalIds));
        const workflowProjectIds = workflowProjects.map((project) => project.id);

        if (workflowProjectIds.length > 0) {
          const workflowTasks = await tx
            .select({ id: installationTasks.id })
            .from(installationTasks)
            .where(inArray(installationTasks.projectId, workflowProjectIds));
          const workflowTaskIds = workflowTasks.map((task) => task.id);
          if (workflowTaskIds.length > 0) {
            const checklistItems = await tx
              .select({ id: installationChecklistItems.id })
              .from(installationChecklistItems)
              .where(inArray(installationChecklistItems.taskId, workflowTaskIds));
            const checklistItemIds = checklistItems.map((item) => item.id);
            if (checklistItemIds.length > 0) {
              await tx.delete(installationEvidence).where(inArray(installationEvidence.checklistItemId, checklistItemIds));
            }
          }
        }

        await tx.delete(installationAuditEvents).where(inArray(installationAuditEvents.proposalId, selectedProposalIds));
        await tx.delete(paymentSlipRegistry).where(
          and(
            eq(paymentSlipRegistry.sourceType, "PROPOSAL"),
            inArray(paymentSlipRegistry.sourceId, selectedProposalIds),
          ),
        );
        await tx.delete(proposals).where(inArray(proposals.id, selectedProposalIds));
      }

      if (selectedInboundIds.length > 0) {
        await tx.delete(inboundRequests).where(inArray(inboundRequests.id, selectedInboundIds));
      }
      if (selectedConsultationIds.length > 0) {
        await tx.delete(consultationLeads).where(inArray(consultationLeads.id, selectedConsultationIds));
      }
      if (selectedLeadIds.length > 0) {
        await tx.delete(leads).where(inArray(leads.id, selectedLeadIds));
      }

      if (selectedUserIds.length > 0 && (customerMode || selectedProposalIds.length === 0)) {
        const customerAuditEntities = selectedUserIds
          .filter(isUuid)
          .map((id) => ({
            entityId: id,
            entityType: "CUSTOMER_THREAD",
            action: "LINKED_RECORDS_DELETED",
            description: `${actor.label} deleted the linked sales/customer activity thread. The customer account was retained.`,
            userId: actor.id,
          }));
        if (customerAuditEntities.length > 0) {
          await tx.insert(activityLogs).values(customerAuditEntities);
        }
      }

      return {
        success: true,
        counts: {
          leads: selectedLeads.length,
          consultationLeads: selectedConsultations.length,
          inboundRequests: selectedInboundRequests.length,
          proposals: selectedProposals.length,
          serviceOrders: selectedServiceOrderIds.length,
          customerThreads: customerThreadIds.size,
        },
        erpnextQuotationIds: selectedProposals
          .map((proposal) => proposal.erpnextQuotationId)
          .filter((id): id is string => Boolean(id)),
      };
    });

    if (result.success && result.erpnextQuotationIds && result.erpnextQuotationIds.length > 0) {
      try {
        const { cancelErpnextQuotation } = await import("@/app/actions/quotationActions");
        for (const quotationId of result.erpnextQuotationIds) {
          const cancellation = await cancelErpnextQuotation(quotationId);
          if (!cancellation.success) {
            console.warn("[Sales Pipeline Delete] ERPNext quotation cancellation failed.", {
              quotationId,
              error: cancellation.error,
            });
          }
        }
      } catch (error: unknown) {
        console.warn("[Sales Pipeline Delete] ERPNext cancellation was unavailable.", error);
      }
    }

    return result;
  } catch (error: unknown) {
    console.error("Failed to delete linked sales records:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete linked sales records.",
    };
  }
}
