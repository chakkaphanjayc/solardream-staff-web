import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  proposalRevisionItems,
  proposalRevisions,
  proposals,
  signatureEnvelopes,
} from "@/db/schema";
import type {
  CommercialSnapshots,
  ProposalRevisionItemInput,
  SignatureAuditMetadata,
} from "@/types/proposal-revisions";

const lockedStatuses = ["SENT", "VIEWED", "ACCEPTED"] as const;

export class CommercialRevisionLockedError extends Error {
  readonly code = "COMMERCIAL_REVISION_LOCKED";
  constructor() {
    super(
      "This commercial document has been sent and is immutable. Create a new revision to make changes.",
    );
  }
}

export function assertCommercialMutationAllowed(status: string): void {
  if ((lockedStatuses as readonly string[]).includes(status))
    throw new CommercialRevisionLockedError();
}

export async function createProposalRevision(input: {
  proposalId: string;
  snapshots: CommercialSnapshots;
  items?: ProposalRevisionItemInput[];
  erpQuotationReference?: string | null;
  pdfDocumentReference?: string | null;
  documentHash?: string | null;
  createdByUserId?: string | null;
  creationSource: string;
  creationMetadata?: Record<string, unknown>;
  commercial?: {
    catalogVersionId: string;
    priceListCode: string;
    currency: string;
    taxRuleCode: string | null;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    totalMinor: number;
  };
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`proposal-revision:${input.proposalId}`}))`,
    );
    const proposal = await tx.query.proposals.findFirst({
      where: eq(proposals.id, input.proposalId),
    });
    if (!proposal) throw new Error("Proposal not found.");

    const latest = await tx.query.proposalRevisions.findFirst({
      where: eq(proposalRevisions.proposalId, input.proposalId),
      orderBy: [desc(proposalRevisions.revisionNumber)],
    });
    const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
    const [revision] = await tx
      .insert(proposalRevisions)
      .values({
      proposalId: input.proposalId,
      revisionNumber,
        ...input.commercial,
      pricingSnapshot: input.snapshots.pricing,
      configurationSnapshot: input.snapshots.configuration,
      termsSnapshot: input.snapshots.terms,
      paymentSnapshot: input.snapshots.payment,
      erpQuotationReference: input.erpQuotationReference,
      pdfDocumentReference: input.pdfDocumentReference,
      documentHash: input.documentHash,
      createdByUserId: input.createdByUserId,
      creationSource: input.creationSource,
      creationMetadata: input.creationMetadata ?? {},
      })
      .returning();
    if (!revision) throw new Error("Unable to create proposal revision.");

    if (input.items?.length) {
      await tx.insert(proposalRevisionItems).values(
        input.items.map((item) => ({
        revisionId: revision.id,
        lineNumber: item.lineNumber,
        itemCode: item.itemCode,
        pricingSnapshot: item.pricing,
        configurationSnapshot: item.configuration ?? {},
        metadata: item.metadata ?? {},
        })),
      );
    }

    // Keep the established aggregate readable by legacy consumers; the revision is authoritative.
    await tx
      .update(proposals)
      .set({
      revisionNumber,
      configurationData: input.snapshots.configuration,
        totalPrice:
          typeof input.snapshots.pricing.totalPrice === "number"
            ? input.snapshots.pricing.totalPrice
            : proposal.totalPrice,
      erpnextQuotationId: input.erpQuotationReference,
      revisedPdfUrl: input.pdfDocumentReference,
      status: "DRAFT",
      dispatchStatus: "PENDING_DISPATCH",
      updatedAt: new Date(),
      })
      .where(eq(proposals.id, input.proposalId));
    return revision;
  });
}

export async function transitionProposalRevision(input: {
  revisionId: string;
  to: "SENT" | "VIEWED";
  documentHash?: string;
  pdfDocumentReference?: string;
}) {
  return db.transaction(async (tx) => {
    const revision = await tx.query.proposalRevisions.findFirst({
      where: eq(proposalRevisions.id, input.revisionId),
    });
    if (!revision) throw new Error("Proposal revision not found.");
    const now = new Date();
    if (input.to === "SENT") {
      if (revision.status !== "DRAFT")
        throw new Error("Only a draft revision can be sent.");
      const hash = input.documentHash?.toLowerCase() ?? revision.documentHash;
      if (!hash || !/^[0-9a-f]{64}$/.test(hash))
        throw new Error("A SHA-256 document hash is required before sending.");
      const [updated] = await tx
        .update(proposalRevisions)
        .set({
          status: "SENT",
          sentAt: now,
          documentHash: hash,
          pdfDocumentReference:
            input.pdfDocumentReference ?? revision.pdfDocumentReference,
        })
        .where(
          and(
            eq(proposalRevisions.id, revision.id),
            eq(proposalRevisions.status, "DRAFT"),
          ),
        )
        .returning();
      return updated;
    }
    if (revision.status !== "SENT" && revision.status !== "VIEWED")
      throw new Error("Only a sent revision can be viewed.");
    const [updated] = await tx
      .update(proposalRevisions)
      .set({ status: "VIEWED", viewedAt: revision.viewedAt ?? now })
      .where(eq(proposalRevisions.id, revision.id))
      .returning();
    return updated;
  });
}

export async function acceptProposalRevision(input: {
  revisionId: string;
  signerIdentity: Record<string, unknown>;
  verifiedContact: Record<string, unknown>;
  signedAt: Date;
  consentVersion: string;
  signatureStorageReference: string;
  documentHash: string;
  auditMetadata?: SignatureAuditMetadata;
}) {
  return db.transaction(async (tx) => {
    const revision = await tx.query.proposalRevisions.findFirst({
      where: eq(proposalRevisions.id, input.revisionId),
    });
    if (!revision || !["SENT", "VIEWED"].includes(revision.status))
      throw new Error("This revision is not available for acceptance.");
    if (
      !revision.documentHash ||
      revision.documentHash !== input.documentHash.toLowerCase()
    )
      throw new Error(
        "The signed document does not match this proposal revision.",
      );
    const [envelope] = await tx
      .insert(signatureEnvelopes)
      .values({
        ...input,
        documentHash: input.documentHash.toLowerCase(),
        status: "SIGNED",
        auditMetadata: input.auditMetadata ?? {},
      })
      .returning();
    await tx
      .update(proposalRevisions)
      .set({ status: "ACCEPTED", acceptedAt: input.signedAt })
      .where(eq(proposalRevisions.id, revision.id));
    return envelope;
  });
}
