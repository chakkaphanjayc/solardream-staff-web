import "server-only";

import { createHash } from "node:crypto";
import { eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { consultationLeads, leads, proposals, quotationDeliveryDocuments, quotationDocumentRequests, savedConfigurations, serviceOrderPayments, serviceOrders, signatureAuditTrails, userConsentLogs, users, wizardEstimateDrafts } from "@/db/schema";
import { applyConsentPreferencePatch } from "@/lib/consentPreferences";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { PRIVACY_AUTH_CLEANUP_TOPIC, PRIVACY_PROVIDER_CLEANUP_TOPIC } from "@/lib/outboxProcessor";
import { privacyPolicyVersion } from "@/lib/privacyConsent";
import { redactPersonalData } from "@/lib/privacyRedaction";

export async function anonymizeUserAccount(input: {
  userId: string;
  ipHash: string;
  userAgentHash: string | null;
  source: "account_deletion" | "retention";
}) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
    if (!user) throw new Error("User profile does not exist.");
    if (user.anonymizedAt) return { alreadyAnonymized: true, anonymizedAt: user.anonymizedAt };

    const now = new Date();
    const surrogate = `ANONYMIZED_USER_${createHash("sha256").update(user.id).digest("hex").slice(0, 20).toUpperCase()}`;
    const maskedEmail = `${surrogate.toLowerCase()}@privacy.invalid`;
    const preferences = applyConsentPreferencePatch(user.consentPreferences, { news: false, promotions: false, systemUpdates: true });
    const configRows = await tx.select({ id: savedConfigurations.id }).from(savedConfigurations).where(eq(savedConfigurations.userId, user.id));
    const configIds = configRows.map((row) => row.id);
    const proposalRows = await tx.select({ id: proposals.id, configurationData: proposals.configurationData, surveyPhotos: proposals.surveyPhotos, fieldChecklistData: proposals.fieldChecklistData, serviceFees: proposals.serviceFees }).from(proposals).where(eq(proposals.userId, user.id));
    const proposalIds = proposalRows.map((row) => row.id);

    if (user.listmonkSubscriberId) {
      await enqueueIntegrationEvent(tx, {
        topic: PRIVACY_PROVIDER_CLEANUP_TOPIC,
        aggregateType: "USER",
        aggregateId: user.id,
        payload: { listmonkSubscriberId: user.listmonkSubscriberId },
        dedupeKey: `${PRIVACY_PROVIDER_CLEANUP_TOPIC}:${user.id}:${user.listmonkSubscriberId}`,
      });
    }
    await enqueueIntegrationEvent(tx, {
      topic: PRIVACY_AUTH_CLEANUP_TOPIC,
      aggregateType: "USER",
      aggregateId: user.id,
      payload: { authUserId: user.id },
      dedupeKey: `${PRIVACY_AUTH_CLEANUP_TOPIC}:${user.id}`,
    });

    const consultationRows = await tx.select({ id: consultationLeads.id, rawPayload: consultationLeads.rawPayload, crmPayload: consultationLeads.crmPayload, dynamicCalculations: consultationLeads.dynamicCalculations }).from(consultationLeads)
      .where(or(eq(consultationLeads.userId, user.id), eq(consultationLeads.email, user.email)));
    for (const row of consultationRows) {
      await tx.update(consultationLeads).set({
        customerName: surrogate, email: maskedEmail, phone: "[REDACTED]", postalCode: null, customerNotes: null,
        rawPayload: redactPersonalData(row.rawPayload), crmPayload: redactPersonalData(row.crmPayload), dynamicCalculations: redactPersonalData(row.dynamicCalculations),
      }).where(eq(consultationLeads.id, row.id));
    }

    const leadRows = await tx.select({ id: leads.id, configurationSnapshot: leads.configurationSnapshot }).from(leads)
      .where(configIds.length ? or(eq(leads.email, user.email), inArray(leads.savedConfigurationId, configIds)) : eq(leads.email, user.email));
    for (const row of leadRows) {
      await tx.update(leads).set({ name: surrogate, email: maskedEmail, phone: "[REDACTED]", location: null, notes: null, configurationSnapshot: redactPersonalData(row.configurationSnapshot) }).where(eq(leads.id, row.id));
    }

    for (const row of proposalRows) {
      await tx.update(proposals).set({
        configurationData: redactPersonalData(row.configurationData), surveyPhotos: redactPersonalData(row.surveyPhotos), fieldChecklistData: redactPersonalData(row.fieldChecklistData), serviceFees: redactPersonalData(row.serviceFees),
        installationLatitude: null, installationLongitude: null, installationMapAddress: null, installationNotes: null,
        signatureUrl: null, clientIp: null, surveyNotes: null,
      }).where(eq(proposals.id, row.id));
    }
    if (proposalIds.length) {
      await tx.execute(sql`UPDATE portal_access_tokens SET revoked_at = COALESCE(revoked_at, ${now}), updated_at = ${now} WHERE proposal_id = ANY(${proposalIds}::text[]) AND revoked_at IS NULL`);
      await tx.update(signatureAuditTrails).set({ signerIpAddress: "[REDACTED]", signerUserAgent: "[REDACTED]", signatureUrl: "[REDACTED]" }).where(inArray(signatureAuditTrails.proposalId, proposalIds));
      await tx.update(quotationDocumentRequests).set({ metadata: {} }).where(inArray(quotationDocumentRequests.quotationId, proposalIds));
      await tx.update(quotationDeliveryDocuments).set({ metadata: {} }).where(inArray(quotationDeliveryDocuments.quotationId, proposalIds));
      await tx.execute(sql`UPDATE quotation_comments SET user_id = ${surrogate}, message = '[REDACTED]' WHERE user_id = ${user.id} AND quotation_id = ANY(${proposalIds}::text[])`);
    }
    const serviceOrderRows = await tx.select({ id: serviceOrders.id, systemSnapshot: serviceOrders.systemSnapshot }).from(serviceOrders).where(eq(serviceOrders.customerUserId, user.id));
    for (const row of serviceOrderRows) {
      await tx.update(serviceOrders).set({
        contactSnapshot: { name: surrogate, email: maskedEmail, phone: "[REDACTED]" },
        contactEmailDigest: null,
        serviceAddress: null,
        latitude: null,
        longitude: null,
        locationSnapshot: {},
        systemSnapshot: redactPersonalData(row.systemSnapshot),
        erpPayload: { redacted: true },
        customerNotes: "[REDACTED]",
        portalClosedAt: now,
        updatedAt: now,
      }).where(eq(serviceOrders.id, row.id));
    }
    const serviceOrderIds = serviceOrderRows.map((row) => row.id);
    if (serviceOrderIds.length) {
      await tx.execute(sql`UPDATE service_quote_sessions SET input_snapshot='{"redacted":true}'::jsonb, pricing_snapshot='{"redacted":true}'::jsonb WHERE id IN (SELECT quote_session_id FROM service_orders WHERE id = ANY(${serviceOrderIds}::uuid[]))`);
      await tx.execute(sql`UPDATE service_portal_tokens SET status='CLOSED', closed_at=COALESCE(closed_at, ${now}) WHERE service_order_id = ANY(${serviceOrderIds}::uuid[]) AND status='ACTIVE'`);
      await tx.execute(sql`UPDATE service_portal_email_deliveries SET encrypted_capability=NULL WHERE token_id IN (SELECT id FROM service_portal_tokens WHERE service_order_id = ANY(${serviceOrderIds}::uuid[]))`);
      await tx.execute(sql`DELETE FROM service_portal_claim_intents WHERE service_order_id = ANY(${serviceOrderIds}::uuid[])`);
      const paymentRows = await tx.select({ id: serviceOrderPayments.id, easySlipData: serviceOrderPayments.easySlipData }).from(serviceOrderPayments).where(inArray(serviceOrderPayments.serviceOrderId, serviceOrderIds));
      for (const payment of paymentRows) await tx.update(serviceOrderPayments).set({ easySlipData: redactPersonalData(payment.easySlipData), updatedAt: now }).where(eq(serviceOrderPayments.id, payment.id));
    }
    await tx.execute(sql`
      UPDATE service_requests sr
      SET contact_name = ${surrogate}, contact_phone = '[REDACTED]',
          subject = '[REDACTED]', description = '[REDACTED]', images = ARRAY[]::text[],
          external_system_details = '{}'::jsonb
      WHERE sr.customer_user_id = ${user.id}
         OR sr.asset_id IN (SELECT id FROM installed_assets WHERE customer_id = ${user.id})
    `);
    await tx.execute(sql`UPDATE chat_messages SET sender_id = ${surrogate}, message = '[REDACTED]' WHERE sender_id = ${user.id}`);
    await tx.execute(sql`DELETE FROM chat_backups WHERE thread_id IN (SELECT id FROM chat_threads WHERE customer_id = ${user.id})`);
    await tx.execute(sql`UPDATE chat_threads SET customer_id = ${surrogate} WHERE customer_id = ${user.id}`);
    await tx.update(wizardEstimateDrafts).set({ status: "REVOKED", payload: {}, updatedAt: now }).where(eq(wizardEstimateDrafts.claimedByUserId, user.id));

    await tx.insert(userConsentLogs).values({
      userId: user.id, sessionHash: null, consentType: "MARKETING", policyVersion: privacyPolicyVersion(), granted: false,
      preferences: { necessary: true, functional: false, analytics: false, marketing: false }, ipHash: input.ipHash,
      userAgentHash: input.userAgentHash, source: input.source,
      dedupeKey: `account-anonymized:${user.id}`,
    }).onConflictDoNothing({ target: userConsentLogs.dedupeKey });
    await tx.update(users).set({
      email: maskedEmail, name: surrogate, fullName: surrogate, phoneNumber: null, avatarUrl: null, passwordHash: null,
      utm_source: null, utm_medium: null, utm_campaign: null, lineUserId: null, lineLinkNonce: null,
      // Keep the opaque ERP customer binding so retained quotations remain
      // reconcilable for accounting and legal-hold workflows. Contact fields in
      // SolarDream are masked and provider cleanup is queued separately.
      lastEstimateDraft: null, listmonkSubscriberId: null, consentPreferences: preferences,
      isActive: false, deletionRequestedAt: user.deletionRequestedAt || now, anonymizedAt: now, retentionReviewAt: now,
    }).where(eq(users.id, user.id));
    return { alreadyAnonymized: false, anonymizedAt: now };
  });
}
