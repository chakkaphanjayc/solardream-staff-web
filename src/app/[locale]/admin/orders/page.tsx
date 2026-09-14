import { getAllProposals } from "@/app/actions/proposals";
import { requireStaff } from "@/lib/auth-guard";
import { GsapReveal } from "@/components/ui/GsapMotion";
import { Award } from "@/components/ui/icons";
import OrdersTableClient, { type AdminOrderProposal } from "./OrdersTableClient";

interface PageProps {
  params: Promise<{
    locale: string;
  }>;
}

export default async function AdminOrdersPage({ params }: PageProps) {
  const { locale } = await params;
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const { proposals = [] } = await getAllProposals();
  const orderRows = proposals as AdminOrderProposal[];

  return (
    <GsapReveal className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-sans text-4xl font-black tracking-tight text-gray-100">
            Proposal <span className="text-[#B7D1EA]">CRM & Orders</span>
          </h1>
          <p className="mt-1 text-xs font-black uppercase tracking-widest text-gray-400">
            Monitor generated customer proposals and manage their pipeline status.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start rounded-2xl border border-[#1E293B] bg-[#0F172A] px-4 py-2.5 text-[10px] font-mono font-black uppercase text-gray-400 shadow-none sm:self-auto">
          <Award className="h-4 w-4 text-[#B7D1EA]" />
          <span>{orderRows.length} Proposals Saved</span>
        </div>
      </div>

      <OrdersTableClient locale={locale} proposals={orderRows} isAdmin={isAdmin} />
    </GsapReveal>
  );
}
