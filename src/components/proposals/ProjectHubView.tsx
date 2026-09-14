"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "gsap";
import {
  CalendarDays,
  Check,
  Eye,
  ExternalLink,
  FileCheck2,
  FileText,
  HardHat,
  Package,
  ReceiptText,
  UserRound,
  WalletCards,
} from "@/components/ui/icons";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type {
  ProposalProjectHubContract,
  ProposalProjectHubDocumentDto,
  ProposalProjectHubItemDto,
} from "@/types/proposals";

const PROJECT_STEPS = [
  { key: "approval", th: "อนุมัติ", en: "Approval" },
  { key: "payment", th: "ชำระเงิน", en: "Payment" },
  { key: "engineering", th: "วิศวกรรม", en: "Engineering" },
  { key: "installation", th: "ติดตั้ง", en: "Installation" },
  { key: "finish", th: "ส่งมอบ", en: "Finish" },
] as const;

export type ProjectHubItem = ProposalProjectHubItemDto;
export type ProjectHubDocument = ProposalProjectHubDocumentDto;
type ProjectHubViewProps = ProposalProjectHubContract;

type ProjectHubTab = "tracking" | "items" | "documents";

function getActiveStep(status: string, currentMilestoneStep: number) {
  const normalized = status.toUpperCase();
  if (["COMPLETED", "COMPLETE"].includes(normalized)) return 4;
  if (normalized === "INSTALLING" || currentMilestoneStep >= 3) return 3;
  if (["PAID", "FULLY_PAID", "VERIFIED_IN_PROGRESS"].includes(normalized)) {
    return 2;
  }
  if (normalized === "SIGNED") return 1;
  return 0;
}

function formatDocumentUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://drive.google.com/file/d/${encodeURIComponent(url)}/view`;
}

function formatDocumentEmbedUrl(url: string) {
  const formattedUrl = formatDocumentUrl(url);
  if (formattedUrl.startsWith("/")) return formattedUrl;
  try {
    const parsed = new URL(formattedUrl);
    const driveId =
      parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ||
      parsed.searchParams.get("id");
    return driveId
      ? `https://drive.google.com/file/d/${driveId}/preview`
      : formattedUrl;
  } catch {
    return formattedUrl;
  }
}

