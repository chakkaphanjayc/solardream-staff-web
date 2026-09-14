import { getToolSettings } from "@/app/actions/toolSettings";
import ConfiguratorSettingsForm from "./ConfiguratorSettingsForm";
import { Settings2, Sun } from "@/components/ui/icons";
import { GsapReveal } from "@/components/ui/GsapMotion";


export default async function ConfiguratorSettingsPage() {
  const settings = await getToolSettings();

  return (
    <GsapReveal className="space-y-10">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight text-gray-100 flex items-center gap-3 font-sans">
          Tool <span className="text-[#B7D1EA]">Settings</span>
        </h1>
        <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
          Tune wizard algorithms and rooftop planner bounds without touching code.
        </p>
      </div>

      <ConfiguratorSettingsForm initialSettings={settings} />
    </GsapReveal>
  );
}
