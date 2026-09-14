"use client";

import { useEffect, useState } from "react";
import {
  X,
  User,
  Mail,
  Phone,
  FileText,
  Send,
  CheckCircle2,
  ClipboardCheck,
} from "@/components/ui/icons";
import { submitLeadData } from "@/app/actions/lead";
import { useConfiguratorStore } from "@/store/useConfiguratorStore";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useRouter, useParams } from "next/navigation";
import { saveConfiguration } from "@/app/actions/configurations";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { getQuotationProfileDefaults } from "@/app/actions/quotationProfile";
import DigitalSignaturePad from "@/components/ui/DigitalSignaturePad";
import { cn } from "@/lib/utils";
import ThaiPostalAddressFields from "@/components/ui/ThaiPostalAddressFields";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import ProgressiveImage from "@/components/ui/progressive-image";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const InstallationMapPicker = dynamic(() => import("../wizard/InstallationMapPicker"), {
  ssr: false,
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LeadCaptureModal({
  isOpen,
  onClose,
}: LeadCaptureModalProps) {
  const { user } = useUser();
  const store = useConfiguratorStore();
  const router = useRouter();
  const params = useParams();
  const t = useTranslations("ConfiguratorLeadCaptureModal");
  const localeParam = params?.locale;
  const locale = typeof localeParam === "string" ? localeParam : "th";
  const currencyFormatter = new Intl.NumberFormat(
    locale === "en" ? "en-US" : "th-TH",
    {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 0,
    },
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.user_metadata?.full_name || user?.user_metadata?.name || "",
    taxId: "",
    email: user?.email || "",
    phone: user?.phone || "",
    addressStreet: "",
    addressProvince: "",
    addressDistrict: "",
    addressSubdistrict: "",
    addressZip: "",
    notes: "",
  });
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState("");
  const [requiresInstallation, setRequiresInstallation] = useState(false);
  const [evaluationSubmitted, setEvaluationSubmitted] = useState(false);

  // Map coordinate states
  const [installationLatitude, setInstallationLatitude] = useState<number | null>(store.latitude || null);
  const [installationLongitude, setInstallationLongitude] = useState<number | null>(store.longitude || null);
  const [installationMapAddress, setInstallationMapAddress] = useState("");
  const [installationNotes, setInstallationNotes] = useState("");

  const handleClose = () => {
    setEvaluationSubmitted(false);
    setInstallationLatitude(store.latitude || null);
    setInstallationLongitude(store.longitude || null);
    setInstallationMapAddress("");
    setInstallationNotes("");
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    getQuotationProfileDefaults().then((result) => {
      if (!active || !result.defaults) return;
      setFormData((current) => ({
        ...current,
        name: current.name || result.defaults.fullLegalName,
        email: current.email || result.defaults.email,
        phone: current.phone || result.defaults.contactPhoneNumber,
        addressStreet: current.addressStreet || result.defaults.primaryAddress,
      }));
    });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const requiredFieldsFilled = !!(
    formData.name &&
    formData.email &&
    formData.phone &&
    formData.addressStreet &&
    formData.addressProvince &&
    formData.addressDistrict &&
    formData.addressSubdistrict &&
    formData.addressZip
  );

  const fullAddress = [
    formData.addressStreet,
    formData.addressSubdistrict,
    formData.addressDistrict,
    formData.addressProvince,
    formData.addressZip,
  ]
    .filter(Boolean)
    .join(", ");

  const panelProduct = store.selectedComponents["Solar Panels Selection"];
  const panelSpecs = asRecord(panelProduct?.metadata);
  const panelProductRecord = asRecord(panelProduct);
  const panelPower =
    parseFloat(
      String(
        panelSpecs.power ||
          panelSpecs.panelPower ||
          panelSpecs.powerRating ||
          panelProductRecord.power ||
          "500",
      ),
    ) || 500;

  const panelCount = store.panelCount || 1;
  const systemkWp =
    panelProduct && panelProduct.id !== "none"
      ? (panelCount * panelPower) / 1000
      : 5.0;

  const sunHours = 5.0;
  const defaultRoofEfficiency = 95;
  const defaultDaytimeUsagePercent = 70;
  const defaultElectricityRate = 4.5;

  const totalDailyKwh =
    systemkWp * sunHours * (defaultRoofEfficiency / 100);
  const totalMonthlyKwh = totalDailyKwh * 30;
  const estimatedSavings =
    totalMonthlyKwh *
    (defaultDaytimeUsagePercent / 100) *
    defaultElectricityRate;

  const paybackPeriod =
    estimatedSavings > 0
      ? (store.totalPrice / (estimatedSavings * 12)).toFixed(1)
      : "0.0";

  const handleFormSubmit = async (
    method: "DIGITAL" | "MANUAL" | "EVALUATION",
  ) => {
    if (!requiredFieldsFilled) {
      toast.error(t("errors.requiredFields"));
      return;
    }

    if (!pdpaConsent) {
      toast.error(t("errors.pdpaRequired"));
      return;
    }

    if (method === "DIGITAL" && !signatureBase64) {
      toast.error(t("errors.signatureRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      let savedConfigurationId = undefined;

      // 1. If user is logged in, auto-save config first
      if (user) {
        const componentIds = Object.values(store.selectedComponents)
          .filter((c) => c !== null)
          .map((c) => c!.id);
        const saveResult = await saveConfiguration(
          componentIds,
          store.totalPrice,
        );
        if (saveResult.success && saveResult.data) {
          savedConfigurationId = saveResult.data.id;
        }
      }

      const items = Object.entries(store.selectedComponents)
        .filter(([, c]) => c !== null && c.id !== "none")
        .map(([categoryName, component]) => {
          const isPanel = categoryName === "Solar Panels Selection";
          const qty = isPanel ? panelCount : 1;
          return {
            categoryName,
            productName: component!.name,
            quantity: qty,
            unitPrice: component!.price,
            totalPrice: component!.price * qty,
            productId: component!.id,
          };
        });

      // 3. Submit lead and generate PDF
      const result = await submitLeadData({
        name: formData.name,
        taxId: formData.taxId || undefined,
        email: formData.email,
        phone: formData.phone,
        location: fullAddress || undefined,
        items,
        totalPrice: store.totalPrice,
        savedConfigurationId,
        systemkWp,
        panelCount,
        estimatedSavings,
        paybackPeriod,
        meterType: "NORMAL",
        electricityRate: defaultElectricityRate,
        latitude: installationLatitude || store.latitude || undefined,
        longitude: installationLongitude || store.longitude || undefined,
        signatureBase64: method === "DIGITAL" ? signatureBase64 : undefined,
        signMethod: method,
        requiresInstallation,
        fulfillmentType: requiresInstallation
          ? "INSTALLATION"
          : "SUPPLY_ONLY",
        notes: requiresInstallation ? installationNotes : formData.notes || undefined,
        propertyType: (store.wizardAnswers.propertyType as string) || "home",
        monthlyBill: store.wizardAnswers.monthlyBill ? Number(store.wizardAnswers.monthlyBill) : undefined,
      });

      if (result.success) {
        if (result.proposalId) {
          toast.success(
            requiresInstallation
              ? t("toast.evaluationSubmitted")
              : t("toast.quoteSubmitted"),
          );
          handleClose();
          router.push(
            `/${locale}/proposals?activeId=${encodeURIComponent(result.proposalId)}`,
          );
          return;
        }

        if (requiresInstallation) {
          toast.success(t("toast.evaluationSubmitted"));
          setEvaluationSubmitted(true);
          return;
        }

        toast.success(t("toast.quoteSubmitted"));
        if (result.url) {
          window.open(result.url, "_blank");
        }
        handleClose();
        router.push(`/${locale}/proposals`);
      } else {
        toast.error(result.error || t("errors.submitFailed"));
      }
    } catch (error) {
      console.error(error);
      toast.error(t("errors.saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldCls =
    "w-full px-4 py-3 rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] text-sm text-[#2E2C27] placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9] outline-none transition-all";

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      size="full"
      tone="light"
      ariaLabel={t("summary.title")}
      closeLabel={t("aria.closeModal")}
      dismissible={!isSubmitting}
      className="h-dvh max-h-dvh w-screen max-w-none rounded-none border-0 bg-[#F0EEE9]"
    >
      <DialogContent className="flex-col lg:flex-row">
      {/* Sticky Floating Close Button (X) */}
      <button
        type="button"
        onClick={handleClose}
        disabled={isSubmitting}
        className="layer-floating absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] inline-flex size-11 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#F0EEE9] text-[#2E2C27] transition-colors hover:bg-[#E6E3DC] disabled:cursor-wait disabled:opacity-50 lg:right-6 lg:top-6"
        aria-label={t("aria.closeModal")}
      >
        <X className="h-5 w-5 lg:h-6 lg:w-6" />
      </button>

      {/* Left Panel (Summary - 40%): bg-[#2E2C27], text-white */}
      <div className="flex h-auto max-h-[42dvh] w-full shrink-0 flex-col justify-between overflow-y-auto bg-[#2E2C27] p-5 pt-[calc(1.25rem+env(safe-area-inset-top))] text-white sm:max-h-[38dvh] sm:p-6 lg:h-full lg:max-h-none lg:w-[40%] lg:p-12">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-[10px] font-black tracking-widest uppercase bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/20">
              {t("summary.badge")}
            </span>
          </div>
          
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight mb-2">
            {t("summary.title")}
          </h2>
          <p className="text-xs text-slate-400 font-medium mb-8 uppercase tracking-wide">
            {t("summary.description")}
          </p>

          {/* Performance metrics dashboard style */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t("summary.systemSize")}</p>
	              <p className="text-lg font-black mt-1 text-white"><AnimatedNumber value={systemkWp} decimals={2} suffix=" kWp" /></p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t("summary.panelsCount")}</p>
	              <p className="text-lg font-black mt-1 text-white"><AnimatedNumber value={panelCount} formatter={(count) => t("metrics.panelCountValue", { count: Math.round(count) })} /></p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t("summary.monthlySavings")}</p>
	              <p className="text-lg font-black mt-1 text-emerald-400"><AnimatedNumber value={estimatedSavings} formatter={(amount) => currencyFormatter.format(Math.round(amount))} /></p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t("summary.paybackPeriod")}</p>
              <p className="text-lg font-black mt-1 text-amber-400">{t("metrics.paybackValue", { value: paybackPeriod })}</p>
            </div>
          </div>

          {/* Selected items list */}
          <div className="space-y-4 mb-8">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              {t("summary.billOfMaterials")}
            </h3>
            
            <div className="space-y-3 max-h-[30vh] lg:max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(store.selectedComponents)
                .filter(([, c]) => c !== null && c.id !== "none")
                .map(([categoryName, component]) => {
                  const isPanel = categoryName === "Solar Panels Selection";
                  const qty = isPanel ? panelCount : 1;
                  return (
                    <div key={categoryName} className="flex gap-4 p-3 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-800 rounded-xl transition-all items-center">
                      {component!.imageUrl ? (
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-700">
                          <ProgressiveImage
                            src={component!.imageUrl}
                            alt={component!.name}
                            fill
                            sizes="48px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 border border-slate-700">
                          <FileText className="w-6 h-6 text-slate-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{categoryName}</p>
                        <h4 className="text-xs font-bold text-white truncate mt-0.5">{component!.name}</h4>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-slate-400">x{qty}</p>
                        <p className="text-xs font-black text-white mt-0.5">{currencyFormatter.format(component!.price * qty)}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Grand Total Footer in Left Column */}
        <div className="border-t border-slate-800 pt-6 mt-auto">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("summary.estimatedGrandTotal")}</p>
              <p className="text-[9px] text-slate-500 font-medium">{t("summary.taxLaborIncluded")}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl lg:text-3xl font-black text-white tracking-tight">
	                <AnimatedNumber value={store.totalPrice} formatter={(amount) => currencyFormatter.format(Math.round(amount))} />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel (Form - 60%): bg-[#F0EEE9], overflow-y-auto relative */}
      <div className="relative flex min-h-0 flex-1 flex-col justify-start overflow-y-auto bg-[#F0EEE9] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6 lg:h-full lg:w-[60%] lg:justify-center lg:p-12">
        <div className="mx-auto w-full max-w-2xl py-4 lg:py-8">
          {evaluationSubmitted ? (
            <div className="py-8 text-center space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-[#2E2C27]">
                {t("evaluationSuccess.title")}
              </h3>
              <p className="mx-auto max-w-sm text-sm leading-7 text-[#4E4B44]">
                {t("evaluationSuccess.description")}
              </p>
              <div className="mt-6 rounded-2xl bg-[#E6E3DC] px-4 py-3 text-left text-xs leading-6 text-[#4E4B44] border border-[#F7F6F3]">
                <strong className="text-[#2E2C27] font-bold">{t("evaluationSuccess.staffWorkflowLabel")}</strong>{" "}
                {t("evaluationSuccess.staffWorkflow")}
              </div>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  router.push(`/${locale}/proposals`);
                }}
                className="px-8 py-3 bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white text-xs font-semibold uppercase tracking-wider rounded-full transition-all cursor-pointer shadow-sm active:scale-95"
              >
                {t("actions.done")}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#7CA8D0]/20 bg-[#DCE8F5] text-[#4F7FA8] text-[9px] uppercase tracking-widest font-bold mb-3">
                  <FileText className="w-3.5 h-3.5 text-[#4F7FA8]" />
                  <span>{t("form.badge")}</span>
                </div>
                <h3 className="text-2xl font-bold text-[#2E2C27] tracking-tight">
                  {t("form.title")}
                </h3>
                <p className="text-xs text-[#4E4B44] font-medium mt-1">
                  {t("form.description")}
                </p>
              </div>

              <form
                id="lead-form"
                onSubmit={(e) => e.preventDefault()}
                className="space-y-4"
              >
                {/* ① Name / Company */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    {t("form.nameLabel")}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className={fieldCls}
                    placeholder={t("form.namePlaceholder")}
                  />
                </div>

                {/* ② Tax ID (Optional) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    {t("form.taxIdLabel")}
                    <span className="text-slate-400 text-xs font-normal">
                      {t("form.taxIdOptional")}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.taxId}
                    onChange={(e) =>
                      setFormData({ ...formData, taxId: e.target.value })
                    }
                    className={fieldCls}
                    placeholder="e.g. 0105562000000"
                    maxLength={13}
                  />
                </div>

                {/* ③ Email + Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" /> {t("form.emailLabel")}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className={fieldCls}
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" /> {t("form.phoneLabel")}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className={fieldCls}
                      placeholder="08X-XXX-XXXX"
                    />
                  </div>
                </div>

                {/* ④ Postal-code-first address */}
                <ThaiPostalAddressFields
                  postalCode={formData.addressZip}
                  province={formData.addressProvince}
                  district={formData.addressDistrict}
                  subdistrict={formData.addressSubdistrict}
                  addressDetails={formData.addressStreet}
                  onPostalCodeChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      addressZip: value,
                    }))
                  }
                  onProvinceChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      addressProvince: value,
                    }))
                  }
                  onDistrictChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      addressDistrict: value,
                    }))
                  }
                  onSubdistrictChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      addressSubdistrict: value,
                    }))
                  }
                  onAddressDetailsChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      addressStreet: value,
                    }))
                  }
                  inputClassName={fieldCls}
                  labelClassName="text-sm font-semibold text-slate-700 flex items-center gap-2"
                />

                {/* Installation Service Routing */}
                <div className="rounded-2xl bg-[#E6E3DC] p-4 border border-[#F7F6F3]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                      <ClipboardCheck className="h-4 w-4 text-[#4F7FA8]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#2E2C27]">
                        {t("installation.title")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#4E4B44]">
                        {t("installation.description")}
                      </p>
                      <div className="mt-3 flex border-b border-[#CBC7BE]">
                        {[
                          {
                            value: false,
                            label: t("installation.noLabel"),
                            hint: t("installation.noHint"),
                          },
                          {
                            value: true,
                            label: t("installation.yesLabel"),
                            hint: t("installation.yesHint"),
                          },
                        ].map((option) => {
                          const selected =
                            requiresInstallation === option.value;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() => {
                                setRequiresInstallation(option.value);
                                if (option.value) {
                                  setSignatureBase64("");
                                }
                              }}
                              className={cn(
                                "flex-1 py-3 text-center transition-all focus:outline-none cursor-pointer border-b-2",
                                selected
                                  ? "text-[#4F7FA8] border-[#7CA8D0] font-bold bg-transparent"
                                  : "text-[#4E4B44] border-transparent bg-transparent hover:text-[#2E2C27]",
                              )}
                            >
                              <span className="block text-xs font-bold">
                                {option.label}
                              </span>
                              <span
                                className={cn(
                                  "mt-0.5 block text-[9px] font-bold uppercase tracking-wider",
                                  selected
                                    ? "text-[#4F7FA8]/80"
                                    : "text-[#4E4B44]",
                                )}
                              >
                                {option.hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes (optional) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />{" "}
                    {t("form.additionalNotesLabel")}
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className={`${fieldCls} min-h-[60px]`}
                    placeholder={t("form.additionalNotesPlaceholder")}
                  />
                </div>

                {/* ⑤ PDPA Consent */}
                <div className="pt-1">
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
                            ? "bg-slate-900 border-slate-900"
                            : "bg-white border-slate-300 group-hover:border-slate-500",
                        )}
                      >
                        {pdpaConsent && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-600 leading-relaxed">
                      {t("form.pdpaConsent")}
                      <span className="text-rose-500 ml-0.5">*</span>
                    </span>
                  </label>
                </div>

                {/* ⑥ E-Signature Pad */}
                {!requiresInstallation && (
                  <div className="pt-2">
                    <DigitalSignaturePad
                      required
                      label={t("form.signatureLabel")}
                      onSign={(sig) => setSignatureBase64(sig)}
                    />
                  </div>
                )}

                {requiresInstallation && (
                  <div className="pt-2">
                    <InstallationMapPicker
                      latitude={installationLatitude}
                      longitude={installationLongitude}
                      address={installationMapAddress}
                      notes={installationNotes}
                      onChange={({ latitude, longitude, address }) => {
                        setInstallationLatitude(latitude);
                        setInstallationLongitude(longitude);
                        setInstallationMapAddress(address);
                      }}
                      onNotesChange={setInstallationNotes}
                    />
                  </div>
                )}
              </form>

              {/* Submit Buttons */}
              <div className="mt-8 flex flex-col gap-3">
                {requiresInstallation ? (
                  <button
                    type="button"
                    disabled={
                      isSubmitting || !pdpaConsent || !requiredFieldsFilled
                    }
                    onClick={() => handleFormSubmit("EVALUATION")}
                    className="w-full bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white font-semibold py-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm hover:shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <GsapSpinner className="w-5 h-5" />
                        {t("actions.sendingEvaluation")}
                      </>
                    ) : (
                      <>
                        <ClipboardCheck className="w-5 h-5" />
                        {t("actions.submitEvaluation")}
                      </>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={
                        isSubmitting || !pdpaConsent || !requiredFieldsFilled
                      }
                      onClick={() => handleFormSubmit("DIGITAL")}
                      className="w-full bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white font-semibold py-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm hover:shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <GsapSpinner className="w-5 h-5" />
                          {t("actions.processing")}
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          {t("actions.signSubmit")}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={
                        isSubmitting || !requiredFieldsFilled
                      }
                      onClick={() => handleFormSubmit("MANUAL")}
                      className="w-full border border-[#8E8B83] text-[#4F7FA8] bg-transparent hover:bg-[#DCE8F5]/50 font-semibold py-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {t("actions.downloadSignLater")}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
