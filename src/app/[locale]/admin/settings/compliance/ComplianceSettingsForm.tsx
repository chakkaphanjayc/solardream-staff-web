"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Save,
  ShieldCheck,
  Cookie,
  FileText,
  Building2,
  Phone,
  Mail,
  MapPin,
  Share2,
  Navigation,
  Plus,
  Trash2,
  Layout,
  Globe,
  PlusCircle,
  HelpCircle,
} from "@/components/ui/icons";
import { saveComplianceTranslation, updateComplianceSettings, type ComplianceCopy } from "@/app/actions/settings/compliance";
import { saveWebsiteSettingsJson } from "@/app/actions/websiteSettings";
import RichTextEditor from "@/components/forum/RichTextEditor";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";
import NavigationSettingsForm from "../navigation/NavigationSettingsForm";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import { ContentLocaleTabs } from "@/components/admin/ContentLocaleTabs";
import type { Locale } from "@/i18n/locales";
import type { NavigationTemplates, NavigationTranslations } from "@/app/actions/navigation";

type NavigationItem = {
  id: string;
  label: string;
  url: string;
  parentId: string | null;
  order: number;
};

type ComplianceSettingsFormProps = {
  initialComplianceSettings: {
    cookieBannerText: string;
    cookieBannerEnabled: boolean;
    termsAndConditions: string;
    privacyPolicy: string;
  };
  initialComplianceTranslations: Partial<Record<Locale, ComplianceCopy>>;
  initialWebsiteSettings: WebsiteSettings;
  initialNavigationItems: NavigationItem[];
  initialNavigationTranslations: NavigationTranslations;
  initialNavigationTemplates: NavigationTemplates;
  defaultTab?: string;
};

