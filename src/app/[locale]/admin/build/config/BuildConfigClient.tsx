"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  BatteryCharging,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  GripVertical,
  Layers3,
  ListChecks,
  MoveDown,
  MoveUp,
  Palette,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { LocalizationApplyControl } from "@/components/admin/LocalizationApplyControl";
import { LocalizedFieldMarker } from "@/components/admin/LocalizedFieldMarker";
import { useSupportedLocales } from "@/components/providers/SupportedLocalesProvider";
import { locales, type Locale } from "@/i18n/locales";

import {
  DEFAULT_BUILD_CONFIG,
  DEFAULT_CUSTOM_CAPACITY_CONFIG,
  parseBuildConfig,
  type BuildConfig,
  type BuildConfigData,
  type BuildStepConfig,
  type DesignProfileConfig,
  type EstimatedBudgetBand,
} from "@/lib/buildConfig";
import type { SolarAddonConfig } from "@/lib/solarAddonConfig";
import { cn, formatPrice } from "@/lib/utils";
import { resetBuildConfigToStarter, saveBuildConfig } from "./actions";

type TabKey = "steps" | "profiles" | "budgets" | "addons" | "settings" | "json";

const TABS: Array<{ key: TabKey; label: string; icon: typeof ListChecks }> = [
  { key: "steps", label: "Steps", icon: ListChecks },
  { key: "profiles", label: "Design Profiles", icon: Palette },
  { key: "budgets", label: "Estimated Budgets", icon: BadgeDollarSign },
  { key: "addons", label: "Solar Add-ons", icon: BatteryCharging },
  { key: "settings", label: "Global Settings", icon: Settings2 },
  { key: "json", label: "Current Config", icon: Braces },
];

const INPUT_MODES: BuildStepConfig["settings"]["inputMode"][] = ["choice", "number", "text", "map", "summary"];
const PROFILE_TONES: DesignProfileConfig["tone"][] = ["premium", "technical", "friendly", "minimal"];
const BuildContentLocaleContext = createContext<Locale>("th");

