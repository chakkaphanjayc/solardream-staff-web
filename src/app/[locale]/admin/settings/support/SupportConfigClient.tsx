"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  HelpCircle,
  Save,
  MessageSquare,
  Mail,
  Phone,
  Clock,
  MapPin,
  Sparkles,
  ShieldAlert,
  Sliders,
  Check,
  RefreshCw,
} from "@/components/ui/icons";
import { updateSupportConfigAction } from "@/app/actions/support";
import type { SupportConfig } from "@/schemas/support";

interface SupportConfigClientProps {
  initialConfig: SupportConfig;
}

export default function SupportConfigClient({ initialConfig }: SupportConfigClientProps) {
  const [config, setConfig] = useState<SupportConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"channels" | "hero" | "toggles">("channels");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateSupportConfigAction(config);
      if (result.success) {
        toast.success("Support configuration saved and published successfully!");
      } else {
        toast.error(result.error || "Failed to save support config.");
      }
    } catch (err: any) {
      toast.error("Unexpected error saving support config.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-urbanist pb-12">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0F172A] p-6 text-white shadow-md">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 px-3 py-1 text-xs font-bold text-[#B7D1EA]">
            <Sliders className="h-3.5 w-3.5" />
            Support Desk Settings
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-white">
            Support Portal Configuration
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-300 sm:text-sm">
            Manage contact channels, support SLAs, hero announcements, and public feature toggles.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-3 text-sm font-black text-[#0F172A] shadow-md transition-all hover:bg-[#99BFE3] hover:shadow-lg active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "Saving..." : "Save & Publish"}
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {[
          { id: "channels", label: "Contact Channels & SLAs", icon: Phone },
          { id: "hero", label: "Hero & Banner Copy", icon: Sparkles },
          { id: "toggles", label: "Feature Toggles", icon: Sliders },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
                isActive
                  ? "bg-[#0F172A] text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Contact Channels */}
      {activeTab === "channels" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card: Direct Communication */}
          <div className="rounded-md border border-[#30363d] bg-[#161b22] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#238636] text-white shadow-xs">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#f0f6fc]">LINE & Messaging</h3>
                <p className="text-xs text-[#8b949e]">Official LINE OA link and handle</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                LINE Official Account URL
              </label>
              <input
                type="text"
                value={config.contact.lineUrl}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, lineUrl: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                LINE ID Handle
              </label>
              <input
                type="text"
                value={config.contact.lineId}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, lineId: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
              />
            </div>
          </div>

          {/* Card: Email & Phone Support */}
          <div className="rounded-md border border-[#30363d] bg-[#161b22] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#21262d] border border-[#30363d] text-[#58a6ff] shadow-xs">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#f0f6fc]">Email & Phone Hotline</h3>
                <p className="text-xs text-[#8b949e]">Customer care contact endpoints</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Support Email
              </label>
              <input
                type="email"
                value={config.contact.email}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, email: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-[#0F172A] focus:border-[#B7D1EA] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Hotline Phone Number
              </label>
              <input
                type="text"
                value={config.contact.phone}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, phone: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
              />
            </div>
          </div>

          {/* Card: Hours & Physical Atelier */}
          <div className="rounded-md border border-[#30363d] bg-[#161b22] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#21262d] border border-[#30363d] text-[#d29922] shadow-xs">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#f0f6fc]">Operating Hours & Location</h3>
                <p className="text-xs text-[#8b949e]">Business availability details</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                Operating Hours
              </label>
              <input
                type="text"
                value={config.contact.operatingHours}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, operatingHours: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                Physical Service Atelier Address
              </label>
              <textarea
                rows={2}
                value={config.contact.address}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    contact: { ...config.contact, address: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
              />
            </div>
          </div>

          {/* Card: SLA Targets */}
          <div className="rounded-md border border-[#30363d] bg-[#161b22] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] shadow-xs">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#f0f6fc]">Target Response SLAs</h3>
                <p className="text-xs text-[#8b949e]">Service Level Agreement targets (hours)</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                  Urgent Case SLA (hrs)
                </label>
                <input
                  type="number"
                  value={config.contact.urgentSlaTargetHours}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      contact: { ...config.contact, urgentSlaTargetHours: Number(e.target.value) },
                    })
                  }
                  className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                  Normal Inquiries SLA (hrs)
                </label>
                <input
                  type="number"
                  value={config.contact.standardSlaTargetHours}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      contact: { ...config.contact, standardSlaTargetHours: Number(e.target.value) },
                    })
                  }
                  className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Hero & Announcement Banner */}
      {activeTab === "hero" && (
        <div className="rounded-md border border-[#30363d] bg-[#161b22] p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[#f0f6fc]">Public Support Page Hero Header</h3>
            <p className="text-xs text-[#8b949e]">
              Customize headline, badge text, and introductory descriptions shown on `/support`.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                Badge Pill Text
              </label>
              <input
                type="text"
                value={config.hero.badgeText}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero: { ...config.hero, badgeText: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                Main Header Title
              </label>
              <input
                type="text"
                value={config.hero.headerTitle}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hero: { ...config.hero, headerTitle: e.target.value },
                  })
                }
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
              Header Subtitle Description
            </label>
            <textarea
              rows={3}
              value={config.hero.headerDesc}
              onChange={(e) =>
                setConfig({
                  ...config,
                  hero: { ...config.hero, headerDesc: e.target.value },
                })
              }
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
            />
          </div>

          <hr className="border-[#30363d]" />

          {/* Announcement Banner */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-[#f0f6fc]">Emergency Announcement Banner</h4>
                <p className="text-xs text-[#8b949e]">
                  Displays a persistent warning bar at the top of the Support Hub.
                </p>
              </div>

              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={config.hero.isBannerActive}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      hero: { ...config.hero, isBannerActive: e.target.checked },
                    })
                  }
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-[#30363d] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#238636] peer-checked:after:translate-x-full peer-focus:outline-none" />
              </label>
            </div>

            <textarea
              rows={2}
              placeholder="e.g. Hotline notice or rainy season system alert..."
              value={config.hero.announcementBanner || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  hero: { ...config.hero, announcementBanner: e.target.value },
                })
              }
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3.5 py-2 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Tab 3: Feature Toggles */}
      {activeTab === "toggles" && (
        <div className="rounded-md border border-[#30363d] bg-[#161b22] p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-bold text-[#f0f6fc]">Support Desk Module Flags</h3>
            <p className="text-xs text-[#8b949e]">
              Toggle which customer self-service modules are enabled on the public support page.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {[
              {
                key: "enableKbSearch",
                title: "Knowledge Base Search Engine",
                desc: "Allows customers to search FAQs and troubleshoot inverter error codes.",
              },
              {
                key: "enableDirectContactCard",
                title: "Direct LINE & Email Contact Box",
                desc: "Renders direct LINE official account and Email support buttons.",
              },
              {
                key: "enableDocumentVerifyLink",
                title: "Verify Signed Document Link",
                desc: "Displays document hash verification link for authenticating signed SolarDream PDFs.",
              },
              {
                key: "enableMaintenanceBookingLink",
                title: "Book Preventive Maintenance Button",
                desc: "Directs customers to the dedicated `/services` page to schedule PM cleaning or diagnostics.",
              },
            ].map((item) => {
              const key = item.key as keyof SupportConfig["featureToggles"];
              const isChecked = config.featureToggles[key];
              return (
                <div key={item.key} className="flex items-center justify-between py-4">
                  <div>
                    <h4 className="text-sm font-extrabold text-[#0F172A]">{item.title}</h4>
                    <p className="text-xs font-semibold text-slate-500">{item.desc}</p>
                  </div>

                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          featureToggles: {
                            ...config.featureToggles,
                            [key]: e.target.checked,
                          },
                        })
                      }
                      className="peer sr-only"
                    />
                    <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#0F172A] peer-checked:after:translate-x-full peer-focus:outline-none" />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
