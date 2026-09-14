import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { activityLogs, paymentRequests, proposals, userNotifications, users } from "@/db/schema";
import { sendDiscordQuotationNegotiationAlert } from "@/lib/discord";
import { getQuotationDocumentNo } from "@/lib/erpnext";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";
import { publishPortalStateChanged } from "@/lib/portalEvents";

const MAX_REVISION_REQUEST_BODY_BYTES = 64 * 1024;

type RevisionRequestBody = {
  proposalId?: unknown;
  magicTokenSlug?: unknown;
  message?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function notifyStaff(input: {
  proposalId: string;
  customerName: string;
  documentNo: string;
  message: string;
}) {
  const staffUsers = await db.query.users.findMany({
    where: inArray(users.role, ["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"]),
    columns: { id: true },
  });

  if (staffUsers.length > 0) {
    await db.insert(userNotifications).values(staffUsers.map((staffUser) => ({
      userId: staffUser.id,
      featureKey: "PROPOSAL_REVISION_REQUESTED",
      title: "Customer requested quotation revision",
      message: `${input.customerName} requested changes for ${input.documentNo}.`,
      link: `/admin/crm/${input.proposalId}`,
      isRead: false,
    })));
  }

  void sendDiscordQuotationNegotiationAlert({
    proposalId: input.proposalId,
    documentNo: input.documentNo,
    customerName: input.customerName,
    message: input.message,
  }).catch((error) => {
    console.error("[Portal Revision] Discord notification failed:", error);
  });
}

export async function POST(request: NextRequest) {
  try {
    if (isRequestContentLengthExceeded(request.headers, MAX_REVISION_REQUEST_BODY_BYTES)) {
      return portalJson(
        { success: false, error: "Revision request payload is too large." },
        { status: 413 },
      );
    }

    const body = await request.json() as RevisionRequestBody;
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!proposalId || message.length < 3) {
      return portalJson(
        { success: false, error: "Please describe the requested revision." },
        { status: 400 },
      );
    }

    const access = await resolvePortalAccess({
      request,
      proposalId,
      capability: "revision:write",
      mutation: true,
    });
    if (!access) {
      return portalJson({ success: false, error: "Proposal not found or access denied." }, { status: 404 });
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, access.proposal.id),
      with: {
        user: {
          columns: {
            name: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!proposal) {
      return portalJson(
        { success: false, error: "Proposal not found or access denied." },
        { status: 404 },
      );
    }

    const paymentInProgress = await db.query.paymentRequests.findFirst({
      where: and(
        eq(paymentRequests.proposalId, proposal.id),
        inArray(paymentRequests.status, ["AWAITING_VERIFICATION", "PAID"]),
      ),
      columns: { id: true },
    });
    const paymentHasStarted = ["DEPOSIT_PAID", "FULLY_PAID"].includes(proposal.paymentStatus)
      || Boolean(paymentInProgress);
    if (paymentHasStarted) {
      return portalJson(
        {
          success: false,
          error: "Quotation revisions are unavailable after payment has been submitted or confirmed.",
        },
        { status: 409 },
      );
    }

    const requestedAt = new Date().toISOString();
    const currentConfig = asRecord(proposal.configurationData);
    const revisionRequests = Array.isArray(currentConfig.revisionRequests)
      ? currentConfig.revisionRequests
      : [];
    const customerName =
      proposal.user?.fullName ||
      proposal.user?.name ||
      proposal.user?.email ||
      "Customer";
    const documentNo = proposal.erpnextQuotationId || getQuotationDocumentNo(proposal.id);

    const [updatedProposal] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(proposals)
        .set({
          status: "REVISION_REQUESTED",
          dispatchStatus: "PENDING_DISPATCH",
          signatureUrl: null,
          signedAt: null,
          signedDocumentDriveUrl: null,
          configurationData: {
            ...currentConfig,
            customerApproval: {
              status: "REVISION_REQUESTED",
              requestedAt,
              source: access.mode === "guest" ? "guest-proposal-portal" : "customer-proposal-portal",
            },
            revisionRequests: [
              ...revisionRequests,
              {
                message,
                requestedAt,
                requestedBy: access.actorUserId,
              },
            ],
          },
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposal.id))
        .returning();

      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "REVISION_REQUESTED",
        description: `${customerName} requested quotation revision for ${documentNo}: ${message}`,
        userId: access.actorUserId,
      });

      return [updated];
    });

    await notifyStaff({
      proposalId: proposal.id,
      customerName,
      documentNo,
      message,
    });
    await publishPortalStateChanged(proposal.id, "REVISION_REQUESTED");

    revalidatePath(`/proposals/${proposal.magicTokenSlug}`);
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath(`/admin/quotations/${proposal.id}`);

    return portalJson({
      success: true,
      proposal: {
        status: updatedProposal.status,
        dispatchStatus: updatedProposal.dispatchStatus,
        updatedAt: updatedProposal.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Portal Revision Request]:", error);
    return portalJson(
      { success: false, error: "Failed to submit revision request." },
      { status: 500 },
    );
  }
}