function nextId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}`;
}

function withoutLocaleConfigs(config: BuildConfig): BuildConfigData {
  const editableConfig = { ...config };
  delete editableConfig.localeConfigs;
  return editableConfig;
}

function getLanguageConfigs(initialConfig: BuildConfig): Record<Locale, BuildConfigData> {
  const fallback = withoutLocaleConfigs(initialConfig);
  return Object.fromEntries(locales.map((locale) => [
    locale,
    structuredClone(initialConfig.localeConfigs?.[locale] ?? fallback),
  ])) as Record<Locale, BuildConfigData>;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const locale = useContext(BuildContentLocaleContext);

  return (
    <label className="space-y-1.5 block">
      <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-slate-800 bg-[#0B1121] px-3 text-xs font-medium text-slate-200 placeholder-slate-600 outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
      />
      <LocalizedFieldMarker locale={locale} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  const locale = useContext(BuildContentLocaleContext);

  return (
    <label className="space-y-1.5 block">
      <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full rounded-md border border-slate-800 bg-[#0B1121] px-3 text-xs font-medium text-slate-200 outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
      />
      <LocalizedFieldMarker locale={locale} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const locale = useContext(BuildContentLocaleContext);

  return (
    <label className="space-y-1.5 block">
      <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-md border border-slate-800 bg-[#0B1121] px-3 py-2 text-xs font-medium text-slate-200 leading-relaxed outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
      />
      <LocalizedFieldMarker locale={locale} />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-[#0B1121] px-3 py-2.5 cursor-pointer hover:border-slate-700 transition-colors">
      <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-[#B7D1EA] focus:ring-[#B7D1EA]"
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-10 w-full rounded-md border border-slate-800 bg-[#0B1121] px-3 text-xs font-medium text-slate-200 outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-6">
      <div className="flex flex-col gap-1 border-b border-slate-800 pb-4">
        <h2 className="text-base font-black text-white">{title}</h2>
        {description ? <p className="text-xs font-medium leading-relaxed text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface ItemCardProps {
  title: string;
  subtitle?: React.ReactNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function CollapsibleItemCard({
  title,
  subtitle,
  isExpanded,
  onToggleExpand,
  onRemove,
  dragHandleProps,
  actions,
  children,
}: ItemCardProps) {
  return (
    <div
      {...(dragHandleProps || {})}
      className={cn(
        "rounded-xl border border-slate-800 bg-[#0F172A] transition-all duration-200 overflow-hidden",
        isExpanded ? "ring-1 ring-[#B7D1EA]/30 border-slate-700 shadow-md" : "hover:border-slate-700"
      )}
    >
      {/* Card Header (Collapsed State Display) */}
      <div className="p-4 flex items-center justify-between gap-3 bg-[#0F172A] border-b border-slate-800/60 select-none">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {dragHandleProps && (
            <div className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300 p-1 transition-colors">
              <GripVertical className="w-4 h-4" />
            </div>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-2 text-left min-w-0 flex-1 group cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 shrink-0 text-[#B7D1EA] transition-transform" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-300 transition-transform" />
            )}

            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-slate-100 group-hover:text-white truncate">
                {title || "Untitled Item"}
              </span>
              {subtitle}
            </div>
          </button>
        </div>

        {/* Top-Right Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove item"
            className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 p-2 rounded-md transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Edit Form */}
      {isExpanded && <div className="p-5 bg-[#0B1121]/60 border-t border-slate-800 space-y-4">{children}</div>}
    </div>
  );
}

export default function BuildConfigClient({ initialConfig }: { initialConfig: BuildConfig }) {
  const [activeTab, setActiveTab] = useState<TabKey>("steps");
  const supportedLocales = useSupportedLocales();
  const initialContentLocale = supportedLocales[0] ?? "th";
  const [contentLocale, setContentLocale] = useState<Locale>(initialContentLocale);
  const [languageConfigs, setLanguageConfigs] = useState<Record<Locale, BuildConfigData>>(() => getLanguageConfigs(initialConfig));
  const config = languageConfigs[contentLocale];
  const [rawJson, setRawJson] = useState(() => JSON.stringify(languageConfigs[initialContentLocale], null, 2));
  const [isPending, startTransition] = useTransition();

  // Accordion Expand / Collapse States for all 4 Tabs
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});
  const [expandedProfileIds, setExpandedProfileIds] = useState<Record<string, boolean>>({});
  const [expandedBudgetIds, setExpandedBudgetIds] = useState<Record<string, boolean>>({});
  const [expandedAddonIds, setExpandedAddonIds] = useState<Record<string, boolean>>({});

  // Drag & Drop State for Steps
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);

  const sortedSteps = useMemo(
    () => [...config.steps].sort((a, b) => a.displayOrder - b.displayOrder),
    [config.steps]
  );
  const activeBudgets = config.estimatedBudgets.filter((budget) => budget.isActive);

  const updateConfig = (next: BuildConfigData) => {
    setLanguageConfigs((current) => ({ ...current, [contentLocale]: next }));
    setRawJson(JSON.stringify(next, null, 2));
  };

  const switchContentLocale = (locale: Locale) => {
    setContentLocale(locale);
    setRawJson(JSON.stringify(languageConfigs[locale], null, 2));
  };

  const save = () => {
    startTransition(async () => {
      try {
        const result = await saveBuildConfig({ ...config, localeConfigs: languageConfigs });
        if (!result.success || !result.config) {
          toast.error(result.error || "Failed to save build config");
          return;
        }

        setLanguageConfigs(getLanguageConfigs(result.config));
        setRawJson(JSON.stringify(getLanguageConfigs(result.config)[contentLocale], null, 2));
        toast.success("Build config saved successfully");
      } catch (error) {
        console.error("Failed to save build config:", error);
        toast.error("Could not save build config. Please try again.");
      }
    });
  };

  const resetStarter = () => {
    startTransition(async () => {
      try {
        const result = await resetBuildConfigToStarter();
        if (!result.success || !result.config) {
          toast.error(result.error || "Failed to reset config");
          return;
        }

        setLanguageConfigs(getLanguageConfigs(result.config));
        setRawJson(JSON.stringify(getLanguageConfigs(result.config)[contentLocale], null, 2));
        toast.success("Starter config restored");
      } catch (error) {
        console.error("Failed to reset build config:", error);
        toast.error("Could not reset build config. Please try again.");
      }
    });
  };

  const applyRawJson = () => {
    try {
      updateConfig(withoutLocaleConfigs(parseBuildConfig(JSON.parse(rawJson))));
      toast.success("JSON applied to editor");
    } catch {
      toast.error("Current config JSON is invalid");
    }
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    toast.success("Current config copied to clipboard");
  };

  // Helper Updaters
  const updateStep = (id: string, updater: (step: BuildStepConfig) => BuildStepConfig) => {
    updateConfig({
      ...config,
      steps: config.steps.map((step) => (step.id === id ? updater(step) : step)),
    });
  };

  const stepTranslation = (
    step: BuildStepConfig,
    field: "title" | "description" | "helperText" | "validationMessage",
  ) => step.translations?.[contentLocale]?.[field]
    ?? (field === "helperText" ? step.settings.helperText : field === "validationMessage" ? step.settings.validationMessage : step[field]);

  const updateStepTranslation = (
    id: string,
    field: "title" | "description" | "helperText" | "validationMessage",
    value: string,
  ) => updateStep(id, (step) => ({
    ...step,
    ...(contentLocale === "th" && field !== "helperText" && field !== "validationMessage" ? { [field]: value } : {}),
    ...(contentLocale === "th" && field === "helperText" ? { settings: { ...step.settings, helperText: value } } : {}),
    ...(contentLocale === "th" && field === "validationMessage" ? { settings: { ...step.settings, validationMessage: value } } : {}),
    translations: {
      ...step.translations,
      [contentLocale]: { ...step.translations?.[contentLocale], [field]: value },
    },
  }));

  const profileTranslation = (profile: DesignProfileConfig, field: "name" | "summaryCopy") => profile.translations?.[contentLocale]?.[field] ?? profile[field];
  const updateProfileTranslation = (id: string, field: "name" | "summaryCopy", value: string) => updateProfile(id, (profile) => ({
    ...profile,
    ...(contentLocale === "th" ? { [field]: value } : {}),
    translations: { ...profile.translations, [contentLocale]: { ...profile.translations?.[contentLocale], [field]: value } },
  }));

  const budgetTranslation = (budget: EstimatedBudgetBand, field: "label" | "notes") => budget.translations?.[contentLocale]?.[field] ?? budget[field];
  const updateBudgetTranslation = (id: string, field: "label" | "notes", value: string) => updateBudget(id, (budget) => ({
    ...budget,
    ...(contentLocale === "th" ? { [field]: value } : {}),
    translations: { ...budget.translations, [contentLocale]: { ...budget.translations?.[contentLocale], [field]: value } },
  }));

  const updateProfile = (id: string, updater: (profile: DesignProfileConfig) => DesignProfileConfig) => {
    const nextProfiles = config.designProfiles.map((profile) => (profile.id === id ? updater(profile) : profile));
    updateConfig({ ...config, designProfiles: nextProfiles });
  };

  const updateBudget = (id: string, updater: (budget: EstimatedBudgetBand) => EstimatedBudgetBand) => {
    updateConfig({
      ...config,
      estimatedBudgets: config.estimatedBudgets.map((budget) => (budget.id === id ? updater(budget) : budget)),
    });
  };

  const updateAddon = (id: string, updater: (addon: SolarAddonConfig) => SolarAddonConfig) => {
    updateConfig({
      ...config,
      smartAddons: config.smartAddons.map((addon) => (addon.id === id ? updater(addon) : addon)),
    });
  };

  // Step Sequence Controls
  const moveStep = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedSteps.length) return;

    const newSteps = [...sortedSteps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;

    // Reassign displayOrder sequential values
    const reorderedSteps = newSteps.map((step, idx) => ({
      ...step,
      displayOrder: idx + 1,
    }));

    updateConfig({ ...config, steps: reorderedSteps });
  };

  const handleStepDrop = (targetId: string) => {
    if (!draggedStepId || draggedStepId === targetId) return;

    const fromIndex = sortedSteps.findIndex((s) => s.id === draggedStepId);
    const toIndex = sortedSteps.findIndex((s) => s.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const newSteps = [...sortedSteps];
    const [movedStep] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, movedStep);

    const reorderedSteps = newSteps.map((step, idx) => ({
      ...step,
      displayOrder: idx + 1,
    }));

    updateConfig({ ...config, steps: reorderedSteps });
    setDraggedStepId(null);
  };

  return (
    <BuildContentLocaleContext.Provider value={contentLocale}>
    <div className="space-y-6 font-sans text-slate-200">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/15 border border-[#B7D1EA]/30 px-3.5 py-1 text-xs font-black text-[#B7D1EA]">
            <Layers3 className="h-4 w-4" />
            Build Config Operations
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Build Page Configuration</h1>
          <p className="mt-2 max-w-3xl text-xs font-medium leading-relaxed text-slate-400">
            Manage a complete build journey configuration for the selected language, including step behavior, design profiles, budget bands, add-ons, and global defaults.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <LocalizationApplyControl locale={contentLocale} onLocaleChange={switchContentLocale} onApply={save} isPending={isPending} label="Apply language preset" />
          <button
            type="button"
            onClick={resetStarter}
            disabled={isPending}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-4 text-xs font-bold text-slate-300 transition hover:bg-slate-700 cursor-pointer disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            Load Starter Data
          </button>
        </div>
      </div>

      {/* Summary KPI Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <SummaryTile label="Steps" value={String(config.steps.length)} detail={`${config.steps.filter((step) => step.isEnabled).length} enabled`} />
        <SummaryTile label="Design Profiles" value={String(config.designProfiles.length)} detail={config.designProfiles.find((profile) => profile.isDefault)?.name || "No default"} />
        <SummaryTile label="Budget Bands" value={String(activeBudgets.length)} detail={activeBudgets.length ? `${formatPrice(Math.min(...activeBudgets.map((item) => item.min)))}+` : "No active bands"} />
        <SummaryTile label="Solar Add-ons" value={String(config.smartAddons.length)} detail={`${config.smartAddons.filter((addon) => addon.isRecommended).length} recommended`} />
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-[#0F172A] p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition cursor-pointer",
                selected
                  ? "bg-[#B7D1EA] text-[#0F172A] font-extrabold shadow-sm"
                  : "text-slate-400 hover:bg-[#0B1121] hover:text-slate-200"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {/* Tab 1: Steps & Part Settings */}
          {activeTab === "steps" ? (
            <Panel
              title="Steps & Part Settings"
              description="Control display order, sequence, routing, input modes, system-size bounds, and validation messages for each build step."
            >
              <div className="space-y-3">
                {sortedSteps.map((step, idx) => {
                  const isExpanded = !!expandedStepIds[step.id];
                  return (
                    <CollapsibleItemCard
                      key={step.id}
                      title={stepTranslation(step, "title")}
                      subtitle={
                        <>
                          <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300">
                            #{step.displayOrder}
                          </span>
                          <span className="rounded-full bg-[#0B1121] border border-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                            {step.route}
                          </span>
                          {step.isEnabled ? (
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                              Enabled
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              Disabled
                            </span>
                          )}
                        </>
                      }
                      isExpanded={isExpanded}
                      onToggleExpand={() =>
                        setExpandedStepIds((prev) => ({ ...prev, [step.id]: !prev[step.id] }))
                      }
                      onRemove={() =>
                        updateConfig({ ...config, steps: config.steps.filter((item) => item.id !== step.id) })
                      }
                      dragHandleProps={{
                        draggable: true,
                        onDragStart: () => setDraggedStepId(step.id),
                        onDragOver: (e) => e.preventDefault(),
                        onDrop: () => handleStepDrop(step.id),
                      }}
                      actions={
                        <div className="flex items-center gap-1 border-r border-slate-800 pr-2 mr-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStep(idx, "up");
                            }}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Move Up"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === sortedSteps.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStep(idx, "down");
                            }}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Move Down"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      }
                    >
                      <div className="grid gap-3 lg:grid-cols-[1fr_120px_140px]">
                        <TextField label="Step Title" value={stepTranslation(step, "title")} onChange={(value) => updateStepTranslation(step.id, "title", value)} />
                        <NumberField label="Display Order" value={step.displayOrder} onChange={(value) => updateStep(step.id, (item) => ({ ...item, displayOrder: value }))} />
                        <TextField label="Step ID" value={step.id} onChange={(value) => updateStep(step.id, (item) => ({ ...item, id: value }))} />
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <TextField label="Route Path" value={step.route} onChange={(value) => updateStep(step.id, (item) => ({ ...item, route: value }))} />
                        <SelectField label="Input Mode" value={step.settings.inputMode} options={INPUT_MODES} onChange={(value) => updateStep(step.id, (item) => ({ ...item, settings: { ...item.settings, inputMode: value } }))} />
                      </div>
                      <div>
                        <TextAreaField label="Step Description" value={stepTranslation(step, "description")} onChange={(value) => updateStepTranslation(step.id, "description", value)} />
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        <TextField label="Default Value" value={step.settings.defaultValue} onChange={(value) => updateStep(step.id, (item) => ({ ...item, settings: { ...item.settings, defaultValue: value } }))} />
                        <NumberField label="Min System kW" value={step.settings.minKw} onChange={(value) => updateStep(step.id, (item) => ({ ...item, settings: { ...item.settings, minKw: value } }))} />
                        <NumberField label="Max System kW" value={step.settings.maxKw} onChange={(value) => updateStep(step.id, (item) => ({ ...item, settings: { ...item.settings, maxKw: value } }))} />
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <TextAreaField label="Helper Text" value={stepTranslation(step, "helperText")} onChange={(value) => updateStepTranslation(step.id, "helperText", value)} />
                        <TextAreaField label="Validation Message" value={stepTranslation(step, "validationMessage")} onChange={(value) => updateStepTranslation(step.id, "validationMessage", value)} />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <ToggleField label="Step Enabled" checked={step.isEnabled} onChange={(checked) => updateStep(step.id, (item) => ({ ...item, isEnabled: checked }))} />
                        <ToggleField label="Step Required" checked={step.isRequired} onChange={(checked) => updateStep(step.id, (item) => ({ ...item, isRequired: checked }))} />
                        <ToggleField label="Allow Skip" checked={step.settings.allowSkip} onChange={(checked) => updateStep(step.id, (item) => ({ ...item, settings: { ...item.settings, allowSkip: checked } }))} />
                      </div>
                    </CollapsibleItemCard>
                  );
                })}

                {/* Dashed Add New Step Button */}
                <button
                  type="button"
                  onClick={() => {
                    const newId = nextId("step");
                    updateConfig({
                      ...config,
                      steps: [
                        ...config.steps,
                        {
                          ...DEFAULT_BUILD_CONFIG.steps[0],
                          id: newId,
                          title: "New Build Step",
                          displayOrder: config.steps.length + 1,
                        },
                      ],
                    });
                    setExpandedStepIds((prev) => ({ ...prev, [newId]: true }));
                  }}
                  className="w-full py-4 mt-4 border-2 border-dashed border-slate-700 text-slate-400 hover:text-[#B7D1EA] hover:border-[#B7D1EA] hover:bg-[#B7D1EA]/5 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 font-bold text-sm cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>+ Add New Step</span>
                </button>
              </div>
            </Panel>
          ) : null}

          {/* Tab 2: Design Profiles */}
          {activeTab === "profiles" ? (
            <Panel
              title="Design Profiles"
              description="Set proposal tone, color schemes, mascot assets, and summary copy used by the consultant and customer build flows."
            >
              <div className="space-y-3">
                {config.designProfiles.map((profile) => {
                  const isExpanded = !!expandedProfileIds[profile.id];
                  return (
                    <CollapsibleItemCard
                      key={profile.id}
                      title={profileTranslation(profile, "name")}
                      subtitle={
                        <>
                          <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-mono uppercase text-slate-300">
                            {profile.tone}
                          </span>
                          {/* Color Swatches Preview */}
                          <div className="flex items-center gap-1.5 ml-1 bg-[#0B1121] border border-slate-800 px-2 py-0.5 rounded-full">
                            <span
                              className="w-3 h-3 rounded-full border border-white/20 shadow-xs"
                              style={{ backgroundColor: profile.primaryColor || "#0369a1" }}
                              title={`Primary: ${profile.primaryColor}`}
                            />
                            <span
                              className="w-3 h-3 rounded-full border border-white/20 shadow-xs"
                              style={{ backgroundColor: profile.accentColor || "#B7D1EA" }}
                              title={`Accent: ${profile.accentColor}`}
                            />
                          </div>
                          {profile.isDefault && (
                            <span className="rounded-full bg-[#B7D1EA]/20 border border-[#B7D1EA]/40 px-2 py-0.5 text-[10px] font-bold text-[#B7D1EA]">
                              Default Profile
                            </span>
                          )}
                        </>
                      }
                      isExpanded={isExpanded}
                      onToggleExpand={() =>
                        setExpandedProfileIds((prev) => ({ ...prev, [profile.id]: !prev[profile.id] }))
                      }
                      onRemove={() =>
                        updateConfig({
                          ...config,
                          designProfiles: config.designProfiles.filter((item) => item.id !== profile.id),
                        })
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField label="Profile Name" value={profileTranslation(profile, "name")} onChange={(value) => updateProfileTranslation(profile.id, "name", value)} />
                        <TextField label="Profile ID" value={profile.id} onChange={(value) => updateProfile(profile.id, (item) => ({ ...item, id: value }))} />
                        <SelectField label="Tone" value={profile.tone} options={PROFILE_TONES} onChange={(value) => updateProfile(profile.id, (item) => ({ ...item, tone: value }))} />
                        <TextField label="Mascot Asset URL/Icon" value={profile.mascotAsset} onChange={(value) => updateProfile(profile.id, (item) => ({ ...item, mascotAsset: value }))} />
                        <TextField label="Primary Color (Hex/HSL)" value={profile.primaryColor} onChange={(value) => updateProfile(profile.id, (item) => ({ ...item, primaryColor: value }))} />
                        <TextField label="Accent Color (Hex/HSL)" value={profile.accentColor} onChange={(value) => updateProfile(profile.id, (item) => ({ ...item, accentColor: value }))} />
                      </div>
                      <div>
                        <TextAreaField label="Summary Copy" value={profileTranslation(profile, "summaryCopy")} onChange={(value) => updateProfileTranslation(profile.id, "summaryCopy", value)} />
                      </div>
                      <div className="pt-1">
                        <ToggleField
                          label="Default Profile"
                          checked={profile.isDefault}
                          onChange={(checked) =>
                            updateConfig({
                              ...config,
                              designProfiles: config.designProfiles.map((item) => ({
                                ...item,
                                isDefault: item.id === profile.id ? checked : checked ? false : item.isDefault,
                              })),
                            })
                          }
                        />
                      </div>
                    </CollapsibleItemCard>
                  );
                })}

                {/* Dashed Add New Design Profile Button */}
                <button
                  type="button"
                  onClick={() => {
                    const newId = nextId("profile");
                    updateConfig({
                      ...config,
                      designProfiles: [
                        ...config.designProfiles,
                        {
                          ...DEFAULT_BUILD_CONFIG.designProfiles[0],
                          id: newId,
                          name: "New Design Profile",
                          isDefault: false,
                        },
                      ],
                    });
                    setExpandedProfileIds((prev) => ({ ...prev, [newId]: true }));
                  }}
                  className="w-full py-4 mt-4 border-2 border-dashed border-slate-700 text-slate-400 hover:text-[#B7D1EA] hover:border-[#B7D1EA] hover:bg-[#B7D1EA]/5 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 font-bold text-sm cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>+ Add New Design Profile</span>
                </button>
              </div>
            </Panel>
          ) : null}

          {/* Tab 3: Estimated Budgets */}
          {activeTab === "budgets" ? (
            <Panel
              title="Estimated Budget Bands"
              description="Define customer budget ranges, recommended system kW output, and staff guidance notes."
            >
              <div className="space-y-3">
                {config.estimatedBudgets.map((budget) => {
                  const isExpanded = !!expandedBudgetIds[budget.id];
                  return (
                    <CollapsibleItemCard
                      key={budget.id}
                      title={budgetTranslation(budget, "label")}
                      subtitle={
                        <>
                          <span className="rounded-full bg-[#0B1121] border border-slate-800 px-2.5 py-0.5 text-[10px] font-mono text-emerald-400 font-bold">
                            {formatPrice(budget.min)} - {formatPrice(budget.max)}
                          </span>
                          <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                            {budget.recommendedKw} kW
                          </span>
                          {budget.isActive ? (
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              Inactive
                            </span>
                          )}
                        </>
                      }
                      isExpanded={isExpanded}
                      onToggleExpand={() =>
                        setExpandedBudgetIds((prev) => ({ ...prev, [budget.id]: !prev[budget.id] }))
                      }
                      onRemove={() =>
                        updateConfig({
                          ...config,
                          estimatedBudgets: config.estimatedBudgets.filter((item) => item.id !== budget.id),
                        })
                      }
                    >
                      <div className="grid gap-3 lg:grid-cols-2">
                        <TextField label="Label" value={budgetTranslation(budget, "label")} onChange={(value) => updateBudgetTranslation(budget.id, "label", value)} />
                        <TextField label="Band ID" value={budget.id} onChange={(value) => updateBudget(budget.id, (item) => ({ ...item, id: value }))} />
                        <NumberField label="Minimum Valuation (THB)" value={budget.min} onChange={(value) => updateBudget(budget.id, (item) => ({ ...item, min: value }))} />
                        <NumberField label="Maximum Valuation (THB)" value={budget.max} onChange={(value) => updateBudget(budget.id, (item) => ({ ...item, max: value }))} />
                        <NumberField label="Recommended System kW" value={budget.recommendedKw} step={0.01} onChange={(value) => updateBudget(budget.id, (item) => ({ ...item, recommendedKw: value }))} />
                        <ToggleField label="Band Active" checked={budget.isActive} onChange={(checked) => updateBudget(budget.id, (item) => ({ ...item, isActive: checked }))} />
                      </div>
                      <div>
                        <TextAreaField label="Staff Notes" value={budgetTranslation(budget, "notes")} onChange={(value) => updateBudgetTranslation(budget.id, "notes", value)} />
                      </div>
                    </CollapsibleItemCard>
                  );
                })}

                {/* Dashed Add New Budget Band Button */}
                <button
                  type="button"
                  onClick={() => {
                    const newId = nextId("budget");
                    updateConfig({
                      ...config,
                      estimatedBudgets: [
                        ...config.estimatedBudgets,
                        {
                          ...DEFAULT_BUILD_CONFIG.estimatedBudgets[0],
                          id: newId,
                          label: "New Budget Band",
                          min: 100000,
                          max: 300000,
                          recommendedKw: 5.0,
                          isActive: true,
                        },
                      ],
                    });
                    setExpandedBudgetIds((prev) => ({ ...prev, [newId]: true }));
                  }}
                  className="w-full py-4 mt-4 border-2 border-dashed border-slate-700 text-slate-400 hover:text-[#B7D1EA] hover:border-[#B7D1EA] hover:bg-[#B7D1EA]/5 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 font-bold text-sm cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>+ Add New Budget Band</span>
                </button>
              </div>
            </Panel>
          ) : null}

          {/* Tab 4: Solar Add-ons */}
          {activeTab === "addons" ? (
            <Panel
              title="Product Add-on Catalog Integration"
              description="Manage central Solar Add-ons, prices, and sub-option choices in the standalone Add-ons Catalog Manager."
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-2xl border border-sky-500/30 bg-sky-500/10 p-5 text-[#B7D1EA]">
                  <div>
                    <h4 className="text-sm font-black text-white">Central Add-ons Catalog Manager</h4>
                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      Add-ons are managed in a dedicated catalog page to maintain consistency across Build & Wizard.
                    </p>
                  </div>
                  <Link
                    href="/admin/settings/addons"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#B7D1EA] px-4 py-2.5 text-xs font-black text-[#0F172A] shadow-md transition hover:bg-[#99BFE3]"
                  >
                    Open Add-ons Catalog
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-black uppercase text-slate-400">Current Catalog Overview ({config.smartAddons.length})</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {config.smartAddons.map((addon) => {
                      const isVisible = addon.isVisible !== false;
                      return (
                        <div key={addon.id} className={`rounded-xl border p-3 flex items-center justify-between text-xs ${isVisible ? "border-slate-800 bg-[#0B1121]" : "border-slate-800/60 bg-[#0B1121]/60 opacity-75"}`}>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-black text-white">{addon.name}</p>
                              {isVisible ? (
                                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-black text-emerald-400">Visible</span>
                              ) : (
                                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-black text-amber-400">Hidden</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">{addon.category} • {addon.inputType}</p>
                          </div>
                          <span className="font-mono text-xs font-bold text-[#B7D1EA]">
                            {addon.inputType === "SELECT" && addon.optionsList ? `${addon.optionsList.length} Options` : formatPrice(addon.price ?? 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          {/* Tab 5: Global Settings */}
          {activeTab === "settings" ? (
            <Panel title="Global Build Settings" description="Default lead statuses, SLA hours, monthly savings assumptions, and ERPNext integration controls.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SelectField label="Default Locale" value={config.globalSettings.defaultLocale} options={[...locales]} onChange={(value) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, defaultLocale: value } })} />
                <TextField label="Default Lead Status" value={config.globalSettings.defaultLeadStatus} onChange={(value) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, defaultLeadStatus: value } })} />
                <TextField label="Default Proposal Status" value={config.globalSettings.defaultProposalStatus} onChange={(value) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, defaultProposalStatus: value } })} />
                <NumberField label="Staff Review SLA (Hours)" value={config.globalSettings.staffReviewSlaHours} onChange={(value) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, staffReviewSlaHours: value } })} />
                <NumberField label="Savings Rate (THB/kWh)" value={config.globalSettings.monthlySavingsRatePerKwh} step={0.01} onChange={(value) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, monthlySavingsRatePerKwh: value } })} />
                <ToggleField label="Require Postal Code" checked={config.globalSettings.requirePostalCode} onChange={(checked) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, requirePostalCode: checked } })} />
                <ToggleField label="Require Customer Notes" checked={config.globalSettings.requireCustomerNotes} onChange={(checked) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, requireCustomerNotes: checked } })} />
                <ToggleField label="Enable Smart Add-ons" checked={config.globalSettings.enableSmartAddons} onChange={(checked) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, enableSmartAddons: checked } })} />
                <ToggleField label="Enable ERPNext Sync" checked={config.globalSettings.enableErpnextSync} onChange={(checked) => updateConfig({ ...config, globalSettings: { ...config.globalSettings, enableErpnextSync: checked } })} />
              </div>

              {/* Custom System Capacity Slider Controls */}
              <div className="mt-6 border-t border-slate-800 pt-6">
                <h3 className="text-sm font-bold text-[#B7D1EA] mb-3">Custom System Capacity Slider Settings</h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <ToggleField
                    label="Enable Custom Capacity Slider"
                    checked={config.customCapacity?.isEnabled ?? true}
                    onChange={(checked) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          isEnabled: checked,
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Min Capacity (kWp)"
                    value={config.customCapacity?.minKw ?? 5}
                    step={0.5}
                    onChange={(value) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          minKw: value,
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Max Capacity (kWp)"
                    value={config.customCapacity?.maxKw ?? 30}
                    step={0.5}
                    onChange={(value) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          maxKw: value,
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Step Size (kWp)"
                    value={config.customCapacity?.stepKw ?? 0.5}
                    step={0.1}
                    onChange={(value) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          stepKw: value,
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Starting Price Min (kWp)"
                    value={config.customCapacity?.startingPriceMinKw ?? 5}
                    step={0.5}
                    onChange={(value) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          startingPriceMinKw: value,
                        },
                      })
                    }
                  />
                  <NumberField
                    label="Starting Price Max (kWp)"
                    value={config.customCapacity?.startingPriceMaxKw ?? 20}
                    step={0.5}
                    onChange={(value) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          startingPriceMaxKw: value,
                        },
                      })
                    }
                  />
                  <TextField
                    label="Milestone Ticks (Comma separated)"
                    value={(config.customCapacity?.ticks ?? [5, 10, 15, 20, 30]).join(", ")}
                    onChange={(value) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          ticks: value
                            .split(",")
                            .map((v) => Number(v.trim()))
                            .filter((n) => Number.isFinite(n) && n > 0),
                        },
                      })
                    }
                  />
                  <TextField
                    label="Capacity Unit"
                    value={config.customCapacity?.unit ?? "kWp"}
                    onChange={(value) =>
                      updateConfig({
                        ...config,
                        customCapacity: {
                          ...(config.customCapacity ?? DEFAULT_CUSTOM_CAPACITY_CONFIG),
                          unit: value,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </Panel>
          ) : null}

          {/* Tab 6: Current Config JSON */}
          {activeTab === "json" ? (
            <Panel title="Current Config JSON Document" description="Directly view, edit, or copy the raw JSON configuration payload.">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                <textarea
                  value={rawJson}
                  onChange={(event) => setRawJson(event.target.value)}
                  rows={22}
                  spellCheck={false}
                  className="w-full resize-y rounded-xl border border-slate-800 bg-[#0B1121] p-4 font-mono text-xs leading-relaxed text-[#B7D1EA] outline-none transition focus:border-[#B7D1EA]"
                />
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={applyRawJson}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-4 text-xs font-black text-[#0F172A] uppercase tracking-wider transition hover:bg-[#99BFE3] cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    Apply JSON Editor
                  </button>
                  <button
                    type="button"
                    onClick={copyJson}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-4 text-xs font-bold text-slate-300 transition hover:bg-slate-700 cursor-pointer"
                  >
                    <Copy className="h-4 w-4" />
                    Copy JSON Code
                  </button>
                  <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4 text-xs font-medium leading-relaxed text-slate-400 space-y-1">
                    <Eye className="h-4 w-4 text-[#B7D1EA] mb-1" />
                    <p className="font-bold text-slate-200">System Integration Payload</p>
                    <p>This is the exact JSON structure written to database settings under the build config key.</p>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}
        </div>

        {/* Real-time Customer View Simulator Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-5 sticky top-6">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Eye className="h-5 w-5 text-[#B7D1EA]" />
              <div>
                <h3 className="text-sm font-black text-white">Customer View Simulator</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Real-time Layout preview</p>
              </div>
            </div>

            {(() => {
              const defaultProfile = config.designProfiles.find((p) => p.isDefault) ?? config.designProfiles[0];
              if (!defaultProfile) return null;
              return (
                <div className="space-y-4">
                  {/* Banner Mockup */}
                  <div
                    className="rounded-2xl p-5 text-white transition-all duration-300 shadow-md border border-white/10"
                    style={{ backgroundColor: defaultProfile.primaryColor || "#0369a1" }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <span
                          className="inline-block rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest"
                          style={{
                            backgroundColor: defaultProfile.accentColor || "#B7D1EA",
                            color: defaultProfile.primaryColor || "#0369a1",
                          }}
                        >
                          {defaultProfile.tone.toUpperCase()}
                        </span>
                        <h4 className="text-base font-black tracking-tight">{defaultProfile.name}</h4>
                      </div>
                      {defaultProfile.mascotAsset && (
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-black/20 p-1 flex items-center justify-center font-bold text-lg select-none">
                          🤖
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed opacity-90">{defaultProfile.summaryCopy}</p>
                  </div>

                  {/* Step Checklist Preview */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Active Steps Tracker ({sortedSteps.length})
                    </p>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto scrollbar-thin pr-1">
                      {sortedSteps.map((step) => (
                        <div
                          key={step.id}
                          className="flex items-center justify-between text-xs rounded-xl bg-[#0B1121] p-2.5 border border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                step.isEnabled ? "bg-emerald-500" : "bg-slate-600"
                              )}
                            />
                            <span className="font-bold text-slate-300">{step.title}</span>
                          </div>
                          <span className="font-mono text-[9px] text-slate-500">{step.route}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing Tiers Preview */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Active Budget Bands ({activeBudgets.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {activeBudgets.slice(0, 4).map((budget) => (
                        <div key={budget.id} className="rounded-xl border border-slate-800 bg-[#0B1121] p-3 flex flex-col justify-between">
                          <p className="text-xs font-black text-slate-200">{budget.label}</p>
                          <p className="mt-2 text-[10px] font-bold text-emerald-400 font-mono">
                            {formatPrice(budget.min)} - {formatPrice(budget.max)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Integration Badges */}
                  <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider border",
                        config.globalSettings.enableErpnextSync
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-[#0B1121] border-slate-800 text-slate-500"
                      )}
                    >
                      ERPNext: {config.globalSettings.enableErpnextSync ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
    </BuildContentLocaleContext.Provider>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5 shadow-lg">
      <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">{label}</p>
      <p className="mt-2 truncate text-xl font-black text-white">{value}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-400">{detail}</p>
    </div>
  );
}
