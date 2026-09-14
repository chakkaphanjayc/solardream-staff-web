import Link from "next/link";
import { ArrowLeft, BadgePercent, ReceiptText } from "@/components/ui/icons";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db";
import { financingOptions } from "@/db/schema";
import { getServiceFeeConfigs } from "@/app/actions/serviceFees";
import FinancingOptionsClient from "../financing/FinancingOptionsClient";
import ServiceFeesClient from "../ServiceFeesClient";


type ServiceFeeConfigRow = {
  id: string;
  name: string;
  erpItemCode: string;
  basePrice: number;
  isActive: boolean;
  createdAt: Date;
};

export default async function QuotationSettingsPage() {
  await requireAdmin();

  const [financingRecords, serviceFeeResult] = await Promise.all([
    db.query.financingOptions.findMany({
      orderBy: [desc(financingOptions.isActive), desc(financingOptions.createdAt)],
    }),
    getServiceFeeConfigs(),
  ]);

  const serviceFees =
    serviceFeeResult.success && serviceFeeResult.serviceFees ? serviceFeeResult.serviceFees : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-300">
            <BadgePercent className="h-4 w-4 text-[#B7D1EA]" />
            Quotation Settings
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-gray-100">
              Financial Plans & Fee Catalog
            </h1>
            <p className="max-w-3xl text-sm font-medium leading-6 text-gray-400">
              Configure the financing programs that drive the wizard plus the service fee table used when generating quotation totals.
            </p>
          </div>
        </div>

        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <div className="space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">Financing Plans</p>
            <h2 className="mt-2 text-2xl font-black text-gray-100">Your Financial Plan config</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
              Manage bank offers, promotions, and payment programs shown in the solar wizard summary.
            </p>
          </div>
          <ReceiptText className="h-6 w-6 text-[#B7D1EA]" />
        </div>

        <FinancingOptionsClient
          initialFinancingOptions={financingRecords.map((record) => ({
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

        <ServiceFeesClient
          initialServiceFees={serviceFees.map((fee: ServiceFeeConfigRow) => ({
            id: fee.id,
            name: fee.name,
            erpItemCode: fee.erpItemCode,
            basePrice: fee.basePrice,
            isActive: fee.isActive,
            createdAt: fee.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
