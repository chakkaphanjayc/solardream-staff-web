"use client";

import GuestProposalSignView from "@/app/[locale]/proposals/[id]/GuestProposalSignView";
import type { ClientDeliveryDocument, ClientDocumentRequest, ClientPaymentInstructions, ClientPaymentRequest, ClientProposal } from "@/types/proposals";
import type { WarrantyDisclosureTemplateConfig } from "@/lib/quotationDocumentTemplates";

export type ProposalDetailPresentation = "fullscreen" | "embedded";

export interface ProposalDetailViewProps {
  proposal: ClientProposal;
  magicTokenSlug?: string | null;
  initialDocumentRequests?: ClientDocumentRequest[];
  initialDeliveryDocuments?: ClientDeliveryDocument[];
  initialPaymentRequests?: ClientPaymentRequest[];
  paymentInstructions?: ClientPaymentInstructions;
  presentation?: ProposalDetailPresentation;
  showAccountCta?: boolean;
  warrantyTemplates?: WarrantyDisclosureTemplateConfig[];
}

/** Canonical proposal detail surface shared by portal links and authenticated history. */
export default function ProposalDetailView(props: ProposalDetailViewProps) {
  return <GuestProposalSignView {...props} />;
}
