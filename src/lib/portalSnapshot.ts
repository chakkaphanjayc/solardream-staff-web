import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  paymentRequests,
  quotationDeliveryDocuments,
  quotationDocumentRequests,
} from "@/db/schema";
import type { PortalAccess } from "@/lib/portalAccess";
import { loadInstallationSnapshot } from "@/lib/installationWorkflow";

export async function loadPortalSnapshot(access: PortalAccess) {
  const [documentRequests, deliveryDocuments, billingRequests, installation] = await Promise.all([
    db.query.quotationDocumentRequests.findMany({
      where: eq(quotationDocumentRequests.quotationId, access.proposal.id),
      orderBy: [asc(quotationDocumentRequests.createdAt)],
      with: {
        attachments: {
          orderBy: (attachments, { asc: orderAscending }) => [orderAscending(attachments.createdAt)],
        },
      },
    }),
    db.query.quotationDeliveryDocuments.findMany({
      where: and(
        eq(quotationDeliveryDocuments.quotationId, access.proposal.id),
        ne(quotationDeliveryDocuments.status, "ARCHIVED"),
      ),
      orderBy: [asc(quotationDeliveryDocuments.createdAt)],
      with: {
        attachments: {
          orderBy: (attachments, { asc: orderAscending }) => [orderAscending(attachments.createdAt)],
        },
      },
    }),
    db.query.paymentRequests.findMany({
      where: eq(paymentRequests.proposalId, access.proposal.id),
    }),
    loadInstallationSnapshot(access.proposal.id, {
      userId: access.actorUserId,
      mode: access.mode === "guest" ? "GUEST" : "MEMBER",
      role: "CUSTOMER",
    }),
  ]);
  return {
    proposal: access.proposal,
    documentRequests,
    deliveryDocuments,
    paymentRequests: billingRequests,
    installation,
    accessMode: access.mode,
  };
}
