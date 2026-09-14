"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Mail, Phone, User, CheckCircle2, FileText } from "@/components/ui/icons";
import { submitLeadData } from "@/app/actions/lead";
import { getQuotationProfileDefaults } from "@/app/actions/quotationProfile";
import { cn } from "@/lib/utils";
import { useRouter, useParams } from "next/navigation";
import DigitalSignaturePad from "@/components/ui/DigitalSignaturePad";
import { toast } from "sonner";
import ProgressiveImage from "@/components/ui/progressive-image";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

type SelectedSpecItem = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  specs?: Record<string, string | number | boolean | null | undefined>;
  selectedFinancingId?: string;
  loanTermMonths?: number;
  downPaymentPct?: number;
  monthlyBill?: string | number;
};

type SelectedSpecValue = SelectedSpecItem | string | number | null | undefined;
type SelectedSpecs = Record<string, SelectedSpecValue>;

function isSelectedSpecItem(value: SelectedSpecValue): value is SelectedSpecItem {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.price === "number"
  );
}

function getStringMeta(specs: SelectedSpecs, key: string) {
  const value = specs[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getNumberMeta(specs: SelectedSpecs, key: string) {
  const value = specs[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalPrice: number;
  systemkWp: number;
  panelCount: number;
  estimatedSavings: number;
  paybackPeriod: string;
  selectedSpecs: SelectedSpecs;
  electricityRate: number;
  meterType: "NORMAL" | "TOU";
  daytimeUsagePercent: number;
  propertyType: "home" | "factory";
  /** E = P × T × PR daily energy output (kWh/day) */
  dailyEnergyKwh?: number;
  /** Performance Ratio used in the formula (0–1) */
  PR?: number;
  mainBundleId?: string;
  selectedAddonIds?: string[];
}

export default function LeadCaptureModal({
  isOpen,
  onClose,
  totalPrice,
  systemkWp,
  panelCount,
  estimatedSavings,
  paybackPeriod,
  selectedSpecs,
  electricityRate,
  meterType,
  propertyType,
  dailyEnergyKwh,
  PR,
  selectedAddonIds,
}: LeadCaptureModalProps) {
  const t = useTranslations("LeadCaptureModal");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressProvince, setAddressProvince] = useState("");
  const [addressDistrict, setAddressDistrict] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState("");
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [proposalId, setProposalId] = useState<string | undefined>(undefined);
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || "th";
  const currencyFormatter = new Intl.NumberFormat(locale === "en" ? "en-US" : "th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    getQuotationProfileDefaults().then((result) => {
      if (!active || !result.defaults) return;
      setName((current) => current || result.defaults.fullLegalName);
      setEmail((current) => current || result.defaults.email);
      setPhone((current) => current || result.defaults.contactPhoneNumber);
    });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const fullAddress = [addressStreet, addressDistrict, addressProvince, addressZip]
    .filter(Boolean).join(", ");

  const requiredFieldsFilled = !!(name && email && phone && addressStreet && addressProvince && addressDistrict && addressZip);

  const handleFormSubmit = async (method: "DIGITAL" | "MANUAL") => {
    if (!requiredFieldsFilled) {
      setErrorMsg(t("errors.requiredFields"));
      return;
    }

    if (method === "DIGITAL" && !pdpaConsent) {
      setErrorMsg(t("errors.pdpaRequired"));
      toast.error(t("errors.pdpaRequired"));
      return;
    }

    if (method === "DIGITAL" && !signatureBase64) {
      setErrorMsg(t("errors.signatureRequired"));
      toast.error(t("errors.signatureRequired"));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const items = Object.entries(selectedSpecs)
        .filter((entry): entry is [string, SelectedSpecItem] => (
          isSelectedSpecItem(entry[1]) && entry[1].id !== "none"
        ))
        .map(([catName, item]) => {
          const isPanel = catName === "Solar Panels Selection";
          const qty = isPanel ? panelCount : 1;
          return {
            categoryName: catName,
            productName: item.name,
            quantity: qty,
            unitPrice: item.price,
            totalPrice: item.price * qty,
            productId: item.id.startsWith("custom-") ? undefined : item.id,
            financingPlanId: item.selectedFinancingId,
            loanTermMonths: item.loanTermMonths,
            downPaymentPct: item.downPaymentPct,
          };
        });

      const res = await submitLeadData({
        name,
        taxId: taxId || undefined,
        email,
        phone,
        location: fullAddress,
        items,
        totalPrice,
        systemkWp,
        panelCount,
        estimatedSavings,
        paybackPeriod,
        meterType,
        electricityRate,
        dailyEnergyKwh,
        PR,
        signatureBase64: method === "DIGITAL" ? signatureBase64 : undefined,
        signMethod: method,
        requiresInstallation: true,
        fulfillmentType: "INSTALLATION",
        selectedAddonIds,
        monthlyBill:
          getNumberMeta(selectedSpecs, "monthlyBill") ??
          (function () {
            const raw = getStringMeta(selectedSpecs, "monthlyBill");
            if (!raw) return undefined;
            const parsed = parseFloat(raw.replace(/[^\d.]/g, ""));
            return Number.isFinite(parsed) ? parsed : undefined;
          })(),
        propertyType,
      });

      if (res.error) {
        setErrorMsg(res.error);
        setIsSubmitting(false);
        return;
      }

      if (res.proposalId) {
        router.push(
          `/${locale}/proposals?activeId=${encodeURIComponent(res.proposalId)}`,
        );
        return;
      }

      setSuccess(true);
      setProposalId(res.proposalId);
      setIsSubmitting(false);

      // Open generated PDF in new tab
      if (res.url) {
        window.open(res.url, "_blank");
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(t("errors.saveFailed"));
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full px-4 py-3 bg-[#F7F6F3] border-0 border-b-2 border-[#8E8B83] focus:border-[#7CA8D0] focus:bg-[#F0EEE9] rounded-t-xl rounded-b-none text-xs font-bold text-[#2E2C27] focus:outline-none transition-all placeholder:text-[#8E8B83] placeholder:font-medium";
  const inputWithIconCls = `${inputCls} pl-10`;
  const labelCls = "text-[10px] font-bold uppercase tracking-wider text-[#4E4B44] flex items-center gap-1";

  return createPortal(
    <div 
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full flex-col overflow-hidden rounded-none border-none bg-[#F0EEE9] p-0 lg:flex-row"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Sticky Floating Close Button (X) */}
      <button
        onClick={onClose}
        className="sd-safe-top-4 fixed right-4 z-[110] cursor-pointer rounded-full border border-[#CBC7BE] bg-[#F0EEE9]/90 p-2.5 text-[#4E4B44] shadow-sm backdrop-blur-md transition-all hover:bg-[#E6E3DC] hover:text-[#2E2C27] active:scale-95 lg:right-6 lg:top-6 lg:border-white/20 lg:bg-white/10 lg:text-white/80 lg:hover:bg-white/20 lg:hover:text-white"
        aria-label={t("aria.closeModal")}
      >
        <X className="h-5 w-5 lg:h-6 lg:w-6" />
      </button>

      {/* Left Panel (Summary - 40%): MD3 Dark Surface (#2E2C27), text-white */}
      <div className="sd-safe-pt-5 flex h-auto max-h-[42dvh] w-full shrink-0 flex-col justify-between overflow-y-auto bg-[#2E2C27] p-5 text-[#E6E1E5] sm:max-h-[38dvh] sm:p-6 lg:h-full lg:max-h-none lg:w-[40%] lg:p-12">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-[10px] font-black tracking-widest uppercase bg-[#DCE8F5]/20 text-[#A5C2DE] px-3 py-1 rounded-full border border-[#A5C2DE]/30">
              {t("summary.badge")}
            </span>
          </div>
          
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight mb-2 text-white">
            {t("summary.title")}
          </h2>
          <p className="text-xs text-[#CBC7BE] font-medium mb-8 uppercase tracking-wide">
            {t("summary.description")}
          </p>

          {/* Performance metrics dashboard style */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <div className="bg-white/5 border border-white/10 p-4 rounded-[20px]">
              <p className="text-[9px] font-bold text-[#CBC7BE] uppercase tracking-widest">System Size</p>
              <p className="text-lg font-black mt-1 text-white"><AnimatedNumber value={systemkWp} decimals={2} suffix=" kWp" /></p>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-[20px]">
              <p className="text-[9px] font-bold text-[#CBC7BE] uppercase tracking-widest">Panels Count</p>
              <p className="text-lg font-black mt-1 text-white"><AnimatedNumber value={panelCount} formatter={(count) => t("metrics.panelCountValue", { count: Math.round(count) })} /></p>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-[20px]">
              <p className="text-[9px] font-bold text-[#CBC7BE] uppercase tracking-widest">Monthly Savings</p>
              <p className="text-lg font-black mt-1 text-emerald-400"><AnimatedNumber value={estimatedSavings} formatter={(amount) => currencyFormatter.format(Math.round(amount))} /></p>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-[20px]">
              <p className="text-[9px] font-bold text-[#CBC7BE] uppercase tracking-widest">Payback Period</p>
              <p className="text-lg font-black mt-1 text-amber-400">{t("metrics.paybackValue", { value: paybackPeriod })}</p>
            </div>
          </div>

          {/* Selected items list */}
          <div className="space-y-4 mb-8">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#CBC7BE] border-b border-white/10 pb-2">
              {t("summary.billOfMaterials")}
            </h3>
            
            <div className="space-y-3 max-h-[30vh] lg:max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(selectedSpecs)
                .filter((entry): entry is [string, SelectedSpecItem] => (
                  isSelectedSpecItem(entry[1]) && entry[1].id !== "none"
                ))
                .map(([catName, item]) => {
                  const isPanel = catName === "Solar Panels Selection";
                  const qty = isPanel ? panelCount : 1;
                  return (
                    <div key={catName} className="flex gap-4 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[20px] transition-all items-center">
                      {item.imageUrl ? (
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/10">
                          <ProgressiveImage
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            sizes="48px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0 border border-white/10">
                          <FileText className="w-6 h-6 text-[#CBC7BE]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-black text-[#A5C2DE] uppercase tracking-widest truncate">{catName}</p>
                        <h4 className="text-xs font-bold text-white truncate mt-0.5">{item.name}</h4>
                        {item.specs && Object.keys(item.specs).length > 0 && (
                          <p className="text-[9px] text-[#CBC7BE] truncate mt-0.5">
                            {Object.entries(item.specs).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-[#CBC7BE]">x{qty}</p>
                        <p className="text-xs font-black text-white mt-0.5">{currencyFormatter.format(item.price * qty)}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Grand Total Footer in Left Column */}
        <div className="border-t border-white/10 pt-6 mt-auto">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[#CBC7BE] uppercase tracking-widest">{t("summary.estimatedGrandTotal")}</p>
              <p className="text-[9px] text-[#938F99] font-medium">{t("summary.taxLaborIncluded")}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl lg:text-3xl font-black text-white tracking-tight">
                <AnimatedNumber value={totalPrice} formatter={(amount) => currencyFormatter.format(Math.round(amount))} />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel (Form - 60%): bg-[#F0EEE9], overflow-y-auto relative */}
      <div className="sd-safe-pb-5-add relative flex min-h-0 flex-1 flex-col justify-start overflow-y-auto bg-[#F0EEE9] p-5 sm:p-6 lg:h-full lg:w-[60%] lg:justify-center lg:p-12">
        <div className="mx-auto w-full max-w-2xl py-4 lg:py-8">
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#CBC7BE] bg-[#DCE8F5] text-[#2E2C27] text-[9px] uppercase tracking-widest font-black mb-3">
              <FileText className="w-3.5 h-3.5 text-[#4F7FA8]" />
              <span>{t("form.badge")}</span>
            </div>
            <h3 className="text-2xl font-black text-[#2E2C27] uppercase tracking-wide">
              {t("form.title")}
            </h3>
            <p className="text-[11px] text-[#4E4B44] font-bold uppercase mt-1 tracking-wider">
              {t("form.description")}
            </p>
          </div>

          {success ? (
            <div className="text-center py-12 space-y-6">
              <GsapPulse className="w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-500" scale={1.08}>
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </GsapPulse>
              <div>
                <h4 className="text-lg font-black text-[#2E2C27] uppercase">
                  {t("success.title")}
                </h4>
                <p className="text-sm text-[#4E4B44] font-semibold mt-2 max-w-sm mx-auto">
                  {t("success.description")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setSuccess(false);
                  setName(""); setEmail(""); setPhone("");
                  setAddressStreet(""); setAddressProvince(""); setAddressDistrict(""); setAddressZip("");
                  if (proposalId) {
                    router.push(
                      `/${locale}/proposals?activeId=${encodeURIComponent(proposalId)}`,
                    );
                  } else {
                    router.push(`/${locale}/proposals`);
                  }
                }}
                className="px-8 py-3 bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white text-xs font-black uppercase tracking-widest rounded-full transition-all cursor-pointer shadow-md active:scale-95"
              >
                {t("actions.done")}
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              {errorMsg && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-[20px] px-4 py-3 text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-4">
                {/* ① Name / Company */}
                <div className="space-y-1">
                  <label className={labelCls}>
                    {t("form.nameLabel")}
                    <span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8B83]" />
                    <input
                      type="text"
                      required
                      placeholder={t("form.namePlaceholder")}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputWithIconCls}
                    />
                  </div>
                </div>

                {/* ② Tax ID (Optional) */}
                <div className="space-y-1">
                  <label className={labelCls}>
                    {t("form.taxIdLabel")}
                    <span className="text-[#8E8B83] font-semibold normal-case tracking-normal ml-1">{t("form.taxIdOptional")}</span>
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8B83]" />
                    <input
                      type="text"
                      placeholder="e.g. 0105562000000"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      maxLength={13}
                      className={inputWithIconCls}
                    />
                  </div>
                </div>

                {/* ③ Email + Phone — side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={labelCls}>
                      {t("form.emailLabel")}<span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8B83]" />
                      <input
                        type="email"
                        required
                        placeholder="somchai@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputWithIconCls}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>
                      {t("form.phoneLabel")}<span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8B83]" />
                      <input
                        type="tel"
                        required
                        placeholder="0812345678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={inputWithIconCls}
                      />
                    </div>
                  </div>
                </div>

                {/* ④ Full Address */}
                <div className="space-y-1">
                  <label className={labelCls}>
                    {t("form.addressLabel")}<span className="text-rose-500 ml-0.5">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t("form.addressStreetPlaceholder")}
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    className={inputCls}
                  />
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <input
                      type="text"
                      required
                      placeholder={t("form.provincePlaceholder")}
                      value={addressProvince}
                      onChange={(e) => setAddressProvince(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="text"
                      required
                      placeholder={t("form.districtPlaceholder")}
                      value={addressDistrict}
                      onChange={(e) => setAddressDistrict(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="text"
                      required
                      placeholder={t("form.zipPlaceholder")}
                      value={addressZip}
                      onChange={(e) => setAddressZip(e.target.value)}
                      maxLength={5}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* ⑤ PDPA Consent */}
                <div className="pt-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={pdpaConsent}
                        onChange={(e) => setPdpaConsent(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                          pdpaConsent
                            ? "bg-[#B7D1EA] border-[#7CA8D0]"
                            : "bg-[#F0EEE9] border-[#8E8B83] group-hover:border-[#7CA8D0]"
                        )}
                      >
                        {pdpaConsent && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-[#4E4B44] leading-relaxed">
                      {t("form.pdpaConsent")}
                      <span className="text-rose-500 ml-0.5">*</span>
                    </span>
                  </label>
                </div>

                {/* ⑥ E-Signature Pad */}
                <div className="pt-2">
                  <DigitalSignaturePad
                    required
                    label={t("form.signatureLabel")}
                    onSign={(sig) => setSignatureBase64(sig)}
                  />
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                {/* Primary — DIGITAL */}
                <button
                  type="button"
                  disabled={isSubmitting || !pdpaConsent || !requiredFieldsFilled}
                  onClick={() => handleFormSubmit("DIGITAL")}
                  className="w-full py-3.5 bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all duration-300 ease-out hover:scale-[1.01] active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <GsapSpinner className="w-4 h-4 text-white" />
                      <span>{t("actions.processing")}</span>
                    </>
                  ) : (
                    <span>{t("actions.signSubmit")}</span>
                  )}
                </button>
                {/* Secondary — MANUAL */}
                <button
                  type="button"
                  disabled={isSubmitting || !requiredFieldsFilled}
                  onClick={() => handleFormSubmit("MANUAL")}
                  className="w-full py-3.5 border-0 bg-[#DCE8F5] hover:bg-[#DBCDEE] text-[#2E2C27] font-bold text-xs uppercase tracking-widest rounded-full transition-all duration-300 ease-out hover:scale-[1.01] active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  {t("actions.downloadSignLater")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

type ProposalPrintRow = {
  category: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
};

// PDF Sizing Proposal Generator Utility Functions
export function generatePrintProposalHtml(data: {
  leadId: string;
  name: string;
  email: string;
  phone: string;
  totalPrice: number;
  systemkWp: number;
  panelCount: number;
  estimatedSavings: number;
  paybackPeriod: string;
  selectedSpecs: SelectedSpecs;
  electricityRate: number;
  meterType: string;
}) {
  // Group the specifications by Category
  const categoriesMap: Record<"mounting" | "core" | "addons", ProposalPrintRow[]> = {
    mounting: [],
    core: [],
    addons: [],
  };

  Object.entries(data.selectedSpecs).forEach(([catName, item]) => {
    if (!isSelectedSpecItem(item) || item.id === "none") return;

    const isPanel = catName === "Solar Panels Selection";
    const qty = isPanel ? data.panelCount : 1;
    const unitPrice = item.price;
    const total = unitPrice * qty;

    const row = {
      category: catName,
      name: item.name,
      qty,
      unitPrice,
      total
    };

    if (catName === "Roof Type") {
      categoriesMap.mounting.push(row);
    } else if (catName === "Monthly Bill & System Size" || catName === "Solar Panels Selection") {
      categoriesMap.core.push(row);
    } else {
      categoriesMap.addons.push(row);
    }
  });

  const renderTableRows = () => {
    let rowsHtml = "";

    if (categoriesMap.mounting.length > 0) {
      rowsHtml += `
        <tr style="background: #F8FAFC;">
          <td colspan="5" style="padding: 6px 10px; font-weight: 800; font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #E2E8F0;">I. Base Mounting & Structure</td>
        </tr>
      `;
      categoriesMap.mounting.forEach(row => {
        rowsHtml += `
          <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; font-weight: 700; color: #1E293B;">${row.category}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; color: #475569;">${row.name}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: center; color: #475569;">${row.qty}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: right; font-family: monospace; color: #475569;">THB ${row.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: right; font-family: monospace; font-weight: 800; color: #0F172A;">THB ${row.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
          </tr>
        `;
      });
    }

    if (categoriesMap.core.length > 0) {
      rowsHtml += `
        <tr style="background: #F8FAFC;">
          <td colspan="5" style="padding: 6px 10px; font-weight: 800; font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #E2E8F0; border-top: 1px solid #E2E8F0;">II. Core Solar Equipment</td>
        </tr>
      `;
      categoriesMap.core.forEach(row => {
        rowsHtml += `
          <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; font-weight: 700; color: #1E293B;">${row.category}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; color: #475569;">${row.name}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: center; color: #475569;">${row.qty}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: right; font-family: monospace; color: #475569;">THB ${row.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: right; font-family: monospace; font-weight: 800; color: #0F172A;">THB ${row.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
          </tr>
        `;
      });
    }

    if (categoriesMap.addons.length > 0) {
      rowsHtml += `
        <tr style="background: #F8FAFC;">
          <td colspan="5" style="padding: 6px 10px; font-weight: 800; font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #E2E8F0; border-top: 1px solid #E2E8F0;">III. Smart Add-ons & Energy Storage</td>
        </tr>
      `;
      categoriesMap.addons.forEach(row => {
        rowsHtml += `
          <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; font-weight: 700; color: #1E293B;">${row.category}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; color: #475569;">${row.name}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: center; color: #475569;">${row.qty}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: right; font-family: monospace; color: #475569;">THB ${row.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 6px 10px; border-bottom: 1px solid #E2E8F0; font-size: 9.5px; text-align: right; font-family: monospace; font-weight: 800; color: #0F172A;">THB ${row.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
          </tr>
        `;
      });
    }

    return rowsHtml;
  };

  return `
    <html>
      <head>
        <title>Solar Proposal - ${data.name}</title>
        <style>
          @font-face {
            font-family: 'NotoSansThai';
            src: url('/fonts/NotoSansThai-Regular.ttf') format('truetype');
            font-weight: 400;
            font-style: normal;
          }
          @font-face {
            font-family: 'NotoSansThai';
            src: url('/fonts/NotoSansThai-Bold.ttf') format('truetype');
            font-weight: 700;
            font-style: normal;
          }
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'NotoSansThai', Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #0F172A;
            background: #FFFFFF;
            font-size: 9px;
            line-height: 1.3;
          }
          .proposal-container {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            page-break-inside: avoid;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #B7D1EA;
            padding-bottom: 4px;
            margin-bottom: 8px;
          }
          .logo {
            font-size: 16px;
            font-weight: 900;
            color: #0F172A;
            letter-spacing: -0.04em;
          }
          .logo span {
            color: #B7D1EA;
          }
          .title-block {
            text-align: right;
          }
          .proposal-title {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #0F172A;
            margin: 0;
          }
          .proposal-meta {
            font-size: 7.5px;
            color: #64748B;
            font-weight: 700;
            margin-top: 1px;
            text-transform: uppercase;
          }
          .section-title {
            font-size: 8.5px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
            border-bottom: 1px solid #E2E8F0;
            padding-bottom: 2px;
            margin-bottom: 4px;
            margin-top: 8px;
          }
          .info-grid {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 10px;
            margin-bottom: 6px;
          }
          .info-box {
            background: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 6px 10px;
          }
          .info-item {
            margin-bottom: 1px;
            font-size: 8px;
          }
          .info-item strong {
            color: #64748B;
            text-transform: uppercase;
            font-size: 6.5px;
            display: block;
            margin-bottom: 0px;
          }
          .metrics-grid {
            display: grid;
            grid-template-cols: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 6px;
          }
          .metric-card {
            background: #F0FDFB;
            border: 1px solid #CCFBF1;
            border-radius: 8px;
            padding: 5px 6px;
            text-align: center;
          }
          .metric-card.accent {
            background: #FFFBEB;
            border: 1px solid #FEF3C7;
          }
          .metric-label {
            font-size: 6.5px;
            font-weight: 800;
            text-transform: uppercase;
            color: #64748B;
            letter-spacing: 0.03em;
          }
          .metric-value {
            font-size: 9.5px;
            font-weight: 900;
            color: #0F172A;
            margin-top: 1px;
            white-space: nowrap;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            border: 1px solid #E2E8F0;
          }
          th {
            background: #F8FAFC;
            padding: 4px 8px;
            font-size: 7.5px;
            font-weight: 900;
            text-transform: uppercase;
            color: #475569;
            border-bottom: 2px solid #E2E8F0;
            text-align: left;
          }
          .footer {
            margin-top: 8px;
            border-top: 1px solid #E2E8F0;
            padding-top: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8px;
            color: #64748B;
          }
          .sig-line {
            width: 150px;
            border-bottom: 1px solid #94A3B8;
            margin-top: 12px;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="proposal-container">
          <div class="header">
            <div class="logo">SOLAR<span>CRAFT</span></div>
            <div class="title-block">
              <h1 class="proposal-title">Solar Array Proposal</h1>
              <div class="proposal-meta">ID: ${data.leadId.substring(0, 8).toUpperCase()} &bull; Created: ${new Date().toLocaleString('th-TH')}</div>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <h3 style="margin-top: 0; margin-bottom: 6px; font-size: 9.5px; font-weight: 900; text-transform: uppercase; color: #0F172A;">Customer Information</h3>
              <div class="info-item"><strong>Client Name</strong> ${data.name}</div>
              <div class="info-item"><strong>Email Address</strong> ${data.email}</div>
              <div class="info-item"><strong>Phone Number</strong> ${data.phone}</div>
            </div>
            <div class="info-box">
              <h3 style="margin-top: 0; margin-bottom: 6px; font-size: 9.5px; font-weight: 900; text-transform: uppercase; color: #0F172A;">Project Details</h3>
              <div class="info-item"><strong>Status</strong> Engineering Blueprint Proposal</div>
              <div class="info-item"><strong>Electricity Tariff</strong> ${data.meterType} (Unit price: THB ${data.electricityRate.toFixed(2)})</div>
              <div class="info-item"><strong>Location Country</strong> Thailand</div>
            </div>
          </div>

          <div class="section-title">System Performance & Financial Yield</div>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-label">System Size</div>
              <div class="metric-value">${data.systemkWp.toFixed(2)} kWp</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Solar Panels Count</div>
              <div class="metric-value">${data.panelCount} Panels</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Est. Monthly Savings</div>
              <div class="metric-value">THB ${Math.round(data.estimatedSavings).toLocaleString('th-TH')}</div>
            </div>
            <div class="metric-card accent">
              <div class="metric-label">Estimated Payback</div>
              <div class="metric-value" style="color: #D8A87B;">${data.paybackPeriod} Years</div>
            </div>
          </div>

          <div class="section-title">Selected Bill of Materials</div>
          <table>
            <thead>
              <tr>
                <th style="width: 25%; border-bottom: 2px solid #E2E8F0; padding: 6px 10px; font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569;">Category</th>
                <th style="width: 40%; border-bottom: 2px solid #E2E8F0; padding: 6px 10px; font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569;">Component Spec</th>
                <th style="width: 10%; border-bottom: 2px solid #E2E8F0; padding: 6px 10px; font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569; text-align: center;">Qty</th>
                <th style="width: 12.5%; border-bottom: 2px solid #E2E8F0; padding: 6px 10px; font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569; text-align: right;">Unit Price</th>
                <th style="width: 12.5%; border-bottom: 2px solid #E2E8F0; padding: 6px 10px; font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569; text-align: right;">Total Price</th>
              </tr>
            </thead>
            <tbody>
              ${renderTableRows()}
              <tr style="background: #F8FAFC;">
                <td colspan="4" style="padding: 8px 10px; font-weight: 900; text-transform: uppercase; font-size: 8.5px; text-align: right; border-top: 2px solid #E2E8F0;">Estimated Grand Total:</td>
                <td style="padding: 8px 10px; font-weight: 900; font-family: monospace; font-size: 10px; text-align: right; border-top: 2px solid #E2E8F0; color: #0F172A;">
                  THB ${data.totalPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <div>
              <p style="margin: 0; font-weight: 800; color: #0F172A;">SOLAR DREAM Thailand Co., Ltd.</p>
              <p style="margin: 1px 0 0 0;">Clean Tech Engineering Solutions &bull; solardream.co.th</p>
            </div>
            <div>
              <p style="margin: 0; text-align: right; font-weight: 800; color: #0F172A;">Customer Acceptance Signature</p>
              <div class="sig-line"></div>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          }
        </script>
      </body>
    </html>
  `;
}
