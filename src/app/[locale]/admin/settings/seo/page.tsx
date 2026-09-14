import { getGlobalSeo, getAllPageSeo } from "@/app/actions/seo";
import SeoSettingsForm from "./SeoSettingsForm";
import { Globe } from "@/components/ui/icons";


export default async function SeoSettingsPage() {
  const [settings, pageSeos] = await Promise.all([
    getGlobalSeo(),
    getAllPageSeo(),
  ]);

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
            Global SEO <span className="text-[#B7D1EA]">Hub</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
            Manage fallback search metadata, indexing targets, and Open Graph card graphics.
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 bg-[#0F172A] border border-[#1E293B] px-4 py-2.5 rounded-2xl text-[10px] font-mono font-black uppercase text-gray-400 self-start md:self-auto shadow-none">
          <Globe className="w-4 h-4 text-[#B7D1EA]" />
          <span>SEO Metadata Active</span>
        </div>
      </div>

      {/* Settings Form */}
      <SeoSettingsForm initialSettings={settings} initialPageSeos={pageSeos} />
    </div>
  );
}
