import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { canAccessSalesResource } from "../../auth/sales-scope-policy";
import { normalizeERPNextEnvelope } from "../../integrations/erpnext-gateway";
import { hashWebhookBody, verifyRawWebhookSignature, verifyWebhook } from "../../integrations/webhook-verifier";
import { createCommercialDocument, type CommercialOperation } from "../commercial-orchestration-service";
import { matchDuplicateCustomer } from "../duplicate-matcher";
import { ingestInboundDeal, InboundIdempotencyConflict, type StoredInboundDeal } from "../inbound-deal-service";
import { validateSignatureEvidence } from "../signature-evidence-service";
import { evaluateHandoffReadiness } from "../handoff-readiness";
import { validateSalesHandoff } from "../sales-handoff";

async function main() {
let assertions = 0;
const check = (condition: unknown, message?: string) => { assertions += 1; assert.ok(condition, message); };

const candidates = [
  { id: "a", erpnextCustomerId: "ERP-1", normalizedEmail: "shared@example.com" },
  { id: "b", normalizedEmail: "shared@example.com", normalizedPhone: "66811111111" },
];
assert.deepEqual(matchDuplicateCustomer({ erpnextCustomerId: "ERP-1" }, candidates), { kind: "EXACT_PROVIDER", customerId: "a" }); assertions += 1;
assert.equal(matchDuplicateCustomer({ normalizedEmail: "shared@example.com" }, candidates).kind, "AMBIGUOUS"); assertions += 1;
assert.equal(matchDuplicateCustomer({ normalizedPhone: "66811111111" }, candidates).kind, "CONTACT_MATCH"); assertions += 1;

const rows = new Map<string, StoredInboundDeal>();
const inboundRepo = { find: async (key: string) => rows.get(key) ?? null, create: async (key: string, payloadHash: string) => { const row = { dealId: "deal-1", payloadHash }; rows.set(key, row); return row; } };
const inbound = { source: "web", externalRequestId: "lead-1", payload: { watts: 5000, customer: "Ada" } };
assert.equal((await ingestInboundDeal(inboundRepo, inbound)).replayed, false); assertions += 1;
assert.deepEqual(await ingestInboundDeal(inboundRepo, { ...inbound, payload: { customer: "Ada", watts: 5000 } }), { dealId: "deal-1", replayed: true }); assertions += 1;
await assert.rejects(() => ingestInboundDeal(inboundRepo, { ...inbound, payload: { watts: 6000 } }), InboundIdempotencyConflict); assertions += 1;
const concurrentRows = new Map<string, StoredInboundDeal>();
const concurrentRepo = {
  find: async (key: string) => concurrentRows.get(key) ?? null,
  create: async (key: string, payloadHash: string) => {
    await Promise.resolve();
    if (concurrentRows.has(key)) throw new Error("unique violation");
    const row = { dealId: "deal-concurrent", payloadHash };
    concurrentRows.set(key, row);
    return row;
  },
};
const concurrent = await Promise.all([ingestInboundDeal(concurrentRepo, inbound), ingestInboundDeal(concurrentRepo, inbound)]);
assert.deepEqual(new Set(concurrent.map(({ dealId }) => dealId)), new Set(["deal-concurrent"])); assertions += 1;

const hash = "a".repeat(64);
check(validateSignatureEvidence({ signerIdentity: { id: "u1" }, verifiedContact: { email: "a@example.com" }, consentVersion: "v1", signedAt: "2026-01-01T00:00:00.000Z", signatureStorageReference: "sig/1", documentHash: hash, auditReference: "audit/1" }, hash, new Date("2026-01-02")).documentHash === hash);
await assert.rejects(async () => validateSignatureEvidence({ signerIdentity: { id: "u1" }, verifiedContact: { email: "a@example.com" }, consentVersion: "v1", signedAt: "2026-01-01T00:00:00.000Z", signatureStorageReference: "sig/1", documentHash: hash, auditReference: "audit/1" }, "b".repeat(64))); assertions += 1;

assert.equal(normalizeERPNextEnvelope({ data: { name: " QTN-1 ", status: "Open" } })?.providerId, "QTN-1"); assertions += 1;
assert.equal(normalizeERPNextEnvelope({ message: { name: "SO-1" } })?.providerId, "SO-1"); assertions += 1;
assert.equal(normalizeERPNextEnvelope({ name: "PR-1", status: 1 })?.status, null); assertions += 1;
assert.equal(normalizeERPNextEnvelope({ data: {} }), null); assertions += 1;

const rawBody = Buffer.from('{"status":"paid"}');
const timestamp = "1787961600";
const signature = createHmac("sha256", "secret").update(timestamp).update(".").update(rawBody).digest("hex");
const claims = new Map<string, string>();
const replayStore = { claim: async (eventId: string, bodyHash: string) => { const prior = claims.get(eventId); if (!prior) { claims.set(eventId, bodyHash); return "CLAIMED" as const; } return prior === bodyHash ? "REPLAY" as const : "CONFLICT" as const; } };
const verification = { rawBody, signature, timestamp, eventId: "evt-1", secret: "secret", now: new Date("2026-08-29T00:00:00Z") };
assert.equal((await verifyWebhook(verification, replayStore)).replayed, false); assertions += 1;
assert.equal((await verifyWebhook(verification, replayStore)).replayed, true); assertions += 1;
await assert.rejects(() => verifyWebhook({ ...verification, signature: "0".repeat(64) }, replayStore)); assertions += 1;
const changedBody = Buffer.from('{"status":"failed"}');
const changedSignature = createHmac("sha256", "secret").update(timestamp).update(".").update(changedBody).digest("hex");
await assert.rejects(() => verifyWebhook({ ...verification, rawBody: changedBody, signature: changedSignature }, replayStore)); assertions += 1;
const isoTimestamp = "2026-08-29T00:00:00.000Z";
const isoSignature = createHmac("sha256", "secret").update(isoTimestamp).update(".").update(rawBody).digest("hex");
const isoClaims = new Map<string, string>();
const isoReplayStore = { claim: async (eventId: string, bodyHash: string) => { const prior = isoClaims.get(eventId); if (!prior) { isoClaims.set(eventId, bodyHash); return "CLAIMED" as const; } return prior === bodyHash ? "REPLAY" as const : "CONFLICT" as const; } };
assert.equal((await verifyWebhook({ ...verification, timestamp: isoTimestamp, signature: isoSignature, eventId: "evt-iso" }, isoReplayStore)).replayed, false); assertions += 1;
const rawSignature = createHmac("sha256", "secret").update(rawBody).digest("hex").toUpperCase();
verifyRawWebhookSignature({ rawBody, signature: `sha256=${rawSignature}`, secret: "secret" }); assertions += 1;
assert.equal(hashWebhookBody(rawBody).length, 64); assertions += 1;
await assert.rejects(async () => verifyRawWebhookSignature({ rawBody, signature: "0".repeat(64), secret: "secret" })); assertions += 1;

const resource = { ownerUserId: "owner", assignments: [{ userId: "rep", active: true }, { userId: "old", active: true, expiresAt: new Date("2020-01-01") }] };
check(canAccessSalesResource({ active: true, userId: "rep", permissions: ["sales:read:own"] }, resource, "sales:read"));
check(!canAccessSalesResource({ active: true, userId: "rep", permissions: ["sales:read:own"] }, resource, "sales:write"));
check(!canAccessSalesResource({ active: true, userId: "old", permissions: ["sales:read"] }, resource, "sales:read"));
check(canAccessSalesResource({ active: true, userId: "admin", permissions: ["*"] }, resource, "sales:write"));
check(!canAccessSalesResource({ active: false, userId: "admin", permissions: ["*"] }, resource, "sales:write"));

const handoff = { dealId: "d", acceptedProposalRevision: { id: "r", proposalId: "p", revisionNumber: 1 }, customer: { userId: "u", name: "Ada" }, site: { label: "Home", addressLine1: "1 Main" }, erpSalesOrderReference: "SO-1", paymentSnapshot: { status: "FULLY_PAID" as const }, configurationSnapshot: { panels: 10 }, documentManifest: [{ kind: "ACCEPTED_PROPOSAL", reference: "doc/1" }], readinessPolicyVersion: "SD-HANDOFF-2026-V1", status: "READY" as const, idempotencyKey: "handoff-1" };
check(evaluateHandoffReadiness(validateSalesHandoff(handoff)).ready);
assert.throws(() => validateSalesHandoff({ ...handoff, configurationSnapshot: { equipment: [{ providerPayload: { token: "secret" } }] } })); assertions += 1;
const notReady = evaluateHandoffReadiness(validateSalesHandoff({ ...handoff, erpSalesOrderReference: undefined, paymentSnapshot: { status: "UNPAID" }, documentManifest: [], status: "PENDING" }));
assert.deepEqual(notReady.unmetConditions.map(({ code }) => code), ["ERP_SALES_ORDER", "PAYMENT_FULLY_PAID", "DOCUMENTS", "READY_STATUS"]); assertions += 1;

const revisionMigration = await readFile("drizzle/0108_proposal_revisions.sql", "utf8");
check(revisionMigration.includes("guard_proposal_revision_immutability"));
check(revisionMigration.includes("guard_proposal_revision_item_immutability"));
check(revisionMigration.includes("guard_signature_evidence_immutability"));
check(revisionMigration.includes("ON CONFLICT (proposal_id, revision_number) DO NOTHING"));

class FakeERPNext {
  calls: CommercialOperation[] = [];
  fail = true;
  async create(operation: CommercialOperation) { this.calls.push(operation); if (this.fail) throw new Error("provider unavailable"); return { providerId: `${operation}-1`, status: "created" }; }
}
const provider = new FakeERPNext();
const recorded: CommercialOperation[] = [];
const recorder = { recordConfirmed: async (operation: CommercialOperation) => { recorded.push(operation); } };
await assert.rejects(() => createCommercialDocument(provider, recorder, "QUOTATION", "deal-1:q")); assertions += 1;
assert.deepEqual(recorded, []); assertions += 1;
provider.fail = false;
for (const operation of ["QUOTATION", "SALES_ORDER", "PAYMENT_REQUEST"] as const) {
  await createCommercialDocument(provider, recorder, operation, `deal-1:${operation}`);
  assert.equal(recorded.at(-1), operation); assertions += 1;
}

console.log(`Sales V2 foundation: ${assertions} focused assertions passed.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
