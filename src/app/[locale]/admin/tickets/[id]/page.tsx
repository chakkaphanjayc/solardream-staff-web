import React from "react";
import Link from "next/link";
import { requireStaff } from "@/lib/auth-guard";
import { getOperationsTicketById } from "@/app/actions/tickets";
import TicketDetailClient from "./TicketDetailClient";

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  await requireStaff();
  const { id } = await params;

  const result = await getOperationsTicketById(id);

  if (!result.success || !result.ticket) {
    return (
      <div className="max-w-4xl mx-auto p-6 md:p-8">
        <div className="bg-[#0F172A] border border-rose-200 rounded-2xl p-12 text-center">
          <h1 className="text-2xl font-black text-rose-900 uppercase">
            Ticket Not Found
          </h1>
          <p className="text-gray-400 mt-2">
            {result.error || "The requested ticket could not be found."}
          </p>
          <Link
            href="/admin/tickets"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#B7D1EA] text-white font-bold rounded-xl mt-6 hover:bg-[#99BFE3] transition-all"
          >
            ← Back to Tickets
          </Link>
        </div>
      </div>
    );
  }

  return <TicketDetailClient ticket={result.ticket} />;
}