export default function ComplianceSettingsForm({
  initialComplianceSettings,
  initialComplianceTranslations,
  initialWebsiteSettings,
  initialNavigationItems,
  initialNavigationTranslations,
  initialNavigationTemplates,
  defaultTab = "compliance",
}: ComplianceSettingsFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"compliance" | "footer" | "navigation">(
    (defaultTab as "compliance" | "footer" | "navigation") || "compliance"
  );
  const [contentLocale, setContentLocale] = useState<Locale>("th");

  // Compliance State
  const [cookieBannerText, setCookieBannerText] = useState(
    initialComplianceSettings.cookieBannerText
  );
  const [cookieBannerEnabled, setCookieBannerEnabled] = useState(
    initialComplianceSettings.cookieBannerEnabled
  );
  const [termsAndConditions, setTermsAndConditions] = useState(
    initialComplianceSettings.termsAndConditions
  );
  const [privacyPolicy, setPrivacyPolicy] = useState(
    initialComplianceSettings.privacyPolicy
  );
  const [notifyUsers, setNotifyUsers] = useState(false);
  const [complianceDrafts, setComplianceDrafts] = useState<Partial<Record<Locale, ComplianceCopy>>>(initialComplianceTranslations);

  // Footer & Company Website Settings State
  const [company, setCompany] = useState(initialWebsiteSettings.company);
  const [socialLinks, setSocialLinks] = useState(initialWebsiteSettings.socialLinks);
  const [footerNav, setFooterNav] = useState(initialWebsiteSettings.footerNavigation);
  const [footerDrafts, setFooterDrafts] = useState(initialWebsiteSettings.localizedContent);

  const [isSavingCompliance, startSavingCompliance] = useTransition();
  const [isSavingFooter, startSavingFooter] = useTransition();

  const currentComplianceCopy = (): ComplianceCopy => ({ cookieBannerText, termsAndConditions, privacyPolicy });
  const currentFooterCopy = () => ({ company, socialLinks, footerNavigation: footerNav });
  const baseFooterCopy = {
    company: initialWebsiteSettings.company,
    socialLinks: initialWebsiteSettings.socialLinks,
    footerNavigation: initialWebsiteSettings.footerNavigation,
  };
  const baseComplianceCopy: ComplianceCopy = {
    cookieBannerText: initialComplianceSettings.cookieBannerText,
    termsAndConditions: initialComplianceSettings.termsAndConditions,
    privacyPolicy: initialComplianceSettings.privacyPolicy,
  };
  const hasLocaleChanges = activeTab === "footer"
    ? JSON.stringify(currentFooterCopy()) !== JSON.stringify(footerDrafts[contentLocale] ?? baseFooterCopy)
    : JSON.stringify(currentComplianceCopy()) !== JSON.stringify(complianceDrafts[contentLocale] ?? baseComplianceCopy);

  const changeContentLocale = (nextLocale: Locale) => {
    setComplianceDrafts((current) => ({ ...current, [contentLocale]: currentComplianceCopy() }));
    const next = complianceDrafts[nextLocale] ?? baseComplianceCopy;
    setContentLocale(nextLocale);
    setCookieBannerText(next.cookieBannerText);
    setTermsAndConditions(next.termsAndConditions);
    setPrivacyPolicy(next.privacyPolicy);
    setFooterDrafts((current) => ({ ...current, [contentLocale]: currentFooterCopy() }));
    const nextFooter = footerDrafts[nextLocale] ?? baseFooterCopy;
    setCompany(nextFooter.company);
    setSocialLinks(nextFooter.socialLinks);
    setFooterNav(nextFooter.footerNavigation);
  };

  const applyLocaleCopy = () => {
    if (activeTab === "footer") {
      persistFooterLocale(true);
      return;
    }
    const copy = currentComplianceCopy();
    startSavingCompliance(async () => {
      try {
        if (contentLocale === "th") {
          const result = await updateComplianceSettings({ ...copy, cookieBannerEnabled, notifyUsers });
          if (!result.success) {
            toast.error("Failed to apply Thai compliance content.");
            return;
          }
        } else {
          const result = await saveComplianceTranslation(contentLocale, copy);
          if (!result.success) {
            toast.error(result.error || "Failed to apply localized compliance content.");
            return;
          }
        }
        setComplianceDrafts((current) => ({ ...current, [contentLocale]: copy }));
        toast.success(`${contentLocale.toUpperCase()} compliance copy applied.`);
        router.refresh();
      } catch (error) {
        console.error("Localized compliance save error:", error);
        toast.error("Failed to apply localized compliance content. Please try again.");
      }
    });
  };

  const persistFooterLocale = (isApplyAction: boolean) => {
    const footerCopy = currentFooterCopy();
    startSavingFooter(async () => {
      try {
        const localizedContent = { ...footerDrafts, [contentLocale]: footerCopy };
        const settings: WebsiteSettings = contentLocale === "th"
          ? { ...initialWebsiteSettings, ...footerCopy, localizedContent }
          : { ...initialWebsiteSettings, localizedContent };
        const result = await saveWebsiteSettingsJson(JSON.stringify(settings, null, 2));
        if (!result.success) {
          toast.error(result.error || "Failed to save localized footer content.");
          return;
        }
        setFooterDrafts(localizedContent);
        toast.success(isApplyAction
          ? `${contentLocale.toUpperCase()} footer copy applied.`
          : `${contentLocale.toUpperCase()} footer configuration saved.`);
        router.refresh();
      } catch (error) {
        console.error("Localized footer save error:", error);
        toast.error("Failed to save localized footer content. Please try again.");
      }
    });
  };

  // Save Compliance Settings Handler
  const handleSaveCompliance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startSavingCompliance(async () => {
      try {
        const result = await updateComplianceSettings({
          cookieBannerText: cookieBannerText.trim(),
          cookieBannerEnabled,
          termsAndConditions,
          privacyPolicy,
          notifyUsers,
        });

        if (result.success) {
          toast.success("Compliance & Legal policy settings updated successfully.");
          router.refresh();
        } else {
          toast.error("Failed to update compliance settings.");
        }
      } catch (error: unknown) {
        console.error("Compliance settings save error:", error);
        toast.error("Failed to update compliance settings. Please try again.");
      }
    });
  };

  // Save Footer & Company Info Handler
  const handleSaveFooter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    persistFooterLocale(false);
  };

  // Social Links Helpers
  const addSocialLink = () => {
    setSocialLinks((prev) => [
      ...prev,
      { platform: "custom", label: "Social link", url: "https://", imageUrl: "", isActive: true },
    ]);
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSocialLink = (
    index: number,
    field: "platform" | "label" | "url" | "imageUrl" | "isActive",
    value: string | boolean
  ) => {
    setSocialLinks((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Footer Navigation Helpers
  const addFooterGroup = () => {
    setFooterNav((prev) => [
      ...prev,
      { title: "New Group", links: [{ label: "Link Item", href: "/" }] },
    ]);
  };

  const removeFooterGroup = (groupIndex: number) => {
    setFooterNav((prev) => prev.filter((_, i) => i !== groupIndex));
  };

  const updateFooterGroupTitle = (groupIndex: number, title: string) => {
    setFooterNav((prev) =>
      prev.map((group, i) => (i === groupIndex ? { ...group, title } : group))
    );
  };

  const addFooterGroupLink = (groupIndex: number) => {
    setFooterNav((prev) =>
      prev.map((group, i) =>
        i === groupIndex
          ? { ...group, links: [...group.links, { label: "New Link", href: "/" }] }
          : group
      )
    );
  };

  const removeFooterGroupLink = (groupIndex: number, linkIndex: number) => {
    setFooterNav((prev) =>
      prev.map((group, i) =>
        i === groupIndex
          ? { ...group, links: group.links.filter((_, li) => li !== linkIndex) }
          : group
      )
    );
  };

  const updateFooterGroupLink = (
    groupIndex: number,
    linkIndex: number,
    field: "label" | "href",
    value: string
  ) => {
    setFooterNav((prev) =>
      prev.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              links: group.links.map((link, li) =>
                li === linkIndex ? { ...link, [field]: value } : link
              ),
            }
          : group
      )
    );
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Navigation Tab Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveTab("compliance")}
          className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === "compliance"
              ? "bg-[#B7D1EA] text-[#0F172A] shadow-md"
              : "bg-[#0F172A] text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>1. Legal & Cookie Compliance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("footer")}
          className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === "footer"
              ? "bg-[#B7D1EA] text-[#0F172A] shadow-md"
              : "bg-[#0F172A] text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>2. Footer & Company Info</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("navigation")}
          className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === "navigation"
              ? "bg-[#B7D1EA] text-[#0F172A] shadow-md"
              : "bg-[#0F172A] text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Navigation className="w-4 h-4" />
          <span>3. Header Navigation Builder</span>
        </button>
        </div>
        {activeTab !== "navigation" && <div className="flex items-center gap-2">
          <ContentLocaleTabs locale={contentLocale} onChange={changeContentLocale} />
          <button type="button" onClick={applyLocaleCopy} disabled={(isSavingCompliance || isSavingFooter) || !hasLocaleChanges} className="inline-flex min-h-10 items-center rounded-full bg-[#B7D1EA] px-4 text-xs font-black text-slate-950 transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-50">Apply</button>
        </div>}
      </div>

      {/* TAB 1: LEGAL & COOKIE COMPLIANCE */}
      {activeTab === "compliance" && (
        <form onSubmit={handleSaveCompliance} className="space-y-10">
          {/* Cookie Banner Settings */}
          <section className="space-y-6 rounded-[2rem] border border-slate-800 bg-[#0F172A] p-6 shadow-none">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                  <Cookie className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                    User Consent & Telemetry
                  </p>
                  <h2 className="text-lg font-black text-[#F8FAFC] uppercase tracking-wider font-sans">
                    Cookie Consent Banner Configuration
                  </h2>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Compliance Engine Active</span>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="rounded-[1.5rem] border border-slate-800 bg-[#0B1121] p-5 flex items-center justify-between hover:bg-slate-800/30 transition-all">
                <div>
                  <h4 className="text-xs font-black text-[#F8FAFC] font-sans uppercase tracking-wider">
                    Enable Cookie Consent Banner
                  </h4>
                  <p className="text-[10px] text-[#94A3B8] font-semibold mt-0.5">
                    Toggle whether the public website forces user consent selection.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCookieBannerEnabled(!cookieBannerEnabled)}
                  className={`w-12 h-6 rounded-full p-0.5 transition-all duration-300 relative cursor-pointer ${
                    cookieBannerEnabled ? "bg-[#B7D1EA]" : "bg-slate-800"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-[#0F172A] shadow transform transition-all duration-300 ${
                      cookieBannerEnabled ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="rounded-[1.5rem] border border-slate-800 bg-[#0B1121] p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                    Consent Banner Text
                  </p>
                  <h3 className="mt-1.5 text-xs font-black text-[#F8FAFC] uppercase tracking-wider">
                    cookie_banner_text
                  </h3>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-[#94A3B8]">
                    Enter user notification description to display on public site
                  </span>
                  <textarea
                    value={cookieBannerText}
                    onChange={(e) => setCookieBannerText(e.target.value)}
                    rows={3}
                    className={`w-full rounded-2xl border bg-[#0B1121] px-4 py-3 text-sm font-semibold text-[#F8FAFC] outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA] resize-none ${hasLocaleChanges ? "border-amber-400/80 ring-1 ring-amber-400/20" : "border-slate-800"}`}
                    placeholder="เราใช้คุกกี้เพื่อพัฒนาประสิทธิภาพ..."
                    required
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Policies Rich Text Section */}
          <section className="grid gap-6 lg:grid-cols-2">
            {/* Terms & Conditions */}
            <div className="rounded-[2rem] border border-slate-800 bg-[#0F172A] p-6 shadow-none space-y-4 flex flex-col">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                    Legal Disclaimers
                  </p>
                  <h2 className="text-base font-black text-[#F8FAFC] uppercase tracking-wider font-sans">
                    Terms and Conditions
                  </h2>
                </div>
              </div>
              <p className="text-[10px] text-[#94A3B8] font-semibold leading-relaxed">
                Specify the legal terms governing system configurator usage, signed quotation
                validation, and solar installation deposits.
              </p>
              <div className="flex-grow pt-2">
                <RichTextEditor
                  content={termsAndConditions}
                  onChange={(html) => setTermsAndConditions(html)}
                />
              </div>
            </div>

            {/* Privacy Policy */}
            <div className="rounded-[2rem] border border-slate-800 bg-[#0F172A] p-6 shadow-none space-y-4 flex flex-col">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                    User Data Protections
                  </p>
                  <h2 className="text-base font-black text-[#F8FAFC] uppercase tracking-wider font-sans">
                    Privacy Policy
                  </h2>
                </div>
              </div>
              <p className="text-[10px] text-[#94A3B8] font-semibold leading-relaxed">
                Define PDPA-compliant rules clarifying how customer location pins, phone numbers,
                and utility bills are handled and encrypted.
              </p>
              <div className="flex-grow pt-2">
                <RichTextEditor
                  content={privacyPolicy}
                  onChange={(html) => setPrivacyPolicy(html)}
                />
              </div>
            </div>
          </section>

          {/* Action Footer */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-none relative overflow-hidden font-sans">
            <label className="flex items-center gap-2.5 text-xs text-[#94A3B8] font-black ml-2 uppercase tracking-widest cursor-pointer">
              <input type="checkbox" checked={notifyUsers} onChange={(event) => setNotifyUsers(event.target.checked)} className="size-4 accent-[#B7D1EA]" />
              <GsapPulse className="h-2.5 w-2.5 rounded-full bg-[#B7D1EA]" scale={1.55}>
                <span />
              </GsapPulse>
              Email all users about this important update
            </label>

            <button
              type="submit"
              disabled={isSavingCompliance}
              className="px-6 py-3.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] font-black rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-none cursor-pointer disabled:opacity-40 uppercase tracking-widest font-sans"
            >
              {isSavingCompliance ? (
                <>
                  <GsapSpinner className="h-4 w-4 text-[#0F172A]" />
                  Saving settings...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Legal Compliance Settings
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: FOOTER & COMPANY INFORMATION */}
      {activeTab === "footer" && (
        <form onSubmit={handleSaveFooter} className="space-y-10">
          {/* Company Profile Details */}
          <section className="space-y-6 rounded-[2rem] border border-slate-800 bg-[#0F172A] p-6 shadow-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                  Footer & Organization
                </p>
                <h2 className="text-lg font-black text-[#F8FAFC] uppercase tracking-wider font-sans">
                  Company Identity & Contact Info
                </h2>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-300">Company Name</span>
                <input
                  type="text"
                  value={company.companyName}
                  onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                  className="w-full rounded-2xl border border-slate-800 bg-[#0B1121] px-4 py-3 text-xs text-white outline-none focus:border-[#B7D1EA]"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-300">Tax ID</span>
                <input
                  type="text"
                  value={company.taxId}
                  onChange={(e) => setCompany({ ...company, taxId: e.target.value })}
                  className="w-full rounded-2xl border border-slate-800 bg-[#0B1121] px-4 py-3 text-xs text-white outline-none focus:border-[#B7D1EA]"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-300">Phone Number</span>
                <input
                  type="text"
                  value={company.phone}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  className="w-full rounded-2xl border border-slate-800 bg-[#0B1121] px-4 py-3 text-xs text-white outline-none focus:border-[#B7D1EA]"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold text-slate-300">Email Address</span>
                <input
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  className="w-full rounded-2xl border border-slate-800 bg-[#0B1121] px-4 py-3 text-xs text-white outline-none focus:border-[#B7D1EA]"
                />
              </label>

              <label className="block space-y-2 md:col-span-2">
                <span className="text-xs font-bold text-slate-300">Physical Address</span>
                <textarea
                  value={company.address}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  rows={2}
                  className="w-full rounded-2xl border border-slate-800 bg-[#0B1121] px-4 py-3 text-xs text-white outline-none focus:border-[#B7D1EA] resize-none"
                />
              </label>

              <label className="block space-y-2 md:col-span-2">
                <span className="text-xs font-bold text-slate-300">Company Description / Tagline</span>
                <textarea
                  value={company.companyDescription}
                  onChange={(e) => setCompany({ ...company, companyDescription: e.target.value })}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-800 bg-[#0B1121] px-4 py-3 text-xs text-white outline-none focus:border-[#B7D1EA] resize-none"
                />
              </label>
            </div>
          </section>

          {/* Social Links Section */}
          <section className="space-y-6 rounded-[2rem] border border-slate-800 bg-[#0F172A] p-6 shadow-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                    Social Media Channels
                  </p>
                  <h2 className="text-lg font-black text-[#F8FAFC] uppercase tracking-wider font-sans">
                    Footer Social Links
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={addSocialLink}
                className="flex items-center gap-2 px-4 py-2 bg-[#B7D1EA]/10 border border-[#B7D1EA]/30 text-[#B7D1EA] hover:bg-[#B7D1EA]/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Social Link</span>
              </button>
            </div>

            <div className="space-y-3">
              {socialLinks.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-[#0B1121] border border-slate-800 rounded-2xl items-center"
                >
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      placeholder="Label (e.g. Follow us)"
                      value={item.label}
                      onChange={(e) => updateSocialLink(idx, "label", e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      placeholder="Destination URL"
                      value={item.url}
                      onChange={(e) => updateSocialLink(idx, "url", e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <input
                      type="url"
                      placeholder="Image URL (optional)"
                      value={item.imageUrl ?? ""}
                      onChange={(e) => updateSocialLink(idx, "imageUrl", e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => updateSocialLink(idx, "isActive", !item.isActive)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase font-mono ${
                        item.isActive
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {item.isActive ? "Active" : "Off"}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeSocialLink(idx)}
                      className="p-2 text-rose-400 hover:bg-rose-950/40 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Footer Navigation Columns Section */}
          <section className="space-y-6 rounded-[2rem] border border-slate-800 bg-[#0F172A] p-6 shadow-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                  <Layout className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                    Footer Structure
                  </p>
                  <h2 className="text-lg font-black text-[#F8FAFC] uppercase tracking-wider font-sans">
                    Footer Column Link Groups
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={addFooterGroup}
                className="flex items-center gap-2 px-4 py-2 bg-[#B7D1EA]/10 border border-[#B7D1EA]/30 text-[#B7D1EA] hover:bg-[#B7D1EA]/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Column Group</span>
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {footerNav.map((group, gi) => (
                <div
                  key={gi}
                  className="p-5 bg-[#0B1121] border border-slate-800 rounded-2xl space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={group.title}
                      onChange={(e) => updateFooterGroupTitle(gi, e.target.value)}
                      className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white w-full"
                      placeholder="Column Title (e.g. Products)"
                    />
                    <button
                      type="button"
                      onClick={() => removeFooterGroup(gi)}
                      className="p-2 text-rose-400 hover:bg-rose-950/40 rounded-xl shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {group.links.map((link, li) => (
                      <div key={li} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Link Label"
                          value={link.label}
                          onChange={(e) =>
                            updateFooterGroupLink(gi, li, "label", e.target.value)
                          }
                          className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white w-1/2"
                        />
                        <input
                          type="text"
                          placeholder="URL (e.g. /build)"
                          value={link.href}
                          onChange={(e) =>
                            updateFooterGroupLink(gi, li, "href", e.target.value)
                          }
                          className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white w-1/2"
                        />
                        <button
                          type="button"
                          onClick={() => removeFooterGroupLink(gi, li)}
                          className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addFooterGroupLink(gi)}
                    className="w-full py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-all font-semibold flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Link Item</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Action Footer */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-none relative overflow-hidden font-sans">
            <div className="flex items-center gap-2.5 text-xs text-[#94A3B8] font-black ml-2 uppercase tracking-widest">
              <GsapPulse className="h-2.5 w-2.5 rounded-full bg-[#B7D1EA]" scale={1.55}>
                <span />
              </GsapPulse>
              Pending Footer & Company Details Updates
            </div>

            <button
              type="submit"
              disabled={isSavingFooter}
              className="px-6 py-3.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] font-black rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-none cursor-pointer disabled:opacity-40 uppercase tracking-widest font-sans"
            >
              {isSavingFooter ? (
                <>
                  <GsapSpinner className="h-4 w-4 text-[#0F172A]" />
                  Saving footer details...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Footer Configuration
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: HEADER NAVIGATION BUILDER */}
      {activeTab === "navigation" && (
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-slate-800 bg-[#0F172A] p-6 shadow-none space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#94A3B8]">
                  Header Menu Architecture
                </p>
                <h2 className="text-lg font-black text-[#F8FAFC] uppercase tracking-wider font-sans">
                  Header Navigation Hierarchy Builder
                </h2>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              Dynamically configure the global top navigation menu, categories, submenus, order,
              and link URLs.
            </p>
          </div>

          <NavigationSettingsForm initialItems={initialNavigationItems} contentLocale={contentLocale} onLocaleChange={changeContentLocale} initialTranslations={initialNavigationTranslations} initialTemplates={initialNavigationTemplates} />
        </section>
      )}
    </div>
  );
}
