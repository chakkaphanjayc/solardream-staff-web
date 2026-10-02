import { connection } from "next/server";
import { getWizardsForExchange } from "@/app/actions/wizard";
import DeleteWizardButton from "@/components/admin/DeleteWizardButton";
import Link from "next/link";
import { BadgePercent, Plus, Settings2, Edit3, Settings } from "@/components/ui/icons";
import WizardsDataTools from "./WizardsDataTools";

export default async function WizardsListPage() {
  await connection();

  const wizards = await getWizardsForExchange();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-100 mb-2 flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-[#B7D1EA]" />
            Wizards Engine
          </h1>
          <p className="text-gray-400 font-medium">
            Manage dynamic survey engines and configurator steps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/wizards/cross-sells"
            className="flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-2.5 text-sm font-bold text-gray-300 transition-all hover:bg-[#0B1121] hover:text-gray-100"
          >
            <BadgePercent className="h-4 w-4" />
            Cross-sell Rules
          </Link>
          <Link
            href="/admin/wizards/new"
            className="bg-[#B7D1EA] hover:bg-[#99BFE3] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-none shadow-[#B7D1EA]/20"
          >
            <Plus className="w-5 h-5" />
            Create Wizard
          </Link>
        </div>
      </div>

      <WizardsDataTools wizards={wizards} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {wizards.map((wizard) => (
          <div key={wizard.id} className="bg-[#0F172A] rounded-2xl border border-[#1E293B] p-6 flex flex-col shadow-none hover:shadow-none transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-gray-100 truncate" title={wizard.title}>
                  {wizard.title}
                </h3>
                <span className="text-xs text-gray-500 font-mono block mt-1 truncate">
                  {wizard.slug}
                </span>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ml-3 shrink-0 ${
                wizard.isActive ? "bg-emerald-500/10 border border-emerald-200" : "bg-[#0B1121] border border-[#1E293B]"
              } ${
                wizard.isActive ? "text-emerald-800" : "text-gray-400"
              }`}>
                {wizard.isActive ? "Active" : "Draft"}
              </div>
            </div>
            
            <p className="text-sm text-gray-400 line-clamp-2 mb-6 flex-1">
              {wizard.description || "No description provided."}
            </p>

            <div className="flex items-center justify-between pt-4 border-t border-[#1E293B] mt-auto">
              <span className="text-xs text-gray-500 font-medium">
                Updated {new Date(wizard.updatedAt).toLocaleDateString()}
              </span>
              <div className="flex gap-2">
                <Link
                  href={`/admin/wizards/${wizard.id}`}
                  className="p-2 text-gray-500 hover:text-[#B7D1EA] hover:bg-[#B7D1EA]/10 rounded-lg transition-colors"
                  title="Edit Wizard"
                >
                  <Edit3 className="w-4 h-4" />
                </Link>
                <DeleteWizardButton wizardId={wizard.id} />
              </div>
            </div>
          </div>
        ))}

        {wizards.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-[#1E293B] rounded-2xl bg-[#0B1121]">
            <Settings className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-gray-300 mb-1">No Wizards Found</h3>
            <p className="text-gray-400 text-sm mb-6 max-w-sm">
              You have not created any dynamic wizards yet. Start by creating your first configurator engine.
            </p>
            <Link
              href="/admin/wizards/new"
              className="bg-[#0F172A] text-gray-300 hover:text-[#B7D1EA] px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 border border-[#1E293B] shadow-none transition-all"
            >
              <Plus className="w-5 h-5" />
              Create First Wizard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
