"use client";

import { useState, useTransition } from "react";
import { Save, Search, Image as ImageIcon, KeyRound, AlertCircle, FileText, Globe } from "@/components/ui/icons";
import { saveGlobalSeo, savePageSeo, GlobalSeoSettings, PageSeoSettings } from "@/app/actions/seo";
import { toast } from "sonner";
import LiveSerpPreview from "@/components/admin/LiveSerpPreview";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";

interface SeoSettingsFormProps {
  initialSettings: GlobalSeoSettings;
  initialPageSeos: PageSeoSettings[];
}

export default function SeoSettingsForm({ initialSettings, initialPageSeos }: SeoSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"global" | "pages">("global");
  
  // Global SEO state
  const [globalSettings, setGlobalSettings] = useState<GlobalSeoSettings>({
    defaultSeoTitle: initialSettings.defaultSeoTitle || "",
    defaultSeoDescription: initialSettings.defaultSeoDescription || "",
    defaultOgImage: initialSettings.defaultOgImage || "",
    defaultKeywords: initialSettings.defaultKeywords || "",
  });

  // Page-specific SEO state
  const [pageSeos, setPageSeos] = useState<PageSeoSettings[]>(initialPageSeos);
  const [selectedPageId, setSelectedPageId] = useState<string>("home");

  const activePageSeo = pageSeos.find(p => p.id === selectedPageId) || pageSeos[0] || {
    id: "home",
    pageName: "Home Page",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    seoImage: "",
  };

  const handleGlobalInputChange = (key: keyof GlobalSeoSettings, value: string) => {
    setGlobalSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handlePageInputChange = (key: keyof Omit<PageSeoSettings, "id" | "pageName">, value: string) => {
    setPageSeos(prev => prev.map(p => {
      if (p.id === selectedPageId) {
        return { ...p, [key]: value };
      }
      return p;
    }));
  };

  const handleGlobalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await saveGlobalSeo(globalSettings);
        if (res.success) {
          toast.success("Global SEO settings saved successfully!");
        } else {
          toast.error(res.error || "Failed to save SEO settings");
        }
      } catch (error) {
        console.error("Failed to save global SEO settings:", error);
        toast.error("Could not save SEO settings. Please try again.");
      }
    });
  };

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await savePageSeo(selectedPageId, {
          seoTitle: activePageSeo.seoTitle,
          seoDescription: activePageSeo.seoDescription,
          seoKeywords: activePageSeo.seoKeywords,
          seoImage: activePageSeo.seoImage,
        });
        if (res.success) {
          toast.success(`SEO configurations for ${activePageSeo.pageName} saved successfully!`);
        } else {
          toast.error(res.error || "Failed to save page SEO configurations");
        }
      } catch (error) {
        console.error("Failed to save page SEO settings:", error);
        toast.error("Could not save page SEO settings. Please try again.");
      }
    });
  };

  // Helper to get simulated URL for mock preview
  const getPagePreviewUrl = (id: string) => {
    const baseUrl = "https://solardream.com";
    if (id === "home") return baseUrl;
    return `${baseUrl}/${id}`;
  };

  return (
    <div className="space-y-6">
      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-800 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("global")}
          className={`pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "global"
              ? "border-[#B7D1EA] text-[#B7D1EA]"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <Globe className="w-4 h-4" />
          Global Fallbacks
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pages")}
          className={`pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "pages"
              ? "border-[#B7D1EA] text-[#B7D1EA]"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          Page-Specific SEO
        </button>
      </div>

      {activeTab === "global" ? (
        /* ------------------------------------------------------------- */
        /* GLOBAL FALLBACKS TAB                                          */
        /* ------------------------------------------------------------- */
        <form onSubmit={handleGlobalSubmit} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Form Fields */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-6 md:p-8 shadow-none space-y-6">
                
                {/* Section Header */}
                <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                  <div className="w-10 h-10 rounded-xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-gray-100 uppercase tracking-wider font-sans">Global Default Metadata</h2>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Define global tags used when public pages don&apos;t specify custom SEO overrides.</p>
                  </div>
                </div>

                {/* Title Input */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex justify-between font-sans">
                    <span>Default SEO Title</span>
                    <span className={globalSettings.defaultSeoTitle.length > 60 ? "text-rose-500 font-bold" : "text-gray-500"}>
                      {globalSettings.defaultSeoTitle.length} / 60
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={globalSettings.defaultSeoTitle}
                    onChange={e => handleGlobalInputChange("defaultSeoTitle", e.target.value)}
                    placeholder="e.g. SolarDream | Premium Solar System Calculator"
                    className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-semibold"
                  />
                </div>

                {/* Description Input */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex justify-between font-sans">
                    <span>Default Meta Description</span>
                    <span className={globalSettings.defaultSeoDescription.length > 155 ? "text-rose-500 font-bold" : "text-gray-500"}>
                      {globalSettings.defaultSeoDescription.length} / 155
                    </span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={globalSettings.defaultSeoDescription}
                    onChange={e => handleGlobalInputChange("defaultSeoDescription", e.target.value)}
                    placeholder="Describe your site clearly under 155 characters..."
                    className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-semibold resize-none"
                  />
                </div>

                {/* Keywords Input */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1 font-sans">
                    <KeyRound className="w-3.5 h-3.5 text-gray-500" />
                    <span>Global Keywords (Comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={globalSettings.defaultKeywords}
                    onChange={e => handleGlobalInputChange("defaultKeywords", e.target.value)}
                    placeholder="e.g. solar cell, solar calculator, clean energy, SolarDream"
                    className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-semibold"
                  />
                </div>

                {/* Open Graph Image URL */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1 font-sans">
                    <ImageIcon className="w-3.5 h-3.5 text-gray-500" />
                    <span>Default Open Graph Image URL</span>
                  </label>
                  <input
                    type="text"
                    value={globalSettings.defaultOgImage}
                    onChange={e => handleGlobalInputChange("defaultOgImage", e.target.value)}
                    placeholder="e.g. https://domain.com/og-image.jpg"
                    className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                  />
                </div>

              </div>
            </div>

            {/* Right Column: Visual Real-time Previews */}
            <div className="space-y-6">
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-6 shadow-none space-y-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-100 pb-3 border-b border-slate-800 font-sans">
                  Live SERP Mockup
                </h3>
                
                <LiveSerpPreview
                  title={globalSettings.defaultSeoTitle}
                  description={globalSettings.defaultSeoDescription}
                  url="https://solardream.com"
                />
                
                <div className="flex gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold leading-relaxed text-rose-400">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                  <p className="font-sans">
                    Global fallbacks are dynamically served across pages that do not configure custom overrides. Keep titles and descriptions concise to prevent truncated search results!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Save Trigger Sticky Block */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-none relative overflow-hidden">
            <div className="flex items-center gap-2.5 text-xs text-gray-400 font-black ml-2 uppercase tracking-widest font-sans">
              <GsapPulse className="h-2.5 w-2.5 rounded-full bg-[#B7D1EA]" scale={1.55}>
                <span />
              </GsapPulse>
              Global SEO Config Sync
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-6 py-3.5 text-xs font-black uppercase tracking-widest text-[#0F172A] transition-colors hover:bg-[#99BFE3] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? (
                <>
                  <GsapSpinner className="h-4 w-4" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4.5 h-4.5" />
                  Save Global Fallbacks
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        /* ------------------------------------------------------------- */
        /* PAGE-SPECIFIC SEO TAB                                         */
        /* ------------------------------------------------------------- */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Sub-sidebar: Pages Selector list */}
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 px-2 mb-3">Select Public Page</h4>
            <div className="space-y-1">
              {pageSeos.map(page => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setSelectedPageId(page.id)}
                  className={`w-full text-left rounded-xl p-3.5 text-xs font-bold transition-all border flex flex-col gap-0.5 ${
                    selectedPageId === page.id
                      ? "bg-[#B7D1EA]/10 border-[#B7D1EA] text-[#B7D1EA]"
                      : "bg-[#0F172A] border-slate-800 text-gray-300 hover:bg-[#0B1121]/60 hover:text-white"
                  }`}
                >
                  <span>{page.pageName}</span>
                  <span className={`text-[10px] font-mono font-medium ${selectedPageId === page.id ? "text-[#B7D1EA]/80" : "text-gray-500"}`}>
                    {page.id === "home" ? "/" : `/${page.id}`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Form and Preview Columns */}
          <div className="lg:col-span-3 space-y-6">
            <form onSubmit={handlePageSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* Form Inputs (Col span 2) */}
                <div className="md:col-span-2 bg-[#0F172A] border border-slate-800 rounded-xl p-6 md:p-8 space-y-6">
                  
                  {/* Section Header */}
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
                    <div className="w-10 h-10 rounded-xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-gray-100 uppercase tracking-wider font-sans">{activePageSeo.pageName} overrides</h2>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Customize metadata settings that override site fallbacks on this specific route.</p>
                    </div>
                  </div>

                  {/* Title Overrides */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex justify-between font-sans">
                      <span>Meta Title Override</span>
                      <span className={activePageSeo.seoTitle.length > 60 ? "text-rose-500 font-bold" : "text-gray-500"}>
                        {activePageSeo.seoTitle.length} / 60
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={activePageSeo.seoTitle}
                      onChange={e => handlePageInputChange("seoTitle", e.target.value)}
                      placeholder="e.g. SolarDream Catalog | Buy Smart Microinverters"
                      className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-semibold"
                    />
                  </div>

                  {/* Description Overrides */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex justify-between font-sans">
                      <span>Meta Description Override</span>
                      <span className={activePageSeo.seoDescription.length > 155 ? "text-rose-500 font-bold" : "text-gray-500"}>
                        {activePageSeo.seoDescription.length} / 155
                      </span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={activePageSeo.seoDescription}
                      onChange={e => handlePageInputChange("seoDescription", e.target.value)}
                      placeholder="Enter route-specific meta description details..."
                      className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-semibold resize-none"
                    />
                  </div>

                  {/* Keywords Overrides */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1 font-sans">
                      <KeyRound className="w-3.5 h-3.5 text-gray-500" />
                      <span>Keywords Override (Comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={activePageSeo.seoKeywords}
                      onChange={e => handlePageInputChange("seoKeywords", e.target.value)}
                      placeholder="e.g. category panels, microinverters list, smart catalog"
                      className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-semibold"
                    />
                  </div>

                  {/* OG Image URL Override */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1 font-sans">
                      <ImageIcon className="w-3.5 h-3.5 text-gray-500" />
                      <span>Open Graph Image Override URL</span>
                    </label>
                    <input
                      type="text"
                      value={activePageSeo.seoImage}
                      onChange={e => handlePageInputChange("seoImage", e.target.value)}
                      placeholder="e.g. https://domain.com/catalog-og.jpg"
                      className="w-full bg-[#0B1121] border border-slate-800 rounded-xl py-3.5 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                    />
                  </div>

                </div>

                {/* Live Preview (Col span 1) */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-6 space-y-6 self-start">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-100 pb-3 border-b border-slate-800 font-sans">
                    Page SERP Preview
                  </h3>
                  
                  <LiveSerpPreview
                    title={activePageSeo.seoTitle || activePageSeo.pageName}
                    description={activePageSeo.seoDescription || "Configure descriptions to preview live SERP ranking aesthetics..."}
                    url={getPagePreviewUrl(activePageSeo.id)}
                  />

                  <div className="p-4 rounded-xl bg-brand-surface/10 border border-slate-800/50 text-[10px] text-gray-400 font-semibold leading-relaxed">
                    <p className="font-mono">
                      ROUTE: {activePageSeo.id === "home" ? "root (landing page)" : activePageSeo.id}
                    </p>
                  </div>
                </div>

              </div>

              {/* Save Trigger Sticky Block */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-none relative overflow-hidden">
                <div className="flex items-center gap-2.5 text-xs text-gray-400 font-black ml-2 uppercase tracking-widest font-sans">
                  <GsapPulse className="h-2.5 w-2.5 rounded-full bg-[#B7D1EA]" scale={1.55}>
                    <span />
                  </GsapPulse>
                  {activePageSeo.pageName} Configuration Sync
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-6 py-3.5 text-xs font-black uppercase tracking-widest text-[#0F172A] transition-colors hover:bg-[#99BFE3] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isPending ? (
                    <>
                      <GsapSpinner className="h-4 w-4" />
                      Saving overrides...
                    </>
                  ) : (
                    <>
                      <Save className="w-4.5 h-4.5" />
                      Save Overrides
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
