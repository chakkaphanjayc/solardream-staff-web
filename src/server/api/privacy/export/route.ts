import { and, eq, inArray, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { ensureUserExists } from "@/app/actions/auth";
import { db } from "@/db";
import { assetRegistrations, chatMessages, chatThreads, consultationLeads, installedAssets, leads, paymentRequests, paymentTransactions, proposals, purchasedProducts, quotationComments, quotationDeliveryDocuments, quotationDocumentRequests, savedConfigurations, serviceOrderItems, serviceOrderPayments, serviceOrders, serviceRequests, signatureAuditTrails, userConsentLogs } from "@/db/schema";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { hasRecentAuthentication, isSameOrigin } from "@/lib/privacyConsent";
import { createClient } from "@/utils/supabase/server";


function errorJson(error: string, status: number) {
  const response = NextResponse.json({ success: false, error }, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return errorJson("Forbidden.", 403);
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return errorJson("Unauthorized.", 401);
    if (!hasRecentAuthentication(authUser.last_sign_in_at)) return errorJson("For your security, sign out and sign in again before exporting your data.", 403);
    const user = await ensureUserExists(authUser);
    if (!user || user.anonymizedAt) return errorJson("Account is unavailable.", 410);
    const rate = await enforcePortalRateLimit({ namespace: "privacy-export", identity: user.id, limit: 3, windowSeconds: 3600 });
    if (!rate.allowed) return errorJson("Too many export requests.", 429);

    const [consents, configs, consultations, proposalRows, purchases, registeredAssets, customerAssets, customerThreads, customerServiceOrders] = await Promise.all([
      db.select({ consentType: userConsentLogs.consentType, policyVersion: userConsentLogs.policyVersion, granted: userConsentLogs.granted, preferences: userConsentLogs.preferences, source: userConsentLogs.source, createdAt: userConsentLogs.createdAt }).from(userConsentLogs).where(eq(userConsentLogs.userId, user.id)),
      db.select({ id: savedConfigurations.id, totalPrice: savedConfigurations.totalPrice, createdAt: savedConfigurations.createdAt, updatedAt: savedConfigurations.updatedAt }).from(savedConfigurations).where(eq(savedConfigurations.userId, user.id)),
      db.select({ id: consultationLeads.id, customerName: consultationLeads.customerName, email: consultationLeads.email, phone: consultationLeads.phone, postalCode: consultationLeads.postalCode, targetSystemSize: consultationLeads.targetSystemSize, systemType: consultationLeads.systemType, addOns: consultationLeads.addOns, customerNotes: consultationLeads.customerNotes, status: consultationLeads.status, createdAt: consultationLeads.createdAt, updatedAt: consultationLeads.updatedAt }).from(consultationLeads).where(or(eq(consultationLeads.userId, user.id), eq(consultationLeads.email, user.email))),
      db.select({ id: proposals.id, systemSizeKwp: proposals.systemSizeKwp, panelCount: proposals.panelCount, totalPrice: proposals.totalPrice, monthlySavings: proposals.monthlySavings, paybackPeriod: proposals.paybackPeriod, status: proposals.status, projectStatus: proposals.projectStatus, paymentStatus: proposals.paymentStatus, fulfillmentType: proposals.fulfillmentType, configurationData: proposals.configurationData, signedAt: proposals.signedAt, createdAt: proposals.createdAt, updatedAt: proposals.updatedAt }).from(proposals).where(eq(proposals.userId, user.id)),
      db.select().from(purchasedProducts).where(eq(purchasedProducts.userId, user.id)),
      db.select().from(assetRegistrations).where(eq(assetRegistrations.userId, user.id)),
      db.select().from(installedAssets).where(eq(installedAssets.customerId, user.id)),
      db.select({ id: chatThreads.id, topic: chatThreads.topic, status: chatThreads.status, isArchived: chatThreads.isArchived, createdAt: chatThreads.createdAt, updatedAt: chatThreads.updatedAt }).from(chatThreads).where(eq(chatThreads.customerId, user.id)),
      db.select({ id: serviceOrders.id, serviceOfferingId: serviceOrders.serviceOfferingId, assetId: serviceOrders.assetId, systemSource: serviceOrders.systemSource, status: serviceOrders.status, checkoutDisposition: serviceOrders.checkoutDisposition, paymentRequirement: serviceOrders.paymentRequirement, subtotalSatang: serviceOrders.subtotalSatang, discountSatang: serviceOrders.discountSatang, totalSatang: serviceOrders.totalSatang, priceSnapshot: serviceOrders.priceSnapshot, currency: serviceOrders.currency, offeringSnapshot: serviceOrders.offeringSnapshot, systemSnapshot: serviceOrders.systemSnapshot, contactSnapshot: serviceOrders.contactSnapshot, serviceAddress: serviceOrders.serviceAddress, latitude: serviceOrders.latitude, longitude: serviceOrders.longitude, locationSnapshot: serviceOrders.locationSnapshot, necessaryConsentAt: serviceOrders.necessaryConsentAt, necessaryConsentVersion: serviceOrders.necessaryConsentVersion, claimedAt: serviceOrders.claimedAt, appointmentDate: serviceOrders.appointmentDate, customerNotes: serviceOrders.customerNotes, createdAt: serviceOrders.createdAt, updatedAt: serviceOrders.updatedAt }).from(serviceOrders).where(eq(serviceOrders.customerUserId, user.id)),
    ]);
    const configIds = configs.map((row) => row.id);
    const proposalIds = proposalRows.map((row) => row.id);
    const threadIds = customerThreads.map((row) => row.id);
    const assetIds = customerAssets.map((row) => row.id);
    const serviceOrderIds = customerServiceOrders.map((row) => row.id);
    const [legacyLeads, payments, transactions, documentRequests, deliveryDocuments, signatures, comments, services, servicePayments, serviceItems, authoredMessages] = await Promise.all([
      configIds.length ? db.select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, location: leads.location, status: leads.status, notes: leads.notes, configurationSnapshot: leads.configurationSnapshot, savedConfigurationId: leads.savedConfigurationId, createdAt: leads.createdAt, updatedAt: leads.updatedAt }).from(leads).where(and(inArray(leads.savedConfigurationId, configIds), eq(leads.email, user.email))) : [],
      proposalIds.length ? db.select({ id: paymentRequests.id, proposalId: paymentRequests.proposalId, title: paymentRequests.title, amountRequested: paymentRequests.amountRequested, status: paymentRequests.status, storageProvider: paymentRequests.storageProvider }).from(paymentRequests).where(inArray(paymentRequests.proposalId, proposalIds)) : [],
      proposalIds.length ? db.select({ id: paymentTransactions.id, proposalId: paymentTransactions.proposalId, amount: paymentTransactions.amount, milestoneIndex: paymentTransactions.milestoneIndex, status: paymentTransactions.status, expiresAt: paymentTransactions.expiresAt, createdAt: paymentTransactions.createdAt }).from(paymentTransactions).where(inArray(paymentTransactions.proposalId, proposalIds)) : [],
      proposalIds.length ? db.select({ id: quotationDocumentRequests.id, quotationId: quotationDocumentRequests.quotationId, documentName: quotationDocumentRequests.documentName, requestType: quotationDocumentRequests.requestType, status: quotationDocumentRequests.status, storageProvider: quotationDocumentRequests.storageProvider, createdAt: quotationDocumentRequests.createdAt }).from(quotationDocumentRequests).where(inArray(quotationDocumentRequests.quotationId, proposalIds)) : [],
      proposalIds.length ? db.select({ id: quotationDeliveryDocuments.id, quotationId: quotationDeliveryDocuments.quotationId, deliveryType: quotationDeliveryDocuments.deliveryType, title: quotationDeliveryDocuments.title, status: quotationDeliveryDocuments.status, storageProvider: quotationDeliveryDocuments.storageProvider, createdAt: quotationDeliveryDocuments.createdAt }).from(quotationDeliveryDocuments).where(inArray(quotationDeliveryDocuments.quotationId, proposalIds)) : [],
      proposalIds.length ? db.select({ id: signatureAuditTrails.id, proposalId: signatureAuditTrails.proposalId, signerIpAddress: signatureAuditTrails.signerIpAddress, signerUserAgent: signatureAuditTrails.signerUserAgent, documentHash: signatureAuditTrails.documentHash, createdAt: signatureAuditTrails.createdAt }).from(signatureAuditTrails).where(inArray(signatureAuditTrails.proposalId, proposalIds)) : [],
      proposalIds.length ? db.select({ id: quotationComments.id, quotationId: quotationComments.quotationId, message: quotationComments.message, createdAt: quotationComments.createdAt }).from(quotationComments).where(and(inArray(quotationComments.quotationId, proposalIds), eq(quotationComments.userId, user.id), eq(quotationComments.isAdminReply, false))) : [],
      db.select({ id: serviceRequests.id, assetId: serviceRequests.assetId, serviceOrderId: serviceRequests.serviceOrderId, systemSource: serviceRequests.systemSource, externalSystemDetails: serviceRequests.externalSystemDetails, type: serviceRequests.type, subject: serviceRequests.subject, description: serviceRequests.description, status: serviceRequests.status, contactName: serviceRequests.contactName, contactPhone: serviceRequests.contactPhone, appointmentDate: serviceRequests.appointmentDate, createdAt: serviceRequests.createdAt, updatedAt: serviceRequests.updatedAt }).from(serviceRequests).where(assetIds.length ? or(eq(serviceRequests.customerUserId, user.id), inArray(serviceRequests.assetId, assetIds)) : eq(serviceRequests.customerUserId, user.id)),
      serviceOrderIds.length ? db.select({ id: serviceOrderPayments.id, serviceOrderId: serviceOrderPayments.serviceOrderId, status: serviceOrderPayments.status, amountSnapshot: serviceOrderPayments.amountSnapshot, currency: serviceOrderPayments.currency, transRef: serviceOrderPayments.transRef, receiverAccount: serviceOrderPayments.receiverAccount, receiverName: serviceOrderPayments.receiverName, storageProvider: serviceOrderPayments.storageProvider, contentType: serviceOrderPayments.contentType, byteSize: serviceOrderPayments.byteSize, sha256: serviceOrderPayments.sha256, verifiedAt: serviceOrderPayments.verifiedAt, erpSyncStatus: serviceOrderPayments.erpSyncStatus, createdAt: serviceOrderPayments.createdAt }).from(serviceOrderPayments).where(inArray(serviceOrderPayments.serviceOrderId, serviceOrderIds)) : [],
      serviceOrderIds.length ? db.select({ serviceOrderId: serviceOrderItems.serviceOrderId, quantity: serviceOrderItems.quantity, unitPriceSatang: serviceOrderItems.unitPriceSatang, subtotalSatang: serviceOrderItems.subtotalSatang, discountSatang: serviceOrderItems.discountSatang, totalSatang: serviceOrderItems.totalSatang, offeringSnapshot: serviceOrderItems.offeringSnapshot }).from(serviceOrderItems).where(inArray(serviceOrderItems.serviceOrderId, serviceOrderIds)) : [],
      threadIds.length ? db.select({ id: chatMessages.id, threadId: chatMessages.threadId, message: chatMessages.message, referenceType: chatMessages.referenceType, referenceId: chatMessages.referenceId, isRead: chatMessages.isRead, createdAt: chatMessages.createdAt }).from(chatMessages).where(and(inArray(chatMessages.threadId, threadIds), eq(chatMessages.senderId, user.id), eq(chatMessages.isInternalNote, false))) : [],
    ]);
    const body = JSON.stringify({
      exportedAt: new Date().toISOString(),
      profile: { id: user.id, email: user.email, name: user.name, fullName: user.fullName, phoneNumber: user.phoneNumber, consentPreferences: user.consentPreferences, privacyPolicyVersionAccepted: user.privacyPolicyVersionAccepted, createdAt: user.createdAt, updatedAt: user.updatedAt },
      consentLogs: consents,
      savedConfigurations: configs,
      leads: legacyLeads,
      consultationLeads: consultations,
      proposals: proposalRows,
      paymentMetadata: { requests: payments, transactions },
      documentMetadata: { requests: documentRequests, deliveries: deliveryDocuments },
      assetsAndWarranties: { purchases, registrations: registeredAssets, installed: customerAssets, serviceOrders: customerServiceOrders, serviceRequests: services, servicePayments, serviceItems },
      signatures,
      quotationComments: comments,
      chat: { threads: customerThreads, authoredMessages },
    }, null, 2);
    return new NextResponse(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="solardream-privacy-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[Privacy Export]", error);
    return errorJson("Export is temporarily unavailable.", 503);
  }
}
