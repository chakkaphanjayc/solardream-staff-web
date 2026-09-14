import { ShieldCheck } from "@/components/ui/icons";
import { getComplianceSettings, getComplianceTranslations } from "@/app/actions/settings/compliance";
import { getWebsiteSettings } from "@/lib/websiteSettings";
import { getAllNavigationItemsRaw, getNavigationTemplates, getNavigationTranslations } from "@/app/actions/navigation";
import ComplianceSettingsForm from "./ComplianceSettingsForm";
import { GsapPulse } from "@/components/ui/GsapMotion";


interface PageProps {
  searchParams?: Promise<{ tab?: string }>;
}

export default async function ComplianceSettingsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const activeTab = params.tab || "compliance";

  const [complianceSettings, complianceTranslations, websiteSettings, navigationItems, navigationTranslations, navigationTemplates] = await Promise.all([
    getComplianceSettings(),
    getComplianceTranslations(),
    getWebsiteSettings(),
    getAllNavigationItemsRaw(),
    getNavigationTranslations(),
    getNavigationTemplates(),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
            Site Compliance, <span className="text-[#B7D1EA]">Footer & Navigation</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest font-sans">
            Manage legal agreements, cookie consents, company footer details, and header navigation.
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-[#0F172A] border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-gray-400 self-start md:self-auto shadow-none">
          <GsapPulse scale={1.08}>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </GsapPulse>
          <span>Unified Site Config Active</span>
        </div>
      </div>

      <ComplianceSettingsForm
        initialComplianceSettings={complianceSettings}
        initialComplianceTranslations={complianceTranslations}
        initialWebsiteSettings={websiteSettings}
        initialNavigationItems={navigationItems}
        initialNavigationTranslations={navigationTranslations}
        initialNavigationTemplates={navigationTemplates}
        defaultTab={activeTab}
      />
    </div>
  );
}
