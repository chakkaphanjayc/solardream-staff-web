"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Mail, Phone, User, FileText, ClipboardCheck } from "@/components/ui/icons";
import dynamic from "next/dynamic";
import { submitLeadData } from "@/app/actions/lead";
import { getQuotationProfileDefaults } from "@/app/actions/quotationProfile";
import { useCartStore } from "@/store/useCartStore";
import { useRouter, useParams } from "next/navigation";
import DigitalSignaturePad from "@/components/ui/DigitalSignaturePad";
import PaymentDecisionModal from "@/components/payments/PaymentDecisionModal";
import { initiatePaymentSession } from "@/actions/initiatePaymentSession";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CartItem } from "@/store/useCartStore";
import ThaiPostalAddressFields from "@/components/ui/ThaiPostalAddressFields";
import ProgressiveImage from "@/components/ui/progressive-image";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const InstallationMapPicker = dynamic(() => import("./wizard/InstallationMapPicker"), {
  ssr: false,
});

interface CartLeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  totalPrice: number;
}

export default function CartLeadCaptureModal({
  isOpen,
  onClose,
  items,
  totalPrice,
}: CartLeadCaptureModalProps) {
  const t = useTranslations("CartLeadCaptureModal");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressProvince, setAddressProvince] = useState("");
  const [addressDistrict, setAddressDistrict] = useState("");
  const [addressSubdistrict, setAddressSubdistrict] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState("");
  const [success, setSuccess] = useState(false);
  const [requiresInstallation, setRequiresInstallation] = useState(false);
  const [evaluationSubmitted, setEvaluationSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [proposalId, setProposalId] = useState<string | undefined>(undefined);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);

  // Map coordinate states
  const [installationLatitude, setInstallationLatitude] = useState<number | null>(null);
  const [installationLongitude, setInstallationLongitude] = useState<number | null>(null);
  const [installationMapAddress, setInstallationMapAddress] = useState("");
  const [installationNotes, setInstallationNotes] = useState("");

  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || "th";
  const currencyFormatter = new Intl.NumberFormat(locale === "en" ? "en-US" : "th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });
  const clearCart = useCartStore((state) => state.clearCart);

  const handleClose = () => {
    setSuccess(false);
    setEvaluationSubmitted(false);
    setName("");
    setTaxId("");
    setEmail("");
    setPhone("");
    setAddressStreet("");
    setAddressProvince("");
    setAddressDistrict("");
    setAddressSubdistrict("");
    setAddressZip("");
    setPdpaConsent(false);
    setSignatureBase64("");
    setRequiresInstallation(false);
    setInstallationLatitude(null);
    setInstallationLongitude(null);
    setInstallationMapAddress("");
    setInstallationNotes("");
    setProposalId(undefined);
    setShowPaymentModal(false);
    onClose();
  };

  const continueToProposalHub = (activeProposalId?: string) => {
    onClose();
    setShowPaymentModal(false);
    const destination = activeProposalId
      ? `/${locale}/proposals?activeId=${encodeURIComponent(activeProposalId)}`
      : `/${locale}/proposals`;
    router.push(destination);
  };

  const handleProceedToPayment = async () => {
    if (!proposalId) return;

    setIsInitiatingPayment(true);
    try {
      const result = await initiatePaymentSession(proposalId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.warning) {
        toast.warning(result.warning, { duration: 6000 });
      }

      const query = new URLSearchParams({
        paymentSession: result.transactionId,
      });
      onClose();
      setShowPaymentModal(false);
      router.push(
        `/${locale}/checkout/${proposalId}/payment?${query.toString()}`,
      );
    } catch (error) {
      console.error("[CART CHECKOUT] Failed to start payment session.", error);
      toast.error("ไม่สามารถเริ่มรอบชำระเงินได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsInitiatingPayment(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    getQuotationProfileDefaults().then((result) => {
      if (!active || !result.defaults) return;
      setName((current) => current || result.defaults.fullLegalName);
      setEmail((current) => current || result.defaults.email);
      setPhone((current) => current || result.defaults.contactPhoneNumber);
      setAddressStreet((current) => current || result.defaults.primaryAddress);
    });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const fullAddress = [
    addressStreet,
    addressSubdistrict,
    addressDistrict,
    addressProvince,
    addressZip,
  ]
    .filter(Boolean)
    .join(", ");

  const requiredFieldsFilled = !!(
    name &&
    email &&
    phone &&
    addressStreet &&
    addressProvince &&
    addressDistrict &&
    addressSubdistrict &&
    addressZip
  );

  const handleFormSubmit = async (method: "DIGITAL" | "MANUAL" | "EVALUATION") => {
    if (!requiredFieldsFilled) {
      setErrorMsg(
        t("errors.requiredFields"),
      );
      return;
    }

    if (method !== "EVALUATION" && !pdpaConsent) {
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

    // Map cart items for PDF generator BOM
    const mappedItems = items.map((item) => ({
      categoryName: item.product.category.name,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.product.price,
      totalPrice: item.product.price * item.quantity,
      productId: item.product.id,
    }));

    try {
      const res = await submitLeadData({
        name,
        taxId: taxId || undefined,
        email,
        phone,
        location: fullAddress,
        items: mappedItems,
        totalPrice,
        signatureBase64: method === "DIGITAL" ? signatureBase64 : undefined,
        signMethod: method,
        requiresInstallation,
        fulfillmentType: requiresInstallation
          ? "INSTALLATION"
          : "SUPPLY_ONLY",
        latitude: installationLatitude || undefined,
        longitude: installationLongitude || undefined,
        notes: requiresInstallation ? installationNotes : undefined,
      });

      if (res.error) {
        setErrorMsg(res.error);
        setIsSubmitting(false);
        return;
      }

      if (res.proposalId) {
        const activeId = encodeURIComponent(res.proposalId);
        toast.success(
          requiresInstallation
            ? t("toast.evaluationSubmitted")
            : t("success.title"),
        );
        clearCart();

        if (!requiresInstallation && method === "DIGITAL") {
          setProposalId(res.proposalId);
          setSuccess(true);
          setShowPaymentModal(true);
          setIsSubmitting(false);
          return;
        }

        router.push(`/${locale}/proposals?activeId=${activeId}`);
        return;
      }

      if (requiresInstallation) {
        toast.success(t("toast.evaluationSubmitted"));
        setEvaluationSubmitted(true);
        setIsSubmitting(false);
        clearCart();
        return;
      }

      setSuccess(true);
      setProposalId(res.proposalId);
      setIsSubmitting(false);
      clearCart();

      if (res.url) {
        window.open(res.url, "_blank");
      }
    } catch (error) {
      console.error(error);
      setErrorMsg(t("errors.saveFailed"));
      setIsSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-4 py-3 bg-[#F7F6F3] border-0 border-b-2 border-[#8E8B83] focus:border-[#7CA8D0] focus:bg-[#F0EEE9] rounded-t-xl rounded-b-none text-xs font-bold text-[#2E2C27] focus:outline-none transition-all placeholder:text-[#8E8B83] placeholder:font-medium";

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      size="full"
      tone="light"
      ariaLabel={t("summary.title")}
      closeLabel={t("aria.closeModal")}
      dismissible={!isSubmitting && !isInitiatingPayment}
      className="h-dvh max-h-dvh w-screen max-w-none rounded-none border-0 bg-[#F0EEE9]"
    >
      <DialogContent className="flex-col lg:flex-row">
      {/* Sticky Floating Close Button (X) */}
      <button
        type="button"
        onClick={handleClose}
        disabled={isSubmitting || isInitiatingPayment}
        className="layer-floating sd-safe-top-4 absolute right-4 inline-flex size-11 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#F0EEE9]/90 text-[#4E4B44] shadow-sm backdrop-blur-md transition-colors hover:bg-[#E6E3DC] hover:text-[#2E2C27] active:scale-95 disabled:cursor-wait disabled:opacity-50 lg:right-6 lg:top-6"
        aria-label={t("aria.closeModal")}
      >
        <X className="h-5 w-5 lg:h-6 lg:w-6" />
      </button>

      {/* Left Panel (Summary - 40%): M3 Dark Surface (#2E2C27), text-white */}
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

          {/* Selected items list */}
          <div className="space-y-4 mb-8">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#CBC7BE] border-b border-white/10 pb-2">
              {t("summary.cartItems")}
            </h3>
            
            <div className="space-y-3 max-h-[45vh] lg:max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
              {items.map((item) => (
                <div key={item.product.id} className="flex gap-4 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[20px] transition-all items-center">
                  {item.product.imageUrl ? (
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/10">
                      <ProgressiveImage
                        src={item.product.imageUrl}
                        alt={item.product.name}
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
                    <p className="text-[9px] font-black text-[#A5C2DE] uppercase tracking-widest truncate">{item.product.category.name}</p>
                    <h4 className="text-xs font-bold text-white truncate mt-0.5">{item.product.name}</h4>
                    {item.product.erpnextItemCode && (
                      <p className="text-[10px] text-[#938F99] font-mono mt-0.5">
                        SKU: {item.product.erpnextItemCode}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold text-[#CBC7BE]">x{item.quantity}</p>
                    <p className="text-xs font-black text-white mt-0.5">{currencyFormatter.format(item.product.price * item.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Grand Total Footer in Left Column */}
        <div className="border-t border-white/10 pt-6 mt-auto">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[#CBC7BE] uppercase tracking-widest">{t("summary.grandTotal")}</p>
              <p className="text-[9px] text-[#938F99] font-medium">{t("summary.taxIncluded")}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl lg:text-3xl font-black text-white tracking-tight">
                {currencyFormatter.format(totalPrice)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel (Form - 60%): bg-[#F0EEE9], overflow-y-auto relative */}
      <div className="sd-safe-pb-5-add relative flex min-h-0 flex-1 flex-col justify-start overflow-y-auto bg-[#F0EEE9] px-5 pt-6 sm:px-6 lg:h-full lg:w-[60%] lg:px-12 lg:pb-16 lg:pt-24">
        <div className="w-full max-w-2xl mx-auto">
          {evaluationSubmitted ? (
            <div className="py-8 text-center space-y-6">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <GsapPulse scale={1.1}>
                  <ClipboardCheck className="h-10 w-10 text-emerald-500" />
                </GsapPulse>
              </div>
              <h3 className="text-xl font-black text-[#2E2C27] uppercase">
                {t("evaluationSuccess.title")}
              </h3>
              <p className="mx-auto max-w-sm text-sm leading-7 text-[#4E4B44] font-semibold">
                {t("evaluationSuccess.description")}
              </p>
              <div className="mt-6 rounded-[24px] bg-[#E6E3DC] px-5 py-4 text-left text-xs leading-6 text-[#4E4B44] border border-[#F7F6F3] font-medium">
                <strong className="text-[#2E2C27]">{t("evaluationSuccess.staffWorkflowLabel")}</strong> {t("evaluationSuccess.staffWorkflow")}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="px-8 py-3 bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white text-[10px] font-black uppercase tracking-widest rounded-full transition-all cursor-pointer shadow-md active:scale-95"
              >
                {t("actions.done")}
              </button>
            </div>
          ) : success ? (
            <div className="text-center py-12 space-y-6">
              <GsapPulse className="w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-500" scale={1.08}>
                <span className="text-3xl">✓</span>
              </GsapPulse>
              <div>
                <h4 className="text-lg font-black text-[#2E2C27] uppercase">
                  {t("success.title")}
                </h4>
                <p className="text-sm text-[#4E4B44] font-semibold mt-1 max-w-sm mx-auto">
                  {t("success.description")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSuccess(false);
                  setName("");
                  setEmail("");
                  setPhone("");
                  setAddressStreet("");
                  setAddressProvince("");
                  setAddressDistrict("");
                  setAddressSubdistrict("");
                  setAddressZip("");
                  continueToProposalHub(proposalId);
                }}
                className="px-8 py-3 bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white text-[10px] font-black uppercase tracking-widest rounded-full transition-all cursor-pointer shadow-md active:scale-95"
              >
                {t("actions.done")}
              </button>
            </div>
          ) : (
            <>
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

              <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-[20px] px-4 py-2.5 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                {/* ① Name / Company */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4E4B44] flex items-center gap-2">
                    <User className="w-4 h-4 text-[#8E8B83]" />
                    {t("form.nameLabel")}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t("form.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* ② Tax ID (Optional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4E4B44] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#8E8B83]" />
                    {t("form.taxIdLabel")}
                    <span className="text-[#8E8B83] text-xs font-normal">
                      {t("form.taxIdOptional")}
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0105562000000"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    maxLength={13}
                    className={inputCls}
                  />
                </div>

                {/* ③ Email + Phone side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#4E4B44] flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#8E8B83]" /> {t("form.emailLabel")}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="somchai@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#4E4B44] flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[#8E8B83]" /> {t("form.phoneLabel")}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="0812345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* ④ Postal-code-first address */}
                <ThaiPostalAddressFields
                  postalCode={addressZip}
                  province={addressProvince}
                  district={addressDistrict}
                  subdistrict={addressSubdistrict}
                  addressDetails={addressStreet}
                  onPostalCodeChange={setAddressZip}
                  onProvinceChange={setAddressProvince}
                  onDistrictChange={setAddressDistrict}
                  onSubdistrictChange={setAddressSubdistrict}
                  onAddressDetailsChange={setAddressStreet}
                  inputClassName={inputCls}
                  labelClassName="text-xs font-bold text-[#4E4B44] flex items-center gap-2"
                />

                {/* Installation service */}
                <div className="rounded-[24px] bg-[#E6E3DC] p-5 border border-[#F7F6F3]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label className="text-sm font-black text-[#2E2C27] flex items-center gap-2">
                        {t("installation.title")}
                        <span className="text-rose-500">*</span>
                      </label>
                      <p className="mt-1 text-xs leading-relaxed text-[#4E4B44] font-medium">
                        {t("installation.description")}
                      </p>
                      <div className="mt-3 flex border-b border-[#CBC7BE]">
                        {[
                          {
                            value: false,
                            label: t("installation.purchaseOnly"),
                            hint: t("installation.purchaseOnlyHint"),
                          },
                          {
                            value: true,
                            label: t("installation.purchaseInstallation"),
                            hint: t("installation.purchaseInstallationHint"),
                          },
                        ].map((option) => {
                          const selected = requiresInstallation === option.value;
                          return (
                            <button
                              key={option.hint}
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
                                  ? "text-[#4F7FA8] border-[#7CA8D0] font-bold bg-[#DCE8F5]/60 rounded-t-xl"
                                  : "text-[#4E4B44] border-transparent bg-transparent hover:text-[#2E2C27]",
                              )}
                            >
                              <span className="block text-xs font-black">
                                {option.label}
                              </span>
                              <span
                                className={cn(
                                  "mt-0.5 block text-[9px] font-black uppercase tracking-wider",
                                  selected ? "text-[#4F7FA8]/80" : "text-[#8E8B83]"
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
                            ? "bg-[#B7D1EA] border-[#7CA8D0]"
                            : "bg-[#F0EEE9] border-[#8E8B83] group-hover:border-[#7CA8D0]",
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
                    <span className="text-xs font-medium text-[#4E4B44] leading-relaxed">
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

                <div className="pt-4 flex flex-col gap-3">
                  {requiresInstallation ? (
                    <button
                      type="button"
                      disabled={
                        isSubmitting || !pdpaConsent || !requiredFieldsFilled
                      }
                      onClick={() => handleFormSubmit("EVALUATION")}
                      className="w-full py-4 bg-[#B7D1EA] text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all duration-300 ease-expo-out hover:scale-[1.01] active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#A5C2DE]"
                    >
                      {isSubmitting ? (
                        <>
                          <GsapSpinner className="w-4 h-4 text-white" />
                          <span>{t("actions.processing")}</span>
                        </>
                      ) : (
                        <>
                          <ClipboardCheck className="w-4 h-4 text-white" />
                          <span>{t("actions.submitEvaluation")}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <>
                      {/* Primary — DIGITAL */}
                      <button
                        type="button"
                        disabled={
                          isSubmitting || !pdpaConsent || !requiredFieldsFilled
                        }
                        onClick={() => handleFormSubmit("DIGITAL")}
                        className="w-full py-4 bg-[#B7D1EA] text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all duration-300 ease-expo-out hover:scale-[1.01] active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#A5C2DE]"
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
                        className="w-full py-4 bg-[#DCE8F5] text-[#2E2C27] font-bold text-xs uppercase tracking-widest rounded-full transition-all duration-300 ease-expo-out hover:scale-[1.01] active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#DBCDEE] shadow-sm"
                      >
                        {t("actions.downloadSignLater")}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
      <PaymentDecisionModal
        isOpen={showPaymentModal}
        isProcessing={isInitiatingPayment}
        onProceedToPayment={handleProceedToPayment}
        onClose={() => continueToProposalHub(proposalId)}
      />
      </DialogContent>
    </Dialog>
  );
}