function formatDriveThumbnailUrl(url: string) {
  const formattedUrl = formatDocumentUrl(url);
  if (formattedUrl.startsWith("/")) return formattedUrl;
  try {
    const parsed = new URL(formattedUrl);
    const driveId =
      parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ||
      parsed.searchParams.get("id");
    return driveId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w640`
      : formattedUrl;
  } catch {
    return formattedUrl;
  }
}

function formatCurrency(amount: number, locale: string) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ProjectHubView({
  locale,
  proposalId,
  status,
  currentMilestoneStep,
  engineerName,
  estimatedDate,
  items,
  documents,
  totalPrice,
  paidAmount,
}: ProjectHubViewProps) {
  const t = useTranslations("ProjectHubView");
  const isThai = locale === "th";
  const [activeTab, setActiveTab] = useState<ProjectHubTab>("tracking");
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const activeStep = getActiveStep(status, currentMilestoneStep);
  const isFinished = activeStep === PROJECT_STEPS.length - 1;
  const signedContract = documents.find((document) => document.kind === "CONTRACT");
  const verifiedSlips = documents.filter((document) => document.kind === "PAYMENT");
  const resolvedPaidAmount = Math.max(
    0,
    paidAmount ??
      verifiedSlips.reduce((sum, slip) => sum + (slip.amount || 0), 0),
  );
  const remainingBalance = Math.max(0, totalPrice - resolvedPaidAmount);

  const openDocumentDialog = () => {
    setIsDocumentLoading(true);
    setIsDocumentDialogOpen(true);
  };

  const tabs: Array<{ id: ProjectHubTab; label: string }> = [
    { id: "tracking", label: isThai ? "ติดตามสถานะ" : "Tracking" },
    { id: "items", label: isThai ? "รายละเอียดสินค้า" : "Item Details" },
    { id: "documents", label: isThai ? "เอกสารโครงการ" : "Project Documents" },
  ];
  const milestoneTitle = isFinished
    ? isThai
      ? "ส่งมอบโครงการเรียบร้อยแล้ว"
      : "Project handover completed"
    : activeStep === 3
      ? isThai
        ? "กำลังดำเนินการติดตั้งโครงสร้าง"
        : "Installation work is in progress"
      : isThai
        ? "ทีมวิศวกรรมกำลังเตรียมแผนติดตั้ง"
        : "Engineering is preparing the installation plan";

  return (
    <div className="flex flex-1 flex-col gap-8 bg-[#F0EEE9] p-5 sm:p-7">
      {/* Step Progress Tracker */}
      <section aria-label={isThai ? "ความคืบหน้าโครงการ" : "Project progress"}>
        <ol className="grid grid-cols-5">
          {PROJECT_STEPS.map((step, index) => {
            const completed = index < activeStep || isFinished;
            const active = index === activeStep && !isFinished;

            return (
              <li key={step.key} className="relative flex min-w-0 flex-col items-center">
                {index > 0 && (
                  <span
                    className={cn(
                      "absolute right-1/2 top-5 h-1 w-full",
                      index <= activeStep ? "bg-[#B7D1EA]" : "bg-[#F7F6F3]",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition-all",
                    completed && "bg-[#B7D1EA] text-white shadow-sm",
                    active && "border-2 border-[#7CA8D0] bg-[#DCE8F5] text-[#2E2C27] scale-110 shadow-sm",
                    !completed && !active && "border border-[#CBC7BE] bg-[#F0EEE9] text-[#8E8B83]",
                  )}
                >
                  {completed ? <Check className="h-4 w-4 stroke-[2.5]" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "mt-2 truncate text-center text-[10px] font-bold uppercase tracking-wide sm:text-xs",
                    index <= activeStep ? "text-[#2E2C27]" : "text-[#8E8B83]",
                  )}
                >
                  {isThai ? step.th : step.en}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div>
        {/* Pill Tabs */}
        <div
          role="tablist"
          aria-label={isThai ? "เมนูศูนย์โครงการ" : "Project hub sections"}
          className="flex gap-2 overflow-x-auto border-b border-[#F7F6F3] pb-2 px-1"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`project-hub-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`project-hub-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "min-h-10 shrink-0 rounded-full px-5 py-2 text-xs font-bold transition-all cursor-pointer",
                  isActive
                    ? "bg-[#B7D1EA] text-white shadow-sm"
                    : "border border-[#CBC7BE] bg-[#F0EEE9] text-[#4E4B44] hover:bg-[#DCE8F5] hover:text-[#2E2C27]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Container */}
        <div className="relative z-0 mt-4 rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] p-6 shadow-sm sm:p-8">
          <GsapTabPanel
            key={activeTab}
            id={`project-hub-panel-${activeTab}`}
            labelledBy={`project-hub-tab-${activeTab}`}
            className="p-0"
          >
            {activeTab === "tracking" && (
              <section className="rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-6 text-[#2E2C27] shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[#4F7FA8]">
                      <HardHat className="h-5 w-5 stroke-[2.5]" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        {isThai ? "ขั้นตอนที่กำลังดำเนินการ" : "Active milestone"}
                      </span>
                    </div>
                    <h2 className="mt-2 text-xl font-bold leading-snug text-[#2E2C27] sm:text-2xl">
                      {milestoneTitle}
                    </h2>
                    <dl className="mt-5 flex flex-col gap-3 text-sm font-medium sm:flex-row sm:gap-8">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-[#4F7FA8] stroke-[2.5]" />
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                            {isThai ? "วิศวกรผู้ดูแล" : "Engineer"}
                          </dt>
                          <dd className="font-bold text-[#2E2C27]">
                            {engineerName || (isThai ? "อยู่ระหว่างมอบหมาย" : "Assignment pending")}
                          </dd>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-[#4F7FA8] stroke-[2.5]" />
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                            {isThai ? "วันที่โดยประมาณ" : "Estimated date"}
                          </dt>
                          <dd className="font-bold text-[#2E2C27]">
                            {estimatedDate
                              ? new Intl.DateTimeFormat(isThai ? "th-TH" : "en-US", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                }).format(new Date(estimatedDate))
                              : isThai ? "รอยืนยันกำหนดการ" : "Schedule pending"}
                          </dd>
                        </div>
                      </div>
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
                    <Link
                      href={`/${locale}/project-tracker/${proposalId}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-5 py-2.5 text-xs font-bold text-[#2E2C27] shadow-sm transition-all hover:bg-[#DCE8F5] active:scale-95"
                    >
                      {isThai ? "ดูแผนผังการติดตั้ง" : "View installation plan"}
                      <ExternalLink className="h-4 w-4 stroke-[2.5]" />
                    </Link>
                    <Link
                      href={`/${locale}/my-proposal/${proposalId}/tracking`}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#B7D1EA] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95"
                    >
                      {isThai ? "ดูประวัติทั้งหมด" : "View full activity"}
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "items" && (
              <section>
                <div className="mb-4 flex items-center gap-2 text-[#2E2C27]">
                  <Package className="h-5 w-5 text-[#4F7FA8] stroke-[2.5]" />
                  <h2 className="text-base font-bold text-[#2E2C27]">
                    {isThai ? "รายละเอียดสินค้าและอุปกรณ์" : "Product and Equipment Details"}
                  </h2>
                </div>
                {items.length > 0 ? (
                  <ul className="mt-4 divide-y divide-[#F7F6F3]">
                    {items.map((item, index) => (
                      <li
                        key={item.id || `${item.name}-${index}`}
                        className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#2E2C27]">{item.name}</p>
                          {item.model && (
                            <p className="mt-1 text-xs font-medium text-[#4E4B44]">{item.model}</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full border border-[#CBC7BE] bg-[#DCE8F5] px-3.5 py-1 text-xs font-bold text-[#2E2C27]">
                          x{item.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm font-medium text-[#4E4B44]">
                    {isThai ? "รายการอุปกรณ์อยู่ระหว่างจัดเตรียม" : "Equipment list is being prepared."}
                  </p>
                )}
              </section>
            )}

            {activeTab === "documents" && (
              <section className="rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                    <FileCheck2 className="h-5 w-5 stroke-[2.5]" />
                  </span>
                  <h2 className="text-base font-bold text-[#2E2C27]">
                    เอกสารโครงการ <span className="font-normal text-[#4E4B44]">(Project Documents)</span>
                  </h2>
                </div>

                <div className="mt-5">
                  {signedContract ? (
                    <div className="flex flex-col gap-4 rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E6E3DC] text-[#4F7FA8]">
                          <FileText className="h-5 w-5 stroke-[2.5]" />
                        </span>
                        <p className="text-sm font-bold leading-relaxed text-[#2E2C27]">
                          ใบเสนอราคา / สัญญา{" "}
                          <span className="font-normal text-[#4E4B44]">(Quotation/Contract)</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openDocumentDialog}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95 cursor-pointer"
                      >
                        <Eye className="h-4 w-4 stroke-[2.5]" />
                        เปิดดูเอกสาร (View Document)
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-4">
                      <FileText className="h-5 w-5 shrink-0 text-[#8E8B83]" />
                      <p className="text-sm font-medium text-[#4E4B44]">
                        ยังไม่มีเอกสารโครงการ (No project document available)
                      </p>
                    </div>
                  )}
                </div>

                <div className="my-6 h-px bg-[#F7F6F3]" />

                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                    <ReceiptText className="h-5 w-5 stroke-[2.5]" />
                  </span>
                  <h3 className="text-base font-bold text-[#2E2C27]">
                    ประวัติการชำระเงิน <span className="font-normal text-[#4E4B44]">(Payment History)</span>
                  </h3>
                </div>

                {verifiedSlips.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {verifiedSlips.map((slip, index) => (
                      <div
                        key={slip.id || index}
                        className="flex items-center gap-3 rounded-full border border-[#F7F6F3] bg-[#F0EEE9] px-4 py-2 shadow-sm"
                      >
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          VERIFIED
                        </span>
                        <span className="text-xs font-bold text-[#2E2C27]">
                          {formatCurrency(slip.amount || 0, locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs font-medium text-[#4E4B44]">
                    ยังไม่มีประวัติการชำระเงิน
                  </p>
                )}

                {/* Financial Summary Box */}
                <dl className="mt-6 divide-y divide-[#F7F6F3] rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] px-5 py-2 shadow-sm">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                      ราคารวมทั้งสิ้น <span className="font-normal text-[#8E8B83]">(Total Amount)</span>
                    </dt>
                    <dd className="text-sm font-bold tabular-nums text-[#2E2C27]">
                      {formatCurrency(totalPrice, locale)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                      ชำระแล้ว <span className="font-normal text-[#8E8B83]">(Paid Amount)</span>
                    </dt>
                    <dd className="text-sm font-bold tabular-nums text-emerald-700">
                      {formatCurrency(resolvedPaidAmount, locale)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2E2C27]">
                      <WalletCards className="h-4 w-4 text-[#4F7FA8] stroke-[2.5]" />
                      คงเหลือ <span className="font-normal text-[#8E8B83]">(Remaining Balance)</span>
                    </dt>
                    <dd className="text-base font-bold tabular-nums text-[#4F7FA8]">
                      {formatCurrency(remainingBalance, locale)}
                    </dd>
                  </div>
                </dl>
              </section>
            )}
          </GsapTabPanel>
        </div>
      </div>

      <Dialog
        isOpen={isDocumentDialogOpen}
        onClose={() => setIsDocumentDialogOpen(false)}
        className="rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] shadow-2xl overflow-hidden"
      >
        <DialogContent>
          <DialogHeader className="border-b border-[#F7F6F3] bg-[#E6E3DC] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                <FileText className="h-5 w-5 stroke-[2.5]" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#2E2C27]">
                  {t("documentDialog.title")}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-[#4E4B44]">
                  {t("documentDialog.subtitle")}
                </p>
              </div>
            </div>
          </DialogHeader>
          <DialogBody className="relative bg-[#F0EEE9] p-0">
            {signedContract && isDocumentDialogOpen && (
              <>
                {isDocumentLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#F0EEE9] p-6">
                    <div className="w-full max-w-sm space-y-3">
                      <Skeleton className="h-4 w-2/3 bg-[#F7F6F3]" />
                      <Skeleton className="h-3 w-full bg-[#F7F6F3]" />
                      <Skeleton className="h-3 w-5/6 bg-[#F7F6F3]" />
                    </div>
                  </div>
                )}
                <iframe
                  src={formatDocumentEmbedUrl(signedContract.url)}
                  title={t("documentDialog.frameTitle")}
                  onLoad={() => setIsDocumentLoading(false)}
                  className="h-full min-h-[70dvh] w-full bg-[#F0EEE9]"
                />
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GsapTabPanel({
  children,
  className,
  id,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  id: string;
  labelledBy: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      gsap.fromTo(
        panel,
        { autoAlpha: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: prefersReducedMotion ? 0.08 : 0.18,
          ease: "power2.out",
        },
      );
    }, panel);

    return () => context.revert();
  }, []);

  return (
    <div ref={panelRef} id={id} role="tabpanel" aria-labelledby={labelledBy} className={className}>
      {children}
    </div>
  );
}
