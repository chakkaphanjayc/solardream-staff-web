import "server-only";

import { sendConfiguredTemplateEmail } from "@/lib/email";

export type AutomatedProposalData = {
  customerName: string;
  proposalId?: string;
  submissionType?: "installation" | "purchase-only";
  wizardAnswers: { propertyType: string; monthlyBill: number; systemkWp: number };
  recommendedBundle: Array<{ categoryName: string; productName: string; quantity: number; unitPrice: number; totalPrice: number }>;
  financialPlan: { selectedFinancingId: string; preferredLoanTermMonths?: number; downPaymentAmount?: number };
  totalPrice: number;
};

export async function sendAutomatedProposal(customerEmail: string, data: AutomatedProposalData) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://solar-dream.org").replace(/\/$/, "");
  return sendConfiguredTemplateEmail({
    templateKey: "proposal_ready",
    to: customerEmail,
    values: {
      customer_name: data.customerName,
      customer_email: customerEmail,
      proposal_id: data.proposalId || "",
      document_no: data.proposalId || "",
      submission_type: data.submissionType || "",
      property_type: data.wizardAnswers.propertyType,
      system_size_kwp: data.wizardAnswers.systemkWp,
      monthly_bill: data.wizardAnswers.monthlyBill,
      total_price: data.totalPrice,
      amount: data.totalPrice,
      payment_method: data.financialPlan.selectedFinancingId,
      loan_term_months: data.financialPlan.preferredLoanTermMonths ?? "",
      down_payment: data.financialPlan.downPaymentAmount ?? "",
      item_count: data.recommendedBundle.reduce((total, item) => total + item.quantity, 0),
      action_url: `${siteUrl}/th/proposals/${data.proposalId || ""}`,
      site_url: siteUrl,
    },
  });
}
