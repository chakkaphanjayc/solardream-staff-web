"use client";

import { DollarSign, Zap, TrendingUp, Calendar, CreditCard, Sparkles } from "@/components/ui/icons";
import { formatPrice } from "@/lib/utils";
import type { ClientProposal } from "@/types/proposals";
import { useTranslations } from "next-intl";

interface ProposalFinancialsCardProps {
  proposal: ClientProposal;
}

export function ProposalFinancialsCard({ proposal }: ProposalFinancialsCardProps) {
  const t = useTranslations("ProposalFinancials");
  const financing = proposal.selectedFinancing;

  return (
    <section className="space-y-5 rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between border-b border-[#8E8B83]/15 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DCE8F5] text-[#2E2C27] shadow-xs">
            <DollarSign className="h-5 w-5 stroke-[2.5]" />
          </div>
          <h2 className="text-base font-bold text-[#1C1C1A]">{t("title")}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8E8B83]/15 bg-[#F0EEE9] px-3.5 py-1 text-[11px] font-bold uppercase text-[#1C1C1A] shadow-xs">
          <Sparkles className="h-3.5 w-3.5 text-[#4F7FA8] stroke-[2.5]" />
          {t("guaranteed")}
        </span>
      </div>

      {/* Prominent Price Display */}
      <div className="space-y-1 rounded-2xl bg-[#B7D1EA] p-5 text-white shadow-md">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">{t("totalInvestment")}</span>
        <div className="text-3xl font-bold tracking-tight text-white">
          {formatPrice(proposal.totalPrice)}
        </div>
        <p className="pt-1 text-xs font-medium text-white/80">
          {t("included")}
        </p>
      </div>

      {/* Financial Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="space-y-1 rounded-2xl border border-[#8E8B83]/15 bg-[#F0EEE9] p-3.5 shadow-xs">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">
            <Zap className="h-3.5 w-3.5 text-[#4F7FA8] stroke-[2.5]" />
            {t("systemSize")}
          </span>
          <p className="text-sm font-bold text-[#1C1C1A]">
            {proposal.systemSizeKwp.toFixed(2)} kWp
          </p>
        </div>

        <div className="space-y-1 rounded-2xl border border-[#8E8B83]/15 bg-[#F0EEE9] p-3.5 shadow-xs">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
            {t("monthlySavings")}
          </span>
          <p className="text-sm font-bold text-[#1C1C1A]">
            {proposal.monthlySavings ? formatPrice(proposal.monthlySavings) : "฿3,500 - ฿5,200"}
          </p>
        </div>

        <div className="space-y-1 rounded-2xl border border-[#8E8B83]/15 bg-[#F0EEE9] p-3.5 shadow-xs">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">
            <Calendar className="h-3.5 w-3.5 text-[#4F7FA8] stroke-[2.5]" />
            {t("paybackPeriod")}
          </span>
          <p className="text-sm font-bold text-[#1C1C1A]">
            {proposal.paybackPeriod ? t("years", { count: proposal.paybackPeriod }) : t("paybackFallback")}
          </p>
        </div>

        <div className="space-y-1 rounded-2xl border border-[#8E8B83]/15 bg-[#F0EEE9] p-3.5 shadow-xs">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">
            <CreditCard className="h-3.5 w-3.5 text-[#4F7FA8] stroke-[2.5]" />
            {t("panelUnits")}
          </span>
          <p className="text-sm font-bold text-[#1C1C1A]">
            {t("panels", { count: proposal.panelCount })}
          </p>
        </div>
      </div>

      {/* Financing Tag */}
      {financing && (
        <div className="space-y-1 rounded-2xl border border-[#8E8B83]/15 bg-[#DCE8F5]/40 p-4 text-xs font-medium text-[#1C1C1A]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">{t("paymentOption")}</span>
            <span className="rounded-full bg-[#DCE8F5] px-3 py-0.5 text-[10px] font-bold text-[#2E2C27]">
              {financing.providerName}
            </span>
          </div>
          <p className="text-sm font-bold text-[#1C1C1A]">
            {financing.marketingTag || financing.financeType}
          </p>
          {financing.maxTermMonths && (
            <p className="text-[11px] font-medium text-[#4E4B44]">
              {t("installment", { months: financing.maxTermMonths, rate: financing.interestRate ? `${financing.interestRate}%` : t("standardRate") })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
