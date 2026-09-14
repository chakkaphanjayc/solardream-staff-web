"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Download, FileText } from "@/components/ui/icons";
import { isLocale, toIntlLocale } from "@/i18n/locales";
import { formatPrice } from "@/lib/utils";

interface Proposal {
  id: string;
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  monthlySavings: number;
  paybackPeriod: string;
  pdfUrl: string | null;
  status: string;
  createdAt: string | Date;
}

function getSignedProposalDocumentUrl(proposalId: string, download = false) {
  return `/api/proposals/${proposalId}/signed-document${download ? "?download=1" : ""}`;
}

function getStatusVariant(status: string): BadgeProps["variant"] {
  const normalizedStatus = status.toUpperCase();
  if (normalizedStatus === "ACCEPTED" || normalizedStatus === "SIGNED") return "success";
  if (normalizedStatus === "SENT") return "info";
  return "neutral";
}

export default function ProposalsTab({ proposals }: { proposals: Proposal[] }) {
  const t = useTranslations("ProposalsTab");
  const locale = useLocale();
  const intlLocale = toIntlLocale(isLocale(locale) ? locale : "th");

  if (!proposals || proposals.length === 0) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center px-4 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
          <FileText className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-xl font-bold tracking-tight text-[#2E2C27]">{t("empty.title")}</h2>
        <p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-[#4E4B44]">
          {t("empty.description")}
        </p>
        <Button asChild className="mt-6 rounded-full bg-[#B7D1EA] text-white hover:bg-[#A5C2DE]">
          <Link href={`/${locale}/wizard`}>{t("empty.start")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-[#2E2C27]">
          {t("title")} <span className="font-normal text-[#4E4B44]">/ {t("titleSecondary")}</span>
        </h2>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-[#4E4B44]">
          {t("description")}
        </p>
      </header>

      <div className="mt-7 space-y-5">
        {proposals.map((proposal) => {
          const normalizedStatus = proposal.status.toUpperCase();
          const isSigned = normalizedStatus === "SIGNED";
          const documentUrl = isSigned ? getSignedProposalDocumentUrl(proposal.id) : proposal.pdfUrl;
          const downloadUrl = isSigned ? getSignedProposalDocumentUrl(proposal.id, true) : proposal.pdfUrl;
          const downloadName = `Quotation_#${proposal.id.slice(0, 8).toUpperCase()}${isSigned ? "_Signed" : ""}.pdf`;

          return (
            <article
              key={proposal.id}
              className="group rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] p-6 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#4E4B44]">
                    <Calendar className="h-4 w-4 stroke-[2.5] text-[#4F7FA8]" aria-hidden="true" />
                    <time dateTime={new Date(proposal.createdAt).toISOString()}>
                      {new Date(proposal.createdAt).toLocaleDateString(intlLocale, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                  <h3 className="mt-2 text-xl font-bold tracking-tight text-[#2E2C27]">
                    {t("proposalNumber", { id: proposal.id.slice(0, 8).toUpperCase() })}
                  </h3>
                </div>
                <Badge variant={getStatusVariant(normalizedStatus)}>{proposal.status}</Badge>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-[#F7F6F3] py-5 sm:grid-cols-4">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[#4E4B44]">
                    {t("fields.systemSize")}
                  </dt>
                  <dd className="mt-1 text-base font-bold text-[#2E2C27]">
                    {proposal.systemSizeKwp.toFixed(2)} kWp
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[#4E4B44]">
                    {t("fields.panelCount")}
                  </dt>
                  <dd className="mt-1 text-base font-bold text-[#2E2C27]">
                    {t("fields.panelCountValue", { count: Math.round(proposal.panelCount) })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[#4E4B44]">
                    {t("fields.monthlySavings")}
                  </dt>
                  <dd className="mt-1 text-base font-bold text-[#4F7FA8]">
                    ~{formatPrice(Math.round(proposal.monthlySavings))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[#4E4B44]">
                    {t("fields.paybackPeriod")}
                  </dt>
                  <dd className="mt-1 text-base font-bold text-[#2E2C27]">{proposal.paybackPeriod}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#4E4B44]">
                    {t("fields.totalInvestment")}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-black text-[#2E2C27]">
                    {formatPrice(Math.round(proposal.totalPrice))}
                  </p>
                </div>

                {documentUrl ? (
                  <Button asChild className="rounded-full bg-[#B7D1EA] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#A5C2DE] active:scale-95 transition-all">
                    <a
                      href={downloadUrl || documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={downloadName}
                    >
                      <Download className="stroke-[2.5]" aria-hidden="true" />
                      {isSigned ? t("actions.downloadSigned") : t("actions.downloadPdf")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
