"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Save, ShieldCheck, FileText, Building2, CalendarRange, Scale, AlertCircle } from "@/components/ui/icons";
import { saveQuotationSettings } from "@/app/actions/quotationSettings";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface QuotationSettingsData {
  id?: string;
  companyName: string;
  companyAddress: string;
  taxId: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxMode: string;
  termsAndConditions: string;
  paymentDetails: string;
  validityDays: number;
}

interface QuotationSettingsClientProps {
  initialSettings: QuotationSettingsData | null;
}

export default function QuotationSettingsClient({ initialSettings }: QuotationSettingsClientProps) {
  const t = useTranslations("AdminQuotationSettings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [companyName, setCompanyName] = useState(initialSettings?.companyName ?? "Solar Dream Co., Ltd.");
  const [companyAddress, setCompanyAddress] = useState(initialSettings?.companyAddress ?? "");
  const [taxId, setTaxId] = useState(initialSettings?.taxId ?? "");
  const [phone, setPhone] = useState(initialSettings?.phone ?? "");
  const [email, setEmail] = useState(initialSettings?.email ?? "");
  const [website, setWebsite] = useState(initialSettings?.website ?? "solardream.co.th");
  const [validityDays, setValidityDays] = useState(initialSettings?.validityDays ? String(initialSettings.validityDays) : "30");
  const [taxMode, setTaxMode] = useState(initialSettings?.taxMode ?? "EXCLUSIVE");
  const [termsAndConditions, setTermsAndConditions] = useState(initialSettings?.termsAndConditions ?? "");
  const [paymentDetails, setPaymentDetails] = useState(initialSettings?.paymentDetails ?? "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) {
      toast.error(t("validation.companyNameRequired"));
      return;
    }
    if (!companyAddress.trim()) {
      toast.error(t("validation.companyAddressRequired"));
      return;
    }
    if (taxId.trim().length !== 13) {
      toast.error(t("validation.taxIdLength"));
      return;
    }
    const days = parseInt(validityDays);
    if (isNaN(days) || days <= 0) {
      toast.error(t("validation.validityDays"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveQuotationSettings({
          companyName: companyName.trim(),
          companyAddress: companyAddress.trim(),
          taxId: taxId.trim(),
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          website: website?.trim() || null,
          taxMode,
          termsAndConditions: termsAndConditions.trim(),
          paymentDetails: paymentDetails.trim(),
          validityDays: days,
        });

        if (res.success) {
          toast.success(t("toast.saveSuccess"));
          router.refresh();
        } else {
          toast.error(res.error || t("toast.saveFailed"));
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : t("toast.serverError"));
      }
    });
  };

  const handleTaxIdChange = (val: string) => {
    // Only numeric, max 13 digits
    const cleaned = val.replace(/\D/g, "").slice(0, 13);
    setTaxId(cleaned);
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
            Quotation <span className="text-[#B7D1EA] drop-shadow-none bg-slate-900 px-3 py-1 rounded-2xl">Settings</span>
          </h1>
          <p className="text-gray-400 text-xs mt-2 uppercase font-black tracking-widest">
            Configure company information, terms, payment details, and expiration defaults for solar proposal document generation.
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-[#0F172A] border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-gray-300 shadow-none">
          <ShieldCheck className="w-4 h-4 text-gray-100" />
          <span>Active Configuration</span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column: Company Information */}
          <div className="space-y-6 rounded-[2rem] border border-[#1E293B] bg-[#0B1121]/70 p-6 sm:p-8 shadow-none">
            <div className="flex items-center gap-2.5 border-b border-[#1E293B]/80 pb-4">
              <Building2 className="w-5 h-5 text-gray-300" />
              <h2 className="text-lg font-black text-gray-100 uppercase tracking-wide">{t("sections.companyInfo")}</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                  {t("fields.companyName")} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all"
                  placeholder={t("placeholders.companyName")}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                    {t("fields.taxId")} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={13}
                    value={taxId}
                    onChange={(e) => handleTaxIdChange(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all font-mono"
                    placeholder={t("placeholders.taxId")}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                    {t("fields.phone")}
                  </label>
                  <input
                    type="text"
                    value={phone ?? ""}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all"
                    placeholder={t("placeholders.phone")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                    {t("fields.email")}
                  </label>
                  <input
                    type="email"
                    value={email ?? ""}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all"
                    placeholder="contact@solardream.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                    {t("fields.website")}
                  </label>
                  <input
                    type="text"
                    value={website ?? ""}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all"
                    placeholder="www.solardream.co.th"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                  {t("fields.companyAddress")} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all resize-none"
                  placeholder={t("placeholders.companyAddress")}
                />
              </div>
            </div>
          </div>

          {/* Right Column: Validity Days & Rules */}
          <div className="space-y-6 rounded-[2rem] border border-[#1E293B] bg-[#0B1121]/70 p-6 sm:p-8 shadow-none flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-2.5 border-b border-[#1E293B]/80 pb-4">
                <CalendarRange className="w-5 h-5 text-gray-300" />
                <h2 className="text-lg font-black text-gray-100 uppercase tracking-wide">{t("sections.documentRules")}</h2>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                    {t("fields.validityDays")} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={validityDays}
                    onChange={(e) => setValidityDays(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all font-mono"
                    placeholder={t("placeholders.validityDays")}
                  />
                  <p className="text-[10px] text-gray-500 font-semibold mt-1">
                    {t("hints.validityDays")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                    {t("fields.taxMode")} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={taxMode}
                    onChange={(e) => setTaxMode(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all"
                  >
                    <option value="EXCLUSIVE">{t("taxModes.exclusive")}</option>
                    <option value="INCLUSIVE">{t("taxModes.inclusive")}</option>
                    <option value="NONE">{t("taxModes.none")}</option>
                  </select>
                  <p className="text-[10px] text-gray-500 font-semibold mt-1">
                    {t("hints.taxMode")}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#B7D1EA]/20 border border-[#B7D1EA]/40 rounded-2xl p-4 mt-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
              <div className="text-xs font-medium text-gray-300 leading-relaxed">
                <p className="font-bold text-gray-100">{t("pdfInfo.title")}</p>
                {t("pdfInfo.description")}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Terms and payment Details */}
        <div className="rounded-[2rem] border border-[#1E293B] bg-[#0B1121]/70 p-6 sm:p-8 shadow-none space-y-6">
          <div className="flex items-center gap-2.5 border-b border-[#1E293B]/80 pb-4">
            <Scale className="w-5 h-5 text-gray-300" />
            <h2 className="text-lg font-black text-gray-100 uppercase tracking-wide">{t("sections.termsPayment")}</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                {t("fields.terms")} <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={8}
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all font-sans"
                placeholder={t("placeholders.terms")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-gray-400">
                {t("fields.paymentDetails")} <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={8}
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
                className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all font-sans"
                placeholder={t("placeholders.paymentDetails")}
              />
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-8 py-3.5 bg-[#B7D1EA] text-gray-100 hover:bg-[#B7D1EA]/80 font-black text-xs uppercase tracking-widest rounded-xl transition-all duration-300 ease-out hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 cursor-pointer shadow-none"
          >
            {isPending ? (
              <span>{t("actions.saving")}</span>
            ) : (
              <>
                <Save className="w-4 h-4 text-gray-100" />
                <span>{t("actions.saveSettings")}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
