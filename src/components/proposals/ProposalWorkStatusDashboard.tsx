import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CheckCircle2, Clock3, MessageSquareQuote, PencilLine, ShieldCheck } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { isLocale, toIntlLocale } from "@/i18n/locales";
import type { ReactNode } from "react";
import type {
  ProposalContactLinkDto,
  ProposalProgressStatus,
  ProposalWorkStatusDashboardContract,
  ProposalWorkStatusDto,
  ProposalWorkStatusItemDto,
} from "@/types/proposals";

export type ProposalStatus = ProposalProgressStatus;
export type ProposalItem = ProposalWorkStatusItemDto;
export type ContactLink = ProposalContactLinkDto;
export type ProposalRecord = ProposalWorkStatusDto;
type Props = ProposalWorkStatusDashboardContract;

const PIPELINE: Array<{
  key: ProposalStatus;
  icon: typeof Clock3;
}> = [
  {
    key: "STAGING",
    icon: PencilLine,
  },
  {
    key: "PENDING_QUOTE",
    icon: MessageSquareQuote,
  },
  {
    key: "WAITING_CLIENT",
    icon: Clock3,
  },
  {
    key: "APPROVED",
    icon: CheckCircle2,
  },
];

function normalizeStatus(status: string | null | undefined): ProposalStatus {
  const value = (status || "").trim().toUpperCase();

  if (["APPROVED", "ACCEPTED", "COMPLETED", "VERIFIED_IN_PROGRESS", "SIGNED_WAITING_VERIFY"].includes(value)) {
    return "APPROVED";
  }

  if (["WAITING_CLIENT", "SENT", "VIEWED"].includes(value)) {
    return "WAITING_CLIENT";
  }

  if (["PENDING_QUOTE", "QUOTE_PENDING", "QUOTING"].includes(value)) {
    return "PENDING_QUOTE";
  }

  return "STAGING";
}

function formatCurrency(value: number | null | undefined, intlLocale: string) {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || Number(value) <= 0) {
    return null;
  }

  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatNumber(value: number | null | undefined, intlLocale: "en-US" | "th-TH", fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "0";

  return new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Number(value));
}

function pickActionHref(contactLinks: ContactLink[], preferredPlatforms: string[]) {
  for (const platform of preferredPlatforms) {
    const link = contactLinks.find((item) => item.platform?.toUpperCase() === platform);
    if (!link?.value) continue;

    const raw = link.value.trim();
    if (!raw) continue;

    if (platform === "EMAIL") {
      return raw.startsWith("mailto:") ? raw : `mailto:${raw}`;
    }

    if (platform === "PHONE") {
      const digits = raw.replace(/[^\d+]/g, "");
      return raw.startsWith("tel:") ? raw : `tel:${digits || raw}`;
    }

    return raw;
  }

  return null;
}

