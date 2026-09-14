"use client";

import Image from "next/image";
import { ShieldCheck, Zap, Sparkles } from "@/components/ui/icons";
import type { ClientProposal } from "@/types/proposals";
import { useTranslations } from "next-intl";

interface ProposalBentoHeroProps {
  proposal: ClientProposal;
  customerName: string;
  trackRequestNumber: string;
  isSigned: boolean;
}

export function ProposalBentoHero({
  proposal,
  customerName,
  trackRequestNumber,
  isSigned,
}: ProposalBentoHeroProps) {
  const t = useTranslations("ProposalHero");
  const quotationId = proposal.erpnextQuotationId || `SD-QT-${proposal.id.slice(0, 8).toUpperCase()}`;

  return (
    <section className="rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left: Solia Avatar & Greeting */}
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-[#8E8B83]/20 bg-[#DCE8F5] p-2 shadow-xs sm:h-20 sm:w-20">
            <Image
              src={isSigned ? "/asset/solia-greeting.webp" : "/asset/solia-blueprint.webp"}
              alt={t("soliaAlt")}
              fill
              sizes="80px"
              className="object-contain"
              priority
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#B7D1EA] px-3.5 py-1 text-[11px] font-bold uppercase text-white shadow-xs">
                <Sparkles className="h-3.5 w-3.5 text-white stroke-[2.5]" />
                {t("officialQuotation")}
              </span>
              {isSigned && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3.5 py-1 text-[11px] font-bold uppercase text-emerald-800 shadow-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-800 stroke-[2.5]" />
                  {t("verifiedSigned")}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1C1C1A] md:text-3xl">
              {customerName}
            </h1>
            <p className="text-xs font-medium text-[#4E4B44]">
              {t("soliaLabel")}: {isSigned ? t("signedGreeting") : t("unsignedGreeting")}
            </p>
          </div>
        </div>

        {/* Right: Quick Stats Strip */}
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <div className="flex flex-col justify-center rounded-2xl border border-[#8E8B83]/20 bg-[#F0EEE9] px-4 py-2.5 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">{t("quotationId")}</span>
            <span className="text-sm font-bold text-[#1C1C1A] font-mono">{quotationId}</span>
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-[#8E8B83]/20 bg-[#F0EEE9] px-4 py-2.5 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">{t("trackRef")}</span>
            <span className="text-sm font-bold text-[#1C1C1A] font-mono">{trackRequestNumber}</span>
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-[#8E8B83]/20 bg-[#DCE8F5] px-4 py-2.5 shadow-xs">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#2E2C27]">
              <Zap className="h-3.5 w-3.5 text-[#4F7FA8] stroke-[2.5]" />
              {t("systemCapacity")}
            </span>
            <span className="text-sm font-bold text-[#2E2C27]">{proposal.systemSizeKwp.toFixed(2)} kWp</span>
          </div>
        </div>
      </div>
    </section>
  );
}
