import Link from "next/link";
import { ArrowLeft, BadgePercent } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db";
import { financingOptions } from "@/db/schema";
import { desc } from "drizzle-orm";
import FinancingOptionsClient from "./FinancingOptionsClient";

export default async function FinancingSettingsPage() {
  await requireAdmin();

  const records = await db.query.financingOptions.findMany({
    orderBy: [desc(financingOptions.isActive), desc(financingOptions.createdAt)],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-300">
            <BadgePercent className="h-4 w-4 text-[#B7D1EA]" />
            Financing config
          </div>
        </div>
        <h1 className="text-2xl font-black text-gray-100 tracking-tight">
          Your Financial Plan Settings
        </h1>
        <p className="text-sm text-gray-400">
          Configure bank loans, promotions, leasing, and PPA options that appear in the summary page.
        </p>
      </div>

      <FinancingOptionsClient
        initialFinancingOptions={records.map((record) => ({
          id: record.id,
          providerName: record.providerName,
          financeType: record.financeType,
          interestRate: record.interestRate,
          maxTermMonths: record.maxTermMonths,
          minSystemCost: record.minSystemCost,
          eligibilityRules: record.eligibilityRules,
          marketingTag: record.marketingTag,
          isActive: record.isActive,
          createdAt: record.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