function getCategoryTone(category: string) {
  const value = (category || "").toLowerCase();

  if (value.includes("solar panel")) {
    return "bg-teal-50 text-teal-700 border-teal-100";
  }
  if (value.includes("inverter")) {
    return "bg-blue-50 text-blue-700 border-blue-100";
  }
  if (value.includes("battery") || value.includes("storage")) {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  if (value.includes("mount") || value.includes("roof") || value.includes("structure")) {
    return "bg-white text-slate-600 border-slate-200";
  }

  return "bg-white text-slate-600 border-slate-200";
}

function getCategoryLabel(category: string) {
  return category?.trim() || "General";
}

function getItemLabel(item: ProposalItem) {
  return item.productName || item.model || item.item_code || item.name || "Untitled item";
}

function getItemBrand(item: ProposalItem) {
  return item.brand?.trim() || "Unknown Brand";
}

function getItemQty(item: ProposalItem) {
  const qty = item.quantity ?? item.qty ?? 1;
  return Number.isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : 1;
}

function getItemUnitPrice(item: ProposalItem) {
  const price = item.unitPrice ?? item.price ?? 0;
  return Number(price) > 0 ? Number(price) : 0;
}

function getItemTotalPrice(item: ProposalItem) {
  const total = item.totalPrice ?? item.total ?? getItemUnitPrice(item) * getItemQty(item);
  return Number(total) > 0 ? Number(total) : 0;
}

function getProposalItems(proposal: ProposalRecord | null): ProposalItem[] {
  if (!proposal) return [];

  const config = proposal.configurationData || {};
  const rawItems = Array.isArray(config.items)
    ? (config.items as ProposalItem[])
    : Array.isArray(config.products)
      ? (config.products as ProposalItem[])
      : [];

  return rawItems
    .map((item: ProposalItem, index: number) => ({
      ...item,
      id: item?.id || item?.productId || item?.item_code || `${proposal.id}-${index}`,
      productName: item?.productName || item?.name || item?.model || item?.item_code || item?.productLabel,
      model: item?.model || item?.item_code || item?.productName,
      quantity: item?.quantity ?? item?.qty ?? 1,
      unitPrice: item?.unitPrice ?? item?.price ?? 0,
      totalPrice: item?.totalPrice ?? item?.total ?? 0,
      categoryName: item?.categoryName || item?.category || item?.group || "General",
      brand: item?.brand || "Unknown Brand",
      description: item?.description || "",
    }))
    .filter((item) => getItemLabel(item).length > 0);
}

export default async function ProposalWorkStatusDashboard({ proposals, activeProposal, contactLinks }: Props) {
  const t = await getTranslations("ProposalWorkStatusDashboard");
  const locale = await getLocale();
  const intlLocale = toIntlLocale(isLocale(locale) ? locale : "th");
  const normalizedStatus = normalizeStatus(activeProposal?.status);
  const activeStepIndex = Math.max(0, PIPELINE.findIndex((step) => step.key === normalizedStatus));
  const items = getProposalItems(activeProposal);
  const pipelineCopy: Record<ProposalStatus, { label: string; subtitle: string }> = {
    STAGING: {
      label: t("pipeline.staging.label"),
      subtitle: t("pipeline.staging.subtitle"),
    },
    PENDING_QUOTE: {
      label: t("pipeline.pendingQuote.label"),
      subtitle: t("pipeline.pendingQuote.subtitle"),
    },
    WAITING_CLIENT: {
      label: t("pipeline.waitingClient.label"),
      subtitle: t("pipeline.waitingClient.subtitle"),
    },
    APPROVED: {
      label: t("pipeline.approved.label"),
      subtitle: t("pipeline.approved.subtitle"),
    },
  };

  const approveHref = pickActionHref(contactLinks, ["LINE", "EMAIL", "PHONE", "FACEBOOK"]);
  const changeHref = pickActionHref(contactLinks, ["EMAIL", "LINE", "PHONE", "FACEBOOK"]);

  const statusCopy =
    normalizedStatus === "STAGING"
      ? t("statusCopy.staging")
      : normalizedStatus === "WAITING_CLIENT"
        ? t("statusCopy.waitingClient")
        : normalizedStatus === "APPROVED"
          ? t("statusCopy.approved")
          : t("statusCopy.pendingQuote");

  return (
    <div className="min-h-dvh bg-[#F0EEE9]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
                {t("header.kicker")}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  {t("header.title")}
                </h1>
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-teal-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("header.liveStatus")}
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                {t("header.description")}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-xl border border-slate-200/60 bg-[#F0EEE9]/70 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{t("summary.latestProposal")}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-700">
                  {activeProposal ? `#${activeProposal.id.slice(0, 8).toUpperCase()}` : "N/A"}
                </p>
              </div>
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-teal-600">{t("summary.currentStage")}</p>
                <p className="mt-1 text-sm font-bold text-teal-800">{pipelineCopy[normalizedStatus]?.label ?? pipelineCopy.STAGING.label}</p>
              </div>
            </div>
          </div>

          {activeProposal ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label={t("metrics.systemSize.label")} value={<AnimatedNumber value={activeProposal.systemSizeKwp} decimals={2} suffix=" kWp" />} hint={t("metrics.systemSize.hint")} />
              <MetricCard label={t("metrics.panelCount.label")} value={<AnimatedNumber value={activeProposal.panelCount} />} hint={t("metrics.panelCount.hint")} />
              <MetricCard
                label={t("metrics.quoteTotal.label")}
                value={activeProposal.totalPrice > 0 ? <AnimatedNumber value={activeProposal.totalPrice} formatter={(amount) => formatCurrency(Math.round(amount), intlLocale) || ""} /> : t("fallbacks.awaitingErpPrice")}
                hint={t("metrics.quoteTotal.hint")}
              />
              <MetricCard label={t("metrics.payback.label")} value={activeProposal.paybackPeriod || t("fallbacks.tbd")} hint={t("metrics.payback.hint")} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200/70 bg-[#F0EEE9]/60 px-4 py-5 text-sm text-slate-500">
              {t("empty.inline")}
            </div>
          )}
        </header>

        {proposals.length === 0 || !activeProposal ? (
          <section className="rounded-xl border border-slate-200/60 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/70 bg-[#F0EEE9]/60 text-slate-400">
              <Clock3 className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-xl font-black tracking-tight text-slate-900">
              {t("empty.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              {t("empty.description")}
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95"
              >
                {t("empty.backHome")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
                    {t("timeline.kicker")}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {t("timeline.title")}
                  </h2>
                </div>
                <p className="max-w-xl text-sm leading-6 text-slate-500">
                  {t("timeline.description")}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PIPELINE.map((step, index) => {
                  const isComplete = index < activeStepIndex;
                  const isActive = index === activeStepIndex;
                  const Icon = step.icon;

                  return (
                    <div
                      key={step.key}
                      className={cn(
                        "rounded-xl border p-4 transition-all",
                        isActive ? "border-teal-200 bg-teal-50/70 shadow-sm" : isComplete ? "border-emerald-100 bg-emerald-50/60" : "border-slate-200/60 bg-[#F0EEE9]/55"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border bg-white", isActive ? "border-teal-200 text-teal-700" : isComplete ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-400")}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.25em]", isActive ? "bg-teal-100 text-teal-700" : isComplete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {step.key}
                        </div>
                      </div>
                      <h3 className="mt-4 text-sm font-bold text-slate-900">{pipelineCopy[step.key].label}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{pipelineCopy[step.key].subtitle}</p>
                    </div>
                  );
                })}
              </div>

              <div
                className={cn(
                  "mt-6 rounded-xl border p-5 sm:p-6",
                  normalizedStatus === "STAGING"
                    ? "border-teal-100 bg-teal-50/70"
                    : normalizedStatus === "WAITING_CLIENT"
                      ? "border-amber-100 bg-amber-50/80"
                      : normalizedStatus === "APPROVED"
                        ? "border-emerald-100 bg-emerald-50/70"
                        : "border-slate-200/60 bg-[#F0EEE9]/60"
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">
                      {t("currentStatus.kicker")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.22em]",
                          normalizedStatus === "STAGING"
                            ? "border-teal-200 bg-white text-teal-700"
                            : normalizedStatus === "WAITING_CLIENT"
                              ? "border-amber-200 bg-white text-amber-700"
                              : normalizedStatus === "APPROVED"
                                ? "border-emerald-200 bg-white text-emerald-700"
                                : "border-slate-200 bg-white text-slate-600"
                        )}
                      >
                        {normalizedStatus}
                      </span>
                      <h3 className="text-xl font-black tracking-tight text-slate-950">
                        {statusCopy}
                      </h3>
                    </div>
                  </div>

                  {normalizedStatus === "WAITING_CLIENT" ? (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <a
                        href={approveHref || "#"}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95"
                      >
                        {t("actions.approve")}
                        <CheckCircle2 className="h-4 w-4" />
                      </a>
                      <a
                        href={changeHref || "#"}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-6 py-3 text-sm font-bold text-[#2E2C27] shadow-sm transition hover:bg-[#DCE8F5] active:scale-95"
                      >
                        {t("actions.requestChanges")}
                        <PencilLine className="h-4 w-4 text-[#4F7FA8]" />
                      </a>
                    </div>
                  ) : null}
                </div>

                {normalizedStatus === "STAGING" ? (
                  <div className="mt-5 rounded-xl border border-teal-100 bg-white p-4 text-sm leading-6 text-slate-600">
                    {t("statusCopy.staging")}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
                    {t("equipment.kicker")}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {t("equipment.title")}
                  </h2>
                </div>
                <p className="text-sm text-slate-500">
                  {t("equipment.description")}
                </p>
              </div>

              <div className="mt-6 w-full overflow-x-auto rounded-xl border border-slate-200/60 bg-white">
                {items.length === 0 ? (
                  <div className="m-4 flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-[#F0EEE9]/60 px-6 py-10 text-center">
                    <p className="text-base font-bold text-slate-800">{t("equipment.emptyTitle")}</p>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                      {t("equipment.emptyDescription")}
                    </p>
                  </div>
                ) : (
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#F0EEE9]/75 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">{t("equipment.table.productModel")}</th>
                        <th className="px-4 py-3 text-left">{t("equipment.table.quantity")}</th>
                        <th className="px-4 py-3 text-left">{t("equipment.table.unitPrice")}</th>
                        <th className="px-4 py-3 text-left">{t("equipment.table.total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => {
                        const category = getCategoryLabel(item.categoryName || item.category || "");
                        const brand = getItemBrand(item);
                        const unitPrice = getItemUnitPrice(item);
                        const totalPrice = getItemTotalPrice(item);

                        return (
                          <tr
                            key={item.id || item.productId || item.item_code || index}
                            className="border-t border-slate-200/60 transition-colors duration-150 hover:bg-[#F0EEE9]/55"
                          >
                            <td className="px-4 py-4 align-top">
                              <div className="flex flex-col gap-2">
                                <span className={cn("inline-flex max-w-max rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em]", getCategoryTone(category))}>
                                  {category}
                                </span>
                                <div className="max-w-2xl">
                                  <span className="inline-flex max-w-max rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-700">
                                    {getItemLabel(item)}
                                  </span>
                                  <p className={cn("mt-2 text-sm", brand === "Unknown Brand" ? "text-slate-400 italic" : "text-slate-600")}>
                                    {brand}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <span className="inline-flex rounded-full bg-[#F0EEE9] px-3 py-1.5 text-sm font-semibold text-slate-700">
                                {getItemQty(item)}
                              </span>
                            </td>
                            <td className="px-4 py-4 align-top">
                              {unitPrice > 0 ? (
                                <span className="font-mono text-sm font-semibold text-slate-700">
                                  {formatCurrency(unitPrice, intlLocale)}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600">
                                  {t("fallbacks.awaitingErpPrice")}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 align-top">
                              {totalPrice > 0 ? (
                                <span className="font-mono text-sm font-semibold text-slate-900">
                                  {formatCurrency(totalPrice, intlLocale)}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600">
                                  {t("fallbacks.awaitingErpPrice")}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-[#F0EEE9]/55 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
    </div>
  );
}
