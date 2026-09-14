import { ACCOUNT_DELETION_CONFIRMATION, isAccountDeletionConfirmed, redactPersonalData, retentionEligibility } from "../../src/lib/privacyRedaction";

if (!isAccountDeletionConfirmed(ACCOUNT_DELETION_CONFIRMATION) || isAccountDeletionConfirmed("DELETE")) throw new Error("Deletion confirmation contract failed.");
const redacted = redactPersonalData({ email: "person@example.com", customerEmail: "person@example.com", nested: { phone: "0800000000", installationMapAddress: "private", watts: 5000 }, panels: 12 }) as Record<string, unknown>;
if (redacted.email !== "[REDACTED]" || redacted.customerEmail !== "[REDACTED]" || (redacted.nested as Record<string, unknown>).phone !== "[REDACTED]" || (redacted.nested as Record<string, unknown>).installationMapAddress !== "[REDACTED]" || redacted.panels !== 12) throw new Error("Recursive redaction contract failed.");
const cutoff = new Date("2025-01-01T00:00:00Z");
const eligible = retentionEligibility({ lastActivityAt: new Date("2020-01-01T00:00:00Z"), newestProposalActivityAt: null, cutoff, proposalStatuses: ["CLOSED"], hasCurrentWarranty: false, hasLegalHold: false });
const protectedRecord = retentionEligibility({ lastActivityAt: new Date("2020-01-01T00:00:00Z"), newestProposalActivityAt: null, cutoff, proposalStatuses: ["ACTIVE"], hasCurrentWarranty: false, hasLegalHold: false });
const unknownWorkflow = retentionEligibility({ lastActivityAt: new Date("2020-01-01T00:00:00Z"), newestProposalActivityAt: null, cutoff, proposalStatuses: ["NEW_OPERATIONAL_STATE"], hasCurrentWarranty: false, hasLegalHold: false });
if (!eligible.eligibleForAnonymization || protectedRecord.eligibleForAnonymization || unknownWorkflow.eligibleForAnonymization) throw new Error("Retention eligibility contract failed.");
process.stdout.write("Privacy deletion, redaction, and retention contracts passed.\n");
