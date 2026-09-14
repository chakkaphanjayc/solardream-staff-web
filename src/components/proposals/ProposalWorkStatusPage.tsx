import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getUserProposals } from "@/app/actions/proposals";
import { getContactLinks } from "@/app/actions/contact";
import ProposalWorkStatusDashboard, { type ContactLink, type ProposalRecord } from "./ProposalWorkStatusDashboard";

export default async function ProposalWorkStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [proposalResult, contacts] = await Promise.all([getUserProposals(), getContactLinks(true)]);
  const proposals = proposalResult.success && proposalResult.proposals
    ? (proposalResult.proposals as unknown as ProposalRecord[])
    : [];
  const activeProposal = proposals[0] ?? null;

  return (
    <ProposalWorkStatusDashboard
      proposals={proposals}
      activeProposal={activeProposal}
      contactLinks={contacts as ContactLink[]}
    />
  );
}
