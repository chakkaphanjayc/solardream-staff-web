"use client";

import { useState, useTransition } from "react";
import { saveToolSettings } from "@/app/actions/toolSettings";
import { ToolSettings, DEFAULT_TOOL_SETTINGS } from "@/lib/toolSettings";
import { toast } from "sonner";
import { Save, RotateCcw, Sun, Sliders, Zap, Settings2 } from "@/components/ui/icons";
import { GsapSpinner } from "@/components/ui/GsapMotion";

interface Props {
  initialSettings: ToolSettings;
}

function NumericInput({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          {label}
        </label>
        {unit && (
          <span className="text-[9px] font-black uppercase tracking-widest text-[#B7D1EA]">
            {unit}
          </span>
        )}
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 0.01}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl px-4 py-2.5 text-xs font-black text-gray-100 font-mono focus:outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/10 transition-all"
      />
      {hint && (
        <p className="text-[9px] text-gray-500 font-semibold leading-relaxed pl-0.5">{hint}</p>
      )}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 space-y-5 shadow-none">
      <div className="flex items-center gap-3 pb-4 border-b border-[#1E293B]">
        <div className="w-9 h-9 rounded-xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-[#B7D1EA]" />
        </div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-100">{title}</h2>
          <p className="text-[9px] text-gray-500 font-semibold mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {children}
      </div>
    </div>
  );
}

export default function ConfiguratorSettingsForm({ initialSettings }: Props) {
  const [settings, setSettings] = useState<ToolSettings>(initialSettings);
  const [isPending, startTransition] = useTransition();

  const set = (key: keyof ToolSettings) => (v: number) =>
    setSettings((prev) => ({ ...prev, [key]: v }));

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await saveToolSettings(settings);
        if (result.success) {
          toast.success("Tool settings saved successfully");
        } else {
          toast.error(result.error || "Failed to save settings");
        }
      } catch (error) {
        console.error("Failed to save tool settings:", error);
        toast.error("Could not save settings. Please try again.");
      }
    });
  };

  const handleReset = () => {
    // Re-import defaults inline to avoid circular
    setSettings(initialSettings);
    toast.info("Reset to last saved values");
  };

  return (
    <div className="space-y-6">
      {/* ─── Solar Engineering Wizard ────────────────────────── */}
      <SectionCard
        icon={Sun}
        title="Solar Engineering Wizard"
        subtitle="Controls the capacity and pricing algorithm used in the /wizard step recommendations"
      >
        <NumericInput
          label="Base Capacity Ratio"
          hint="kWp per THB 1 of monthly bill. Higher = larger system for same bill."
          value={settings.wizardBaseCapacityRatio}
          step={0.00001}
          unit="kWp / THB"
          onChange={set("wizardBaseCapacityRatio")}
        />
        <NumericInput
          label="Value Tier Multiplier"
          hint="Price factor for the 'Value' recommendation tier (< 1 = cheaper)."
          value={settings.wizardValueMultiplier}
          step={0.01}
          min={0.5}
          max={2}
          unit="×"
          onChange={set("wizardValueMultiplier")}
        />
        <NumericInput
          label="Balanced Tier Multiplier"
          hint="Multiplier for the 'Balanced' tier. Typically 1.0 (market price)."
          value={settings.wizardBalancedMultiplier}
          step={0.01}
          min={0.5}
          max={2}
          unit="×"
          onChange={set("wizardBalancedMultiplier")}
        />
        <NumericInput
          label="Premium Tier Multiplier"
          hint="Multiplier for the 'Premium' tier with top-spec equipment."
          value={settings.wizardPremiumMultiplier}
          step={0.01}
          min={0.5}
          max={3}
          unit="×"
          onChange={set("wizardPremiumMultiplier")}
        />
        <NumericInput
          label="Peak Sun Hours / Day"
          hint="Average peak sun hours for Thailand used in yield and savings calculations."
          value={settings.wizardSunHoursPerDay}
          step={0.5}
          min={1}
          max={12}
          unit="hrs/day"
          onChange={set("wizardSunHoursPerDay")}
        />
        <NumericInput
          label="Electricity Cost / Unit"
          hint="Average Thailand PEA/MEA electricity tariff used for monthly savings (THB/kWh)."
          value={settings.wizardElectricityCostPerUnit}
          step={0.1}
          min={1}
          max={20}
          unit="THB/kWh"
          onChange={set("wizardElectricityCostPerUnit")}
        />
      </SectionCard>

      {/* ─── Rooftop Planner ─────────────────────────────────── */}
      <SectionCard
        icon={Sliders}
        title="Rooftop 2D Planner"
        subtitle="Controls the default values and slider bounds in the /visualizer multi-roof planner"
      >
        <NumericInput
          label="Default Roof Width"
          hint="Starting width (meters) when a new roof plane is added."
          value={settings.plannerDefaultWidth}
          step={0.5}
          min={1}
          max={30}
          unit="m"
          onChange={set("plannerDefaultWidth")}
        />
        <NumericInput
          label="Default Roof Height"
          hint="Starting depth/height (meters) when a new roof plane is added."
          value={settings.plannerDefaultHeight}
          step={0.5}
          min={1}
          max={20}
          unit="m"
          onChange={set("plannerDefaultHeight")}
        />
        <NumericInput
          label="Default Roof Pitch"
          hint="Default slope angle in degrees for optimal Bangkok yield (~15°)."
          value={settings.plannerDefaultPitch}
          step={1}
          min={0}
          max={settings.plannerMaxPitch}
          unit="°"
          onChange={set("plannerDefaultPitch")}
        />
        <NumericInput
          label="Min Width Bound"
          hint="Minimum value on the width slider."
          value={settings.plannerMinWidth}
          step={0.5}
          min={1}
          max={settings.plannerMaxWidth - 1}
          unit="m"
          onChange={set("plannerMinWidth")}
        />
        <NumericInput
          label="Max Width Bound"
          hint="Maximum value on the width slider."
          value={settings.plannerMaxWidth}
          step={0.5}
          min={settings.plannerMinWidth + 1}
          max={50}
          unit="m"
          onChange={set("plannerMaxWidth")}
        />
        <NumericInput
          label="Min Height Bound"
          hint="Minimum value on the height slider."
          value={settings.plannerMinHeight}
          step={0.5}
          min={1}
          max={settings.plannerMaxHeight - 1}
          unit="m"
          onChange={set("plannerMinHeight")}
        />
        <NumericInput
          label="Max Height Bound"
          hint="Maximum value on the height slider."
          value={settings.plannerMaxHeight}
          step={0.5}
          min={settings.plannerMinHeight + 1}
          max={30}
          unit="m"
          onChange={set("plannerMaxHeight")}
        />
        <NumericInput
          label="Max Pitch Angle"
          hint="Maximum degree the roof slope slider can reach."
          value={settings.plannerMaxPitch}
          step={1}
          min={10}
          max={90}
          unit="°"
          onChange={set("plannerMaxPitch")}
        />
      </SectionCard>

      {/* ─── Save Footer ─────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 px-5 py-3 border border-[#1E293B] text-gray-400 hover:bg-[#0B1121] rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-6 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-none shadow-[#B7D1EA]/10 disabled:opacity-60 cursor-pointer"
        >
          {isPending ? (
            <GsapSpinner className="h-3.5 w-3.5" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {isPending ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
