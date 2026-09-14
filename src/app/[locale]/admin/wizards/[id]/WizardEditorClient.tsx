"use client";

import { type ReactNode, type SetStateAction, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "@/components/ui/icons";
import { upsertWizard, WizardWithRelations } from "@/app/actions/wizard";
import type { RecommendCategory } from "@/lib/wizardRecommendation";
import {
  DEFAULT_WIZARD_RECOMMENDATION_CONFIG,
  getBatterySizingCalculation,
  getSolarSizingCalculation,
  parseWizardRecommendationConfig,
  type WizardRecommendationConfig,
} from "@/lib/wizardRecommendationConfig";
import { formatPrice } from "@/lib/utils";
import {
  type WizardRecommendationRule,
  type WizardRuleAction,
  type WizardRuleCondition,
  type WizardScoringImpact,
} from "@/lib/wizardRules";
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Settings2,
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  ToggleLeft,
  SlidersHorizontal,
  GripVertical,
  BrainCircuit,
  Check,
  ChevronsUpDown,
  Info,
  Scale,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { LocalizationApplyControl } from "@/components/admin/LocalizationApplyControl";
import { LocalizedFieldMarker } from "@/components/admin/LocalizedFieldMarker";
import { locales, type Locale } from "@/i18n/locales";
import { useSupportedLocales } from "@/components/providers/SupportedLocalesProvider";

type WizardStepDraft = NonNullable<WizardWithRelations["steps"]>[number];
type WizardQuestionDraft = WizardStepDraft["questions"][number];
type WizardOptionDraft = WizardQuestionDraft["options"][number];
type StepField = "title" | "description";
type QuestionField = "questionText" | "type" | "helperText" | "stateKey" | "tooltipText" | "tooltipImageUrl";
type OptionField = "label" | "value" | "description" | "icon" | "isRecommended" | "tooltipText" | "tooltipImageUrl";
type FormulaField =
  | "solarFormula"
  | "batteryFormulaSolarOnly"
  | "batteryFormulaHybrid"
  | "batteryFormulaOffgrid";

type NumericRecommendationField = Exclude<
  keyof WizardRecommendationConfig,
  | FormulaField
  | "enabledCategorySlugs"
  | "recommendedProductIdsByCategorySlug"
  | "summaryAddons"
>;

type StoredRecommendationConfig = WizardRecommendationConfig & {
  localeConfigs?: Partial<Record<Locale, unknown>>;
};

function getLanguageRecommendationConfigs(
  raw: unknown,
): Record<Locale, WizardRecommendationConfig> {
  const record = raw !== null && typeof raw === "object" ? raw as StoredRecommendationConfig : null;
  const fallback = parseWizardRecommendationConfig(raw);
  const storedConfigs = record?.localeConfigs;

  return Object.fromEntries(locales.map((locale) => [
    locale,
    parseWizardRecommendationConfig(storedConfigs?.[locale] ?? fallback),
  ])) as Record<Locale, WizardRecommendationConfig>;
}

const RECOMMENDATION_FIELDS: Array<{
  key: NumericRecommendationField;
  label: string;
  step: number;
  help: string;
}> = [
  { key: "tariffRate", label: "Tariff (THB/kWh)", step: 0.1, help: "อัตราค่าไฟต่อหน่วย ใช้แปลงค่าไฟรายเดือนเป็นปริมาณพลังงานที่ใช้" },
  { key: "peakSunHours", label: "Peak sun hours", step: 0.1, help: "จำนวนชั่วโมงแดดประสิทธิภาพต่อวัน ใช้ประเมินพลังงานที่ระบบผลิตได้" },
  { key: "sizingDivisor", label: "Sizing divisor", step: 0.1, help: "ใช้หารพลังงานช่วงกลางวันเพื่อหาขนาด kWp พื้นฐาน สูตรหลัก: ((ค่าไฟ / tariffRate / 30) × daytimeUsagePct) / sizingDivisor" },
  { key: "minSolarKwp", label: "Min kWp", step: 0.1, help: "ขนาดระบบโซลาร์ต่ำสุดที่ผลลัพธ์สามารถแนะนำได้" },
  { key: "maxSolarKwp", label: "Max kWp", step: 0.5, help: "ขนาดระบบโซลาร์สูงสุดที่ผลลัพธ์สามารถแนะนำได้" },
  { key: "hybridBatteryRatio", label: "Hybrid battery ratio", step: 0.05, help: "สัดส่วน kWh ของแบตเตอรี่เทียบกับขนาดโซลาร์สำหรับระบบ Hybrid" },
  { key: "offgridBatteryRatio", label: "Off-grid battery ratio", step: 0.05, help: "สัดส่วน kWh ของแบตเตอรี่เทียบกับขนาดโซลาร์สำหรับระบบ Off-grid" },
  { key: "maxBatteryKwh", label: "Max battery kWh", step: 1, help: "จำกัดความจุแบตเตอรี่สูงสุดเพื่อป้องกันผลลัพธ์เกินขอบเขตสินค้า" },
  { key: "chartSunHours", label: "Chart sun hours", step: 0.1, help: "ชั่วโมงแดดที่ใช้คำนวณกราฟผลผลิตและการประหยัดในหน้าสรุป" },
  { key: "chartEfficiencyPct", label: "Chart efficiency %", step: 1, help: "ประสิทธิภาพรวมของระบบที่ใช้ลดค่าผลผลิตในกราฟให้ใกล้เคียงการใช้งานจริง" },
  { key: "estimateThresholdKw", label: "Estimate threshold (kWp)", step: 1, help: "ขนาดระบบโซลาร์ติดตั้งสูงสุด (kWp) ที่เมื่อลูกค้าคำนวณเกินแล้ว หน้าสรุปราคาจะเปลี่ยนเป็นติดต่อฝ่ายขายเพื่อเสนอราคา" },
];

const SOLAR_FORMULA_VARIABLES = [
  "monthlyBill",
  "tariffRate",
  "daysPerMonth",
  "daytimeUsagePct",
  "peakSunHours",
  "sizingDivisor",
  "minSolarKwp",
  "maxSolarKwp",
];

const BATTERY_FORMULA_VARIABLES = [
  "solarKwp",
  "hybridBatteryRatio",
  "offgridBatteryRatio",
  "maxBatteryKwh",
];

const FORMULA_FUNCTIONS = ["round(x)", "ceil(x)", "floor(x)", "min(a,b)", "max(a,b)", "clamp(x,min,max)"];

export default function WizardEditorClient({
  initialData,
  recommendationCategories,
}: {
  initialData: WizardWithRelations | null;
  recommendationCategories: RecommendCategory[];
}) {
  const router = useRouter();
  const t = useTranslations("AdminWizardEditor");
  const [isPending, startTransition] = useTransition();
  const supportedLocales = useSupportedLocales();
  const initialContentLocale = supportedLocales[0] ?? "th";
  const [contentLocale, setContentLocale] = useState<Locale>(initialContentLocale);

  // Initialize state with empty structure if new, otherwise map from DB
  const [wizard, setWizard] = useState<Partial<WizardWithRelations>>(
    initialData || {
      title: "",
      description: "",
      translations: {},
      slug: "",
      isActive: false,
      steps: [],
    }
  );

  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({ 0: true });
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [expandedScoring, setExpandedScoring] = useState<Record<string, boolean>>({});
  const [categorySelectOpen, setCategorySelectOpen] = useState(false);
  const [rules, setRules] = useState<WizardWithRelations["rules"]>(initialData?.rules || []);
  const [languageRecommendationConfigs, setLanguageRecommendationConfigs] = useState<Record<Locale, WizardRecommendationConfig>>(
    () => getLanguageRecommendationConfigs(initialData?.recommendationConfig),
  );
  const recommendationConfig = languageRecommendationConfigs[contentLocale];
  const setRecommendationConfig = (next: SetStateAction<WizardRecommendationConfig>) => {
    setLanguageRecommendationConfigs((current) => ({
      ...current,
      [contentLocale]: typeof next === "function" ? next(current[contentLocale]) : next,
    }));
  };
  const brands = useMemo(
    () => Array.from(new Set(
      recommendationCategories.flatMap((category) =>
        category.products.map((product) => product.brand).filter((brand): brand is string => Boolean(brand)),
      ),
    )).sort((a, b) => a.localeCompare(b)),
    [recommendationCategories],
  );
  const products = useMemo(
    () => recommendationCategories.flatMap((category) => category.products),
    [recommendationCategories],
  );
  const stateKeys = useMemo(
    () => Array.from(new Set(
      (wizard.steps || []).flatMap((step) => step.questions.map((question) => question.stateKey)).filter(Boolean),
    )),
    [wizard.steps],
  );

  const updateRecConfig = <K extends keyof WizardRecommendationConfig>(
    key: K,
    value: WizardRecommendationConfig[K]
  ) => {
    setRecommendationConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateRecommendedProduct = (categorySlug: string, productId: string) => {
    setRecommendationConfig((prev) => {
      const nextProductIds = { ...prev.recommendedProductIdsByCategorySlug };
      if (productId) {
        nextProductIds[categorySlug] = productId;
      } else {
        delete nextProductIds[categorySlug];
      }
      return {
        ...prev,
        recommendedProductIdsByCategorySlug: nextProductIds,
      };
    });
  };

  const solarPreview = getSolarSizingCalculation(5000, 70, recommendationConfig);
  const batteryHybridPreview = getBatterySizingCalculation(
    solarPreview.solarKwp,
    "hybrid",
    recommendationConfig
  );
  const batterySolarOnlyPreview = getBatterySizingCalculation(
    solarPreview.solarKwp,
    "roi_max",
    recommendationConfig
  );
  const batteryOffgridPreview = getBatterySizingCalculation(
    solarPreview.solarKwp,
    "offgrid",
    recommendationConfig
  );
  const updateFormula = (key: FormulaField, value: string) => {
    updateRecConfig(key, value);
  };

  const toggleStep = (index: number) => {
    setExpandedSteps(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleQuestion = (stepIndex: number, qIndex: number) => {
    const key = `${stepIndex}-${qIndex}`;
    setExpandedQuestions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!wizard.title || !wizard.slug) {
      toast.error("Title and Slug are required.");
      return;
    }

    startTransition(async () => {
      try {
        const fallbackRecommendationConfig = languageRecommendationConfigs[supportedLocales[0] ?? contentLocale];
        const result = await upsertWizard({
          ...wizard,
          recommendationConfig: JSON.parse(JSON.stringify({
            ...fallbackRecommendationConfig,
            localeConfigs: Object.fromEntries(
              supportedLocales.map((locale) => [locale, languageRecommendationConfigs[locale]]),
            ),
          })),
          rules,
        });
        if (result.success) {
          toast.success("Wizard saved successfully!");
          router.push("/admin/wizards");
        } else {
          toast.error(result.error || "Failed to save wizard.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save wizard.");
      }
    });
  };

  // --- Step Management ---
  const addStep = () => {
    const newSteps = [...(wizard.steps || [])];
    newSteps.push({
      id: `temp-${Date.now()}`,
      wizardId: wizard.id || "",
      order: newSteps.length,
      title: "New Step",
      description: "",
      translations: {},
      questions: [],
    });
    setWizard({ ...wizard, steps: newSteps });
    setExpandedSteps(prev => ({ ...prev, [newSteps.length - 1]: true }));
  };

  const updateStep = (index: number, field: StepField, value: string) => {
    const newSteps = [...(wizard.steps || [])];
    const current = newSteps[index];
    newSteps[index] = {
      ...current,
      ...(contentLocale === "th" ? { [field]: value } : {}),
      translations: {
        ...current.translations,
        [contentLocale]: { ...current.translations?.[contentLocale], [field]: value },
      },
    };
    setWizard({ ...wizard, steps: newSteps });
  };

  const removeStep = (index: number) => {
    const newSteps = [...(wizard.steps || [])];
    newSteps.splice(index, 1);
    // Update order
    newSteps.forEach((s, i) => s.order = i);
    setWizard({ ...wizard, steps: newSteps });
  };

  // --- Question Management ---
  const addQuestion = (stepIndex: number) => {
    const newSteps = [...(wizard.steps || [])];
    const step = newSteps[stepIndex];
    const newQuestions = [...(step.questions || [])];
    newQuestions.push({
      id: `temp-q-${Date.now()}`,
      stepId: step.id,
      order: newQuestions.length,
      type: "RADIO_CARD",
      questionText: "New Question",
      helperText: "",
      stateKey: "customKey",
      tooltipText: "",
      tooltipImageUrl: "",
      translations: {},
      options: [],
    });
    newSteps[stepIndex] = { ...step, questions: newQuestions };
    setWizard({ ...wizard, steps: newSteps });
    toggleQuestion(stepIndex, newQuestions.length - 1);
  };

  const updateQuestion = (
    stepIndex: number,
    qIndex: number,
    field: QuestionField,
    value: string
  ) => {
    const newSteps = [...(wizard.steps || [])];
    const step = newSteps[stepIndex];
    const newQuestions = [...(step.questions || [])];
    const current = newQuestions[qIndex];
    const isLocalizedField = field === "questionText" || field === "helperText" || field === "tooltipText";
    newQuestions[qIndex] = {
      ...current,
      ...(contentLocale === "th" || !isLocalizedField ? { [field]: value } : {}),
      ...(isLocalizedField ? { translations: {
        ...current.translations,
        [contentLocale]: { ...current.translations?.[contentLocale], [field]: value },
      } } : {}),
    };
    newSteps[stepIndex] = { ...step, questions: newQuestions };
    setWizard({ ...wizard, steps: newSteps });
  };

  const removeQuestion = (stepIndex: number, qIndex: number) => {
    const newSteps = [...(wizard.steps || [])];
    const step = newSteps[stepIndex];
    const newQuestions = [...(step.questions || [])];
    newQuestions.splice(qIndex, 1);
    newQuestions.forEach((q, i) => q.order = i);
    newSteps[stepIndex] = { ...step, questions: newQuestions };
    setWizard({ ...wizard, steps: newSteps });
  };

  // --- Option Management ---
  const addOption = (stepIndex: number, qIndex: number) => {
    const newSteps = [...(wizard.steps || [])];
    const step = newSteps[stepIndex];
    const newQuestions = [...(step.questions || [])];
    const question = newQuestions[qIndex];
    const newOptions = [...(question.options || [])];
    
    newOptions.push({
      id: `temp-o-${Date.now()}`,
      questionId: question.id,
      order: newOptions.length,
      label: "New Option",
      description: "",
      icon: "",
      value: "value",
      isRecommended: false,
      tooltipText: "",
      tooltipImageUrl: "",
      scoringImpacts: [],
      translations: {},
    });
    
    newQuestions[qIndex] = { ...question, options: newOptions };
    newSteps[stepIndex] = { ...step, questions: newQuestions };
    setWizard({ ...wizard, steps: newSteps });
  };

  const updateOption = (
    stepIndex: number,
    qIndex: number,
    oIndex: number,
    field: OptionField,
    value: string | boolean
  ) => {
    const newSteps = [...(wizard.steps || [])];
    const step = newSteps[stepIndex];
    const newQuestions = [...(step.questions || [])];
    const question = newQuestions[qIndex];
    const newOptions = [...(question.options || [])];
    
    const current = newOptions[oIndex];
    const isLocalizedField = field === "label" || field === "description" || field === "tooltipText";
    newOptions[oIndex] = {
      ...current,
      ...(contentLocale === "th" || !isLocalizedField ? { [field]: value } : {}),
      ...(isLocalizedField ? { translations: {
        ...current.translations,
        [contentLocale]: { ...current.translations?.[contentLocale], [field]: typeof value === "string" ? value : "" },
      } } : {}),
    };
    
    newQuestions[qIndex] = { ...question, options: newOptions };
    newSteps[stepIndex] = { ...step, questions: newQuestions };
    setWizard({ ...wizard, steps: newSteps });
  };

  const removeOption = (stepIndex: number, qIndex: number, oIndex: number) => {
    const newSteps = [...(wizard.steps || [])];
    const step = newSteps[stepIndex];
    const newQuestions = [...(step.questions || [])];
    const question = newQuestions[qIndex];
    const newOptions = [...(question.options || [])];
    
    newOptions.splice(oIndex, 1);
    newOptions.forEach((o, i) => o.order = i);
    
    newQuestions[qIndex] = { ...question, options: newOptions };
    newSteps[stepIndex] = { ...step, questions: newQuestions };
    setWizard({ ...wizard, steps: newSteps });
  };

  const updateScoringImpacts = (
    stepIndex: number,
    qIndex: number,
    oIndex: number,
    update: (impacts: WizardScoringImpact[]) => WizardScoringImpact[],
  ) => {
    const newSteps = [...(wizard.steps || [])];
    const step = newSteps[stepIndex];
    const newQuestions = [...step.questions];
    const question = newQuestions[qIndex];
    const newOptions = [...question.options];
    const option = newOptions[oIndex];
    newOptions[oIndex] = {
      ...option,
      scoringImpacts: update(option.scoringImpacts || []),
    };
    newQuestions[qIndex] = { ...question, options: newOptions };
    newSteps[stepIndex] = { ...step, questions: newQuestions };
    setWizard({ ...wizard, steps: newSteps });
  };

  const stepText = (step: WizardStepDraft, field: StepField) => step.translations?.[contentLocale]?.[field] ?? step[field] ?? "";
  const questionText = (question: WizardQuestionDraft, field: "questionText" | "helperText" | "tooltipText") => question.translations?.[contentLocale]?.[field] ?? question[field] ?? "";
  const optionText = (option: WizardOptionDraft, field: "label" | "description" | "tooltipText") => option.translations?.[contentLocale]?.[field] ?? option[field] ?? "";
  const wizardText = (field: "title" | "description") => wizard.translations?.[contentLocale]?.[field] ?? wizard[field] ?? "";
  const updateWizardText = (field: "title" | "description", value: string) => {
    setWizard({
      ...wizard,
      ...(contentLocale === "th" ? { [field]: value } : {}),
      translations: {
        ...wizard.translations,
        [contentLocale]: { ...wizard.translations?.[contentLocale], [field]: value },
      },
    });
  };

  const addScoringImpact = (stepIndex: number, qIndex: number, oIndex: number) => {
    const defaultTarget = brands[0] || recommendationCategories[0]?.slug || "";
    updateScoringImpacts(stepIndex, qIndex, oIndex, (impacts) => [
      ...impacts,
      { targetType: brands.length ? "BRAND" : "CATEGORY", target: defaultTarget, weight: 10 },
    ]);
  };

  const addRule = () => {
    setRules((current) => [
      ...current,
      {
        id: `temp-rule-${Date.now()}`,
        wizardId: wizard.id || "",
        ruleName: `Recommendation rule ${current.length + 1}`,
        isActive: true,
        conditions: [{ stateKey: stateKeys[0] || "monthlyBill", operator: "==", value: "" }],
        actions: [{ actionType: "BOOST_BRAND", target: brands[0] || "", weight: 20 }],
      },
    ]);
  };

  const updateRule = (ruleIndex: number, update: (rule: WizardRecommendationRule) => WizardRecommendationRule) => {
    setRules((current) => current.map((rule, index) => index === ruleIndex ? update(rule) : rule));
  };

  const toggleCategory = (slug: string) => {
    const selected = recommendationConfig.enabledCategorySlugs;
    updateRecConfig(
      "enabledCategorySlugs",
      selected.includes(slug)
        ? selected.filter((value) => value !== slug)
        : [...selected, slug],
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/wizards" className="p-2 hover:bg-[#0B1121] rounded-xl text-gray-400 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-100 flex items-center gap-2">
              <Settings2 className="w-6 h-6 text-[#B7D1EA]" />
              {initialData ? "Edit Wizard" : "Create Wizard"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
        <LocalizationApplyControl locale={contentLocale} onLocaleChange={setContentLocale} onApply={handleSave} isPending={isPending} label="Apply wizard preset" />
        </div>
      </div>

      {/* Basic Info */}
      <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] p-6 shadow-none">
        <h2 className="text-lg font-bold text-gray-100 mb-4">Wizard Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase">Title</label>
            <input
              type="text"
              value={wizardText("title")}
              onChange={(e) => updateWizardText("title", e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-medium text-gray-100"
              placeholder="e.g., Solar Engineering Wizard"
            />
            <LocalizedFieldMarker locale={contentLocale} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase">Slug (Unique ID)</label>
            <input
              type="text"
              value={wizard.slug || ""}
              onChange={(e) => setWizard({ ...wizard, slug: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono text-sm text-gray-100"
              placeholder="e.g., solar-wizard-v1"
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase">Description</label>
            <textarea
              value={wizardText("description")}
              onChange={(e) => updateWizardText("description", e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all text-sm text-gray-100 min-h-[80px] resize-y"
              placeholder="Brief description of what this wizard does..."
            />
            <LocalizedFieldMarker locale={contentLocale} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input
              type="checkbox"
              id="isActive"
              checked={wizard.isActive || false}
              onChange={(e) => setWizard({ ...wizard, isActive: e.target.checked })}
              className="w-5 h-5 rounded text-[#B7D1EA] focus:ring-[#B7D1EA] border-[#1E293B]"
            />
            <label htmlFor="isActive" className="text-sm font-bold text-gray-300 cursor-pointer">
              Active (Visible to users)
            </label>
          </div>
        </div>
      </div>

      {/* Summary recommendation algorithm */}
      <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] p-6 shadow-none space-y-4">
        <h2 className="text-lg font-bold text-gray-100">Summary Recommendation Engine</h2>
        <p className="text-xs text-gray-400 font-medium">
          Controls sizing formulas and which product categories appear on{" "}
          <code className="font-mono text-[#B7D1EA]">/wizard/summary</code>. Pair with product
          &quot;Use in recommendation&quot; flags in Admin → Products.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {RECOMMENDATION_FIELDS.map(({ key, label, step, help }) => (
            <div key={key} className="space-y-1">
              <FieldLabel label={label} help={help} />
              <input
                type="number"
                step={step}
                value={recommendationConfig[key]}
                onChange={(e) =>
                  updateRecConfig(key, parseFloat(e.target.value) || 0)
                }
                className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm font-mono"
              />
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#1E293B] bg-[#0B1121]/70 p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-gray-100">Formula Builder</h3>
              <p className="text-[11px] text-gray-400 font-semibold mt-1">
                Edit the expressions used by <code className="font-mono">/wizard/summary</code>.
                Use arithmetic operators and supported functions only.
              </p>
            </div>
            <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-right">
              <p className="text-[9px] font-black uppercase tracking-wider text-gray-500">
                Preview
              </p>
              <p className="text-xs font-black text-gray-100">
                {solarPreview.solarKwp.toFixed(2)} kWp · {batteryHybridPreview.batteryKwh.toFixed(1)} kWh
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FormulaEditor
              label="Solar sizing formula"
              help="กำหนดสูตรคำนวณ kWp จากคำตอบของลูกค้า ผลลัพธ์จะถูกจำกัดด้วย Min และ Max kWp"
              value={recommendationConfig.solarFormula}
              onChange={(value) => updateFormula("solarFormula", value)}
              variables={SOLAR_FORMULA_VARIABLES}
              result={solarPreview.formulaError ? solarPreview.formulaError : solarPreview.substitutedFormula}
              hasError={Boolean(solarPreview.formulaError)}
            />
            <FormulaEditor
              label="Battery formula: solar-only"
              help="กำหนดความจุแบตเตอรี่สำหรับลูกค้าที่เน้นคืนทุนและไม่ต้องการสำรองไฟ"
              value={recommendationConfig.batteryFormulaSolarOnly}
              onChange={(value) => updateFormula("batteryFormulaSolarOnly", value)}
              variables={BATTERY_FORMULA_VARIABLES}
              result={batterySolarOnlyPreview.formulaError ? batterySolarOnlyPreview.formulaError : batterySolarOnlyPreview.substitutedFormula}
              hasError={Boolean(batterySolarOnlyPreview.formulaError)}
            />
            <FormulaEditor
              label="Battery formula: hybrid"
              help="กำหนดความจุแบตเตอรี่สำหรับระบบ Hybrid โดยอ้างอิง solarKwp และ hybridBatteryRatio"
              value={recommendationConfig.batteryFormulaHybrid}
              onChange={(value) => updateFormula("batteryFormulaHybrid", value)}
              variables={BATTERY_FORMULA_VARIABLES}
              result={batteryHybridPreview.formulaError ? batteryHybridPreview.formulaError : batteryHybridPreview.substitutedFormula}
              hasError={Boolean(batteryHybridPreview.formulaError)}
            />
            <FormulaEditor
              label="Battery formula: off-grid"
              help="กำหนดความจุแบตเตอรี่สำหรับระบบ Off-grid โดยอ้างอิง solarKwp และ offgridBatteryRatio"
              value={recommendationConfig.batteryFormulaOffgrid}
              onChange={(value) => updateFormula("batteryFormulaOffgrid", value)}
              variables={BATTERY_FORMULA_VARIABLES}
              result={batteryOffgridPreview.formulaError ? batteryOffgridPreview.formulaError : batteryOffgridPreview.substitutedFormula}
              hasError={Boolean(batteryOffgridPreview.formulaError)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FORMULA_FUNCTIONS.map((fn) => (
              <span
                key={fn}
                className="rounded-full border border-[#1E293B] bg-[#0F172A] px-2.5 py-1 text-[10px] font-mono font-bold text-gray-400"
              >
                {fn}
              </span>
            ))}
          </div>
        </div>

        {/* Central Add-ons Catalog integration */}
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 flex flex-wrap items-center justify-between gap-3 text-sky-200">
          <div>
            <h3 className="text-sm font-black text-white">Central Add-ons Catalog Integration</h3>
            <p className="text-xs text-gray-300 font-semibold mt-0.5">
              Wizard summary add-ons are unified with the central Add-ons Catalog. All prices, descriptions, and choices update dynamically.
            </p>
          </div>
          <Link
            href="/admin/settings/addons"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#B7D1EA] hover:bg-[#99BFE3] px-3.5 py-2 text-xs font-black text-[#0F172A] shadow-xs transition"
          >
            Manage Add-ons Catalog
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2">
          <FieldLabel
            label="Enabled BOM Categories"
            help="เฉพาะหมวดที่เลือกจะถูกนำไปสร้างรายการสินค้าในหน้าสรุป ลูกค้าไม่สามารถได้รับสินค้าจากหมวดที่ปิดไว้"
          />
          <Popover open={categorySelectOpen} onOpenChange={setCategorySelectOpen}>
            <div className="relative">
              <PopoverTrigger
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-left transition-colors hover:border-[#B7D1EA]/60"
              >
                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {recommendationConfig.enabledCategorySlugs.length ? (
                    recommendationConfig.enabledCategorySlugs.map((slug) => {
                      const category = recommendationCategories.find((item) => item.slug === slug);
                      return (
                        <span key={slug} className="inline-flex items-center gap-1 rounded-md bg-[#0B1121] px-2 py-1 text-xs font-bold text-gray-300">
                          {category?.name || slug}
                          <X
                            className="h-3 w-3 text-gray-500 hover:text-gray-300"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleCategory(slug);
                            }}
                          />
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-sm text-gray-400">Select product categories</span>
                  )}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-500" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(560px,calc(100vw-3rem))] rounded-lg border-[#1E293B] bg-[#0F172A] p-2">
                <div className="max-h-72 overflow-y-auto">
                  {recommendationCategories.map((category) => {
                    const selected = recommendationConfig.enabledCategorySlugs.includes(category.slug);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleCategory(category.slug)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#0B1121]"
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-[#B7D1EA] bg-[#B7D1EA] text-white" : "border-[#1E293B] bg-[#0F172A]"}`}>
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-gray-100">{category.name}</span>
                          <span className="block text-xs font-mono text-gray-500">{category.slug}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </div>
          </Popover>
        </div>

        <div className="space-y-3 rounded-xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-gray-100">
                Recommended Products on Summary
              </h3>
              <p className="text-[11px] text-gray-400 font-semibold mt-1">
                Choose a preferred product for each enabled BOM category. Leave Auto to use
                tier and priority rules from Admin → Products.
              </p>
            </div>
            <span className="rounded-full bg-[#0F172A] border border-[#1E293B] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gray-400">
              /wizard/summary
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {recommendationCategories
              .filter(
                (category) =>
                  recommendationConfig.enabledCategorySlugs.length === 0 ||
                  recommendationConfig.enabledCategorySlugs.includes(category.slug)
              )
              .map((category) => {
                const selectedProductId =
                  recommendationConfig.recommendedProductIdsByCategorySlug[category.slug] ?? "";
                const eligibleProducts = category.products.filter(
                  (product) => product.useInRecommendation !== false
                );

                return (
                  <div
                    key={category.id}
                    className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(260px,1.5fr)] gap-3 items-center rounded-lg border border-[#1E293B] bg-[#0F172A] p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black text-gray-100 truncate">
                        {category.name}
                      </p>
                      <p className="text-[10px] font-mono text-gray-500">
                        {category.slug} · {eligibleProducts.length} eligible products
                      </p>
                    </div>
                    <select
                      value={selectedProductId}
                      onChange={(e) =>
                        updateRecommendedProduct(category.slug, e.target.value)
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-xs font-semibold bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
                    >
                      <option value="">Auto by tier and priority</option>
                      {eligibleProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {formatPrice(product.price)} ·{" "}
                          {product.recommendTier ?? "standard"} · priority{" "}
                          {product.recommendPriority}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            {recommendationCategories.filter(
              (category) =>
                recommendationConfig.enabledCategorySlugs.length === 0 ||
                recommendationConfig.enabledCategorySlugs.includes(category.slug)
            ).length === 0 && (
              <div className="rounded-lg border border-dashed border-[#1E293B] bg-[#0F172A] p-4 text-center text-xs font-semibold text-gray-500">
                No matching categories. Check enabled category slugs above.
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRecommendationConfig({ ...DEFAULT_WIZARD_RECOMMENDATION_CONFIG })}
          className="text-xs font-bold text-gray-400 hover:text-[#B7D1EA]"
        >
          Reset to defaults
        </button>
      </div>

      {/* Steps Editor */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-100">Wizard Steps</h2>
          <button
            onClick={addStep}
            className="text-sm font-bold text-[#B7D1EA] hover:bg-[#B7D1EA]/10 px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Step
          </button>
        </div>

        {(wizard.steps || []).map((step: WizardStepDraft, sIndex: number) => {
          const isExpanded = expandedSteps[sIndex];

          return (
            <div key={step.id} className="bg-[#0F172A] rounded-2xl border border-[#1E293B] shadow-none overflow-hidden transition-all">
              {/* Step Header */}
              <div 
                className="flex items-center justify-between px-6 py-4 bg-[#0B1121] cursor-pointer hover:bg-[#0B1121] transition-colors"
                onClick={() => toggleStep(sIndex)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1E293B] text-gray-400 font-bold text-sm">
                    {sIndex + 1}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-100">{step.title || "Untitled Step"}</h3>
                    <p className="text-xs text-gray-400">{step.questions?.length || 0} Questions</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStep(sIndex); }}
                    className="p-2 text-gray-500 hover:text-rose-500 hover:bg-[#0F172A] rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </div>
              </div>

              {/* Step Content */}
              {isExpanded && (
                <div className="p-6 border-t border-[#1E293B] space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Step Title</label>
                      <input
                        type="text"
                        value={stepText(step, "title")}
                        onChange={(e) => updateStep(sIndex, "title", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Step Description (Optional)</label>
                      <input
                        type="text"
                        value={stepText(step, "description")}
                        onChange={(e) => updateStep(sIndex, "description", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
                      />
                    </div>
                  </div>

                  {/* Questions List */}
                  <div className="pl-4 border-l-2 border-[#1E293B] space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-gray-300">Questions in Step</h4>
                      <button
                        onClick={() => addQuestion(sIndex)}
                        className="text-xs font-bold text-gray-400 hover:text-[#B7D1EA] bg-[#0B1121] hover:bg-[#B7D1EA]/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Question
                      </button>
                    </div>

                    {(step.questions || []).map((q: WizardQuestionDraft, qIndex: number) => {
                      const isQExpanded = expandedQuestions[`${sIndex}-${qIndex}`];
                      return (
                        <div key={q.id} className="bg-[#0B1121] rounded-xl border border-[#1E293B]">
                          {/* Question Header */}
                          <div 
                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#0B1121]/60 transition-colors rounded-t-xl"
                            onClick={() => toggleQuestion(sIndex, qIndex)}
                          >
                            <div className="flex items-center gap-3">
                              <GripVertical className="w-4 h-4 text-slate-300" />
                              <div className="flex items-center gap-2">
                                {q.type === "RADIO_CARD" && <LayoutTemplate className="w-4 h-4 text-emerald-500" />}
                                {q.type === "TOGGLE" && <ToggleLeft className="w-4 h-4 text-amber-500" />}
                                {q.type === "SLIDER" && <SlidersHorizontal className="w-4 h-4 text-blue-500" />}
                                <span className="font-semibold text-sm text-gray-100">{questionText(q, "questionText") || "Untitled Question"}</span>
                              </div>
                              <span className="px-2 py-0.5 bg-[#0F172A] border border-[#1E293B] rounded text-[9px] font-mono font-bold text-gray-400">
                                {q.stateKey}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); removeQuestion(sIndex, qIndex); }}
                                className="p-1.5 text-gray-500 hover:text-rose-500 hover:bg-[#0F172A] rounded-md transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              {isQExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                            </div>
                          </div>

                          {/* Question Editor */}
                          {isQExpanded && (
                            <div className="p-4 border-t border-[#1E293B] space-y-4 bg-[#0F172A] rounded-b-xl">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5 md:col-span-2">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">Question Text</label>
                                  <input
                                    type="text"
                                    value={questionText(q, "questionText")}
                                    onChange={(e) => updateQuestion(sIndex, qIndex, "questionText", e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">Input Type</label>
                                  <select
                                    value={q.type}
                                    onChange={(e) => updateQuestion(sIndex, qIndex, "type", e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
                                  >
                                    <option value="RADIO_CARD">Radio Cards (Grid)</option>
                                    <option value="TOGGLE">Toggle/Switch</option>
                                    <option value="SLIDER">Slider</option>
                                  </select>
                                </div>
                                <div className="space-y-1.5 md:col-span-2">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">Helper Text</label>
                                  <input
                                    type="text"
                                    value={questionText(q, "helperText")}
                                    onChange={(e) => updateQuestion(sIndex, qIndex, "helperText", e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
                                    placeholder="Optional hint below question..."
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center justify-between">
                                    <span>Zustand State Key</span>
                                    <span className="text-[8px] text-orange-500">Critical</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={q.stateKey}
                                    onChange={(e) => updateQuestion(sIndex, qIndex, "stateKey", e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-orange-200 bg-orange-50/30 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                                    placeholder="e.g., roofType"
                                  />
                                </div>
                                <div className="space-y-1.5 md:col-span-2">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">{t("fields.tooltipContextText")}</label>
                                  <textarea
                                    value={questionText(q, "tooltipText")}
                                    onChange={(e) => updateQuestion(sIndex, qIndex, "tooltipText", e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] min-h-[60px] resize-y"
                                    placeholder={t("placeholders.questionTooltipText")}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase">{t("fields.contextImageUrl")}</label>
                                  <input
                                    type="text"
                                    value={q.tooltipImageUrl || ""}
                                    onChange={(e) => updateQuestion(sIndex, qIndex, "tooltipImageUrl", e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-[#1E293B] text-sm focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
                                    placeholder={t("placeholders.questionTooltipImage")}
                                  />
                                </div>
                              </div>

                              {/* Options */}
                              <div className="pt-2">
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="text-xs font-bold text-gray-400">Answer Options</h5>
                                  <button
                                    onClick={() => addOption(sIndex, qIndex)}
                                    className="text-[10px] font-bold text-gray-400 hover:text-[#B7D1EA] bg-[#0B1121] hover:bg-[#B7D1EA]/10 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Add Option
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  {(q.options || []).map((opt: WizardOptionDraft, oIndex: number) => (
                                    <div key={opt.id} className="flex flex-col gap-3 bg-[#0B1121] p-3 rounded-lg border border-[#1E293B] group">
                                      <div className="flex items-start gap-2">
                                        <div className="flex-1 grid grid-cols-12 gap-2">
                                          <div className="col-span-3">
                                            <label className="text-[8px] font-bold text-gray-500 uppercase">{t("fields.label")}</label>
                                            <input
                                              type="text"
                                              value={optionText(opt, "label")}
                                              onChange={(e) => updateOption(sIndex, qIndex, oIndex, "label", e.target.value)}
                                              placeholder="Label"
                                              className="w-full px-2 py-1.5 rounded-md border border-[#1E293B] text-xs focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA]/20 outline-none"
                                            />
                                          </div>
                                          <div className="col-span-3">
                                            <label className="text-[8px] font-bold text-gray-500 uppercase">{t("fields.value")}</label>
                                            <input
                                              type="text"
                                              value={opt.value}
                                              onChange={(e) => updateOption(sIndex, qIndex, oIndex, "value", e.target.value)}
                                              placeholder="State Value"
                                              className="w-full px-2 py-1.5 rounded-md border border-[#1E293B] text-xs font-mono bg-[#0F172A] focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 outline-none"
                                            />
                                          </div>
                                          <div className="col-span-4">
                                            <label className="text-[8px] font-bold text-gray-500 uppercase">{t("fields.description")}</label>
                                            <input
                                              type="text"
                                              value={optionText(opt, "description")}
                                              onChange={(e) => updateOption(sIndex, qIndex, oIndex, "description", e.target.value)}
                                              placeholder="Description (Optional)"
                                              className="w-full px-2 py-1.5 rounded-md border border-[#1E293B] text-xs focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA]/20 outline-none"
                                            />
                                          </div>
                                          <div className="col-span-2">
                                            <label className="text-[8px] font-bold text-gray-500 uppercase">{t("fields.icon")}</label>
                                            <input
                                              type="text"
                                              value={opt.icon || ""}
                                              onChange={(e) => updateOption(sIndex, qIndex, oIndex, "icon", e.target.value)}
                                              placeholder="Icon Name"
                                              className="w-full px-2 py-1.5 rounded-md border border-[#1E293B] text-xs focus:border-[#B7D1EA] focus:ring-1 focus:ring-[#B7D1EA]/20 outline-none"
                                            />
                                          </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5 items-center shrink-0 w-8 pt-4">
                                          <label className="flex flex-col items-center cursor-pointer" title="Recommended Option">
                                            <span className="text-[8px] text-gray-500 uppercase mb-0.5">Rec</span>
                                            <input
                                              type="checkbox"
                                              checked={opt.isRecommended}
                                              onChange={(e) => updateOption(sIndex, qIndex, oIndex, "isRecommended", e.target.checked)}
                                              className="w-3.5 h-3.5 rounded text-emerald-500 focus:ring-emerald-500 border-[#1E293B]"
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeOption(sIndex, qIndex, oIndex); }}
                                            className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                      
                                      {/* Educational Tooltip Config */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-[#1E293B] pt-2 bg-[#0F172A]/50 p-2 rounded-md">
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-bold text-gray-400 uppercase">{t("fields.tooltipContextText")}</label>
                                          <textarea
                                            value={optionText(opt, "tooltipText")}
                                            onChange={(e) => updateOption(sIndex, qIndex, oIndex, "tooltipText", e.target.value)}
                                            placeholder={t("placeholders.optionTooltipText")}
                                            className="w-full px-2 py-1 rounded-md border border-[#1E293B] text-[11px] focus:border-[#B7D1EA] outline-none min-h-[40px] resize-y"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-bold text-gray-400 uppercase">{t("fields.contextImageUrl")}</label>
                                          <input
                                            type="text"
                                            value={opt.tooltipImageUrl || ""}
                                            onChange={(e) => updateOption(sIndex, qIndex, oIndex, "tooltipImageUrl", e.target.value)}
                                            placeholder={t("placeholders.optionTooltipImage")}
                                            className="w-full px-2 py-1.5 rounded-md border border-[#1E293B] text-[11px] focus:border-[#B7D1EA] outline-none"
                                          />
                                        </div>
                                      </div>

                                      <div className="border-t border-[#1E293B] pt-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const key = `${sIndex}-${qIndex}-${oIndex}`;
                                            setExpandedScoring((current) => ({ ...current, [key]: !current[key] }));
                                          }}
                                          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#0B1121]"
                                        >
                                          <span className="flex items-center gap-2 text-xs font-bold text-gray-300">
                                            <Scale className="h-4 w-4 text-[#99BFE3]" />
                                            ผลกระทบต่อการแนะนำสินค้า (Scoring Impact)
                                            <span className="rounded-md bg-[#1E293B] px-1.5 py-0.5 text-[10px] text-gray-400">
                                              {opt.scoringImpacts?.length || 0}
                                            </span>
                                          </span>
                                          {expandedScoring[`${sIndex}-${qIndex}-${oIndex}`]
                                            ? <ChevronUp className="h-4 w-4 text-gray-500" />
                                            : <ChevronDown className="h-4 w-4 text-gray-500" />}
                                        </button>

                                        {expandedScoring[`${sIndex}-${qIndex}-${oIndex}`] && (
                                          <div className="mt-2 space-y-2 rounded-lg bg-[#0F172A] p-3">
                                            {(opt.scoringImpacts || []).map((impact, impactIndex) => {
                                              const targetOptions = impact.targetType === "BRAND"
                                                ? brands.map((brand) => ({ value: brand, label: brand }))
                                                : recommendationCategories.map((category) => ({ value: category.slug, label: category.name }));
                                              return (
                                                <div key={`${impact.targetType}-${impactIndex}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_minmax(0,1fr)_110px_36px]">
                                                  <select
                                                    value={impact.targetType}
                                                    onChange={(event) => updateScoringImpacts(sIndex, qIndex, oIndex, (impacts) =>
                                                      impacts.map((item, index) => index === impactIndex
                                                        ? {
                                                            ...item,
                                                            targetType: event.target.value as WizardScoringImpact["targetType"],
                                                            target: event.target.value === "BRAND"
                                                              ? brands[0] || ""
                                                              : recommendationCategories[0]?.slug || "",
                                                          }
                                                        : item),
                                                    )}
                                                    className="rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs font-bold text-gray-300"
                                                  >
                                                    <option value="BRAND">Brand</option>
                                                    <option value="CATEGORY">Product Type</option>
                                                  </select>
                                                  <select
                                                    value={impact.target}
                                                    onChange={(event) => updateScoringImpacts(sIndex, qIndex, oIndex, (impacts) =>
                                                      impacts.map((item, index) => index === impactIndex ? { ...item, target: event.target.value } : item),
                                                    )}
                                                    className="min-w-0 rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs text-gray-300"
                                                  >
                                                    {targetOptions.map((target) => (
                                                      <option key={target.value} value={target.value}>{target.label}</option>
                                                    ))}
                                                  </select>
                                                  <input
                                                    type="number"
                                                    value={impact.weight}
                                                    onChange={(event) => updateScoringImpacts(sIndex, qIndex, oIndex, (impacts) =>
                                                      impacts.map((item, index) => index === impactIndex ? { ...item, weight: Number(event.target.value) } : item),
                                                    )}
                                                    className="rounded-lg border border-[#1E293B] px-2.5 py-2 text-xs font-mono"
                                                    aria-label="Weight score"
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => updateScoringImpacts(sIndex, qIndex, oIndex, (impacts) => impacts.filter((_, index) => index !== impactIndex))}
                                                    className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#0B1121] hover:text-rose-700"
                                                    aria-label="Remove scoring impact"
                                                  >
                                                    <Trash2 className="h-4 w-4" />
                                                  </button>
                                                </div>
                                              );
                                            })}
                                            <button
                                              type="button"
                                              onClick={() => addScoringImpact(sIndex, qIndex, oIndex)}
                                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] px-3 py-2 text-xs font-bold text-gray-400 transition-colors hover:bg-[#0B1121]"
                                            >
                                              <Plus className="h-3.5 w-3.5" />
                                              Add scoring impact
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {q.options?.length === 0 && (
                                    <div className="text-[10px] text-gray-500 font-semibold italic p-2 text-center bg-[#0B1121] border border-dashed border-[#1E293B] rounded-lg">
                                      No options defined. Users cannot answer this question.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {(wizard.steps?.length === 0) && (
          <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-[#1E293B] rounded-2xl bg-[#0B1121]">
            <h3 className="text-sm font-bold text-gray-400 mb-1">No Steps Yet</h3>
            <p className="text-gray-500 text-xs mb-4">Add your first step to start building the wizard.</p>
            <button
              onClick={addStep}
              className="bg-[#0F172A] text-gray-300 hover:text-[#B7D1EA] px-4 py-2 rounded-xl font-bold flex items-center gap-2 border border-[#1E293B] shadow-none transition-all text-sm"
            >
              <Plus className="w-4 h-4" />
              Add First Step
            </button>
          </div>
        )}
      </div>

      <section className="space-y-5 rounded-xl border border-[#1E293B] bg-[#0F172A] p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-[#1E293B] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <h2 className="flex items-center gap-2 text-lg font-black text-gray-100">
              <BrainCircuit className="h-5 w-5 text-[#99BFE3]" />
              กฎการแนะนำสินค้าขั้นสูง
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              ระบบจะนำสินค้าทุกชิ้นที่เข้าเกณฑ์ kWp มาให้คะแนน สินค้าหรือแบรนด์ที่มีคะแนนรวมสูงสุดจากคำตอบและกฎที่ตั้งไว้จะถูกแสดงเป็นสินค้าแนะนำ (Best Match)
            </p>
          </div>
          <button
            type="button"
            onClick={addRule}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#2C486A] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#243d5b]"
          >
            <Plus className="h-4 w-4" />
            Add rule
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="rounded-lg bg-[#0B1121] px-6 py-10 text-center">
            <BrainCircuit className="mx-auto h-7 w-7 text-gray-500" />
            <p className="mt-2 text-sm font-bold text-gray-300">No advanced rules configured</p>
            <p className="mt-1 text-xs text-gray-400">Products will continue using recommendation priority and answer-level scoring.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rules.map((rule, ruleIndex) => (
              <div key={rule.id} className="rounded-lg border border-[#1E293B] bg-[#0B1121]/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={rule.ruleName}
                    onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, ruleName: event.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-sm font-bold text-gray-100"
                    aria-label="Rule name"
                  />
                  <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-gray-400">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-[#1E293B] text-[#B7D1EA]"
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() => setRules((current) => current.filter((_, index) => index !== ruleIndex))}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#0B1121] hover:text-rose-700"
                    aria-label="Delete rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <RuleGroup
                    title="IF conditions"
                    items={rule.conditions}
                    emptyText="Add at least one condition"
                    onAdd={() => updateRule(ruleIndex, (current) => ({
                      ...current,
                      conditions: [...current.conditions, { stateKey: stateKeys[0] || "monthlyBill", operator: "==", value: "" }],
                    }))}
                  >
                    {rule.conditions.map((condition, conditionIndex) => (
                      <ConditionRow
                        key={`${condition.stateKey}-${conditionIndex}`}
                        condition={condition}
                        stateKeys={stateKeys}
                        onChange={(next) => updateRule(ruleIndex, (current) => ({
                          ...current,
                          conditions: current.conditions.map((item, index) => index === conditionIndex ? next : item),
                        }))}
                        onRemove={() => updateRule(ruleIndex, (current) => ({
                          ...current,
                          conditions: current.conditions.filter((_, index) => index !== conditionIndex),
                        }))}
                      />
                    ))}
                  </RuleGroup>

                  <RuleGroup
                    title="THEN actions"
                    items={rule.actions}
                    emptyText="Add at least one action"
                    onAdd={() => updateRule(ruleIndex, (current) => ({
                      ...current,
                      actions: [...current.actions, { actionType: "BOOST_BRAND", target: brands[0] || "", weight: 20 }],
                    }))}
                  >
                    {rule.actions.map((action, actionIndex) => (
                      <ActionRow
                        key={`${action.actionType}-${actionIndex}`}
                        action={action}
                        brands={brands}
                        categories={recommendationCategories}
                        products={products}
                        onChange={(next) => updateRule(ruleIndex, (current) => ({
                          ...current,
                          actions: current.actions.map((item, index) => index === actionIndex ? next : item),
                        }))}
                        onRemove={() => updateRule(ruleIndex, (current) => ({
                          ...current,
                          actions: current.actions.filter((_, index) => index !== actionIndex),
                        }))}
                      />
                    ))}
                  </RuleGroup>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FormulaEditor({
  label,
  help,
  value,
  onChange,
  variables,
  result,
  hasError = false,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  result: string;
  hasError?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] p-3 space-y-2">
      <FieldLabel label={label} help={help} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        className={`w-full px-3 py-2 rounded-lg border text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 ${
          hasError
            ? "border-rose-200 bg-rose-500/10/40 focus:ring-rose-500/20 focus:border-rose-500"
            : "border-[#1E293B] focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA]"
        }`}
      />
      <div className="flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => onChange(`${value}${value.trim() ? " " : ""}${variable}`)}
            className="rounded-md border border-[#1E293B] bg-[#0B1121] px-2 py-1 text-[9px] font-mono font-bold text-gray-400 hover:border-[#B7D1EA]/40 hover:text-[#99BFE3]"
          >
            {variable}
          </button>
        ))}
      </div>
      <p
        className={`rounded-md px-2 py-1.5 text-[10px] font-mono font-semibold ${
          hasError
            ? "bg-rose-500/10 text-rose-600"
            : "bg-[#0B1121] text-gray-400"
        }`}
      >
        {result}
      </p>
    </div>
  );
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-[10px] font-bold uppercase text-gray-400">{label}</label>
      <Tooltip content={help} wrapperClassName="h-auto w-auto">
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-[#0B1121] hover:text-gray-300"
          aria-label={`About ${label}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}

function RuleGroup({
  title,
  items,
  emptyText,
  onAdd,
  children,
}: {
  title: string;
  items: unknown[];
  emptyText: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-black text-gray-100">{title}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-[#157f7f] transition-colors hover:bg-[#B7D1EA]/10"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
      <div className="space-y-2">
        {items.length ? children : (
          <p className="rounded-lg bg-[#0B1121] px-3 py-4 text-center text-xs font-medium text-gray-400">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  stateKeys,
  onChange,
  onRemove,
}: {
  condition: WizardRuleCondition;
  stateKeys: string[];
  onChange: (condition: WizardRuleCondition) => void;
  onRemove: () => void;
}) {
  const availableStateKeys = stateKeys.includes(condition.stateKey)
    ? stateKeys
    : [condition.stateKey, ...stateKeys].filter(Boolean);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_82px_minmax(0,1fr)_36px]">
      <select
        value={condition.stateKey}
        onChange={(event) => onChange({ ...condition, stateKey: event.target.value })}
        className="min-w-0 rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs font-mono"
      >
        {availableStateKeys.map((stateKey) => <option key={stateKey} value={stateKey}>{stateKey}</option>)}
      </select>
      <select
        value={condition.operator}
        onChange={(event) => onChange({ ...condition, operator: event.target.value as WizardRuleCondition["operator"] })}
        className="rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs font-bold"
      >
        {["==", "!=", "<=", ">=", "<", ">"].map((operator) => <option key={operator} value={operator}>{operator}</option>)}
      </select>
      <input
        type="text"
        value={String(condition.value)}
        onChange={(event) => onChange({ ...condition, value: event.target.value })}
        className="min-w-0 rounded-lg border border-[#1E293B] px-2.5 py-2 text-xs font-mono"
        placeholder="Value"
      />
      <IconDeleteButton label="Remove condition" onClick={onRemove} />
    </div>
  );
}

function ActionRow({
  action,
  brands,
  categories,
  products,
  onChange,
  onRemove,
}: {
  action: WizardRuleAction;
  brands: string[];
  categories: RecommendCategory[];
  products: RecommendCategory["products"];
  onChange: (action: WizardRuleAction) => void;
  onRemove: () => void;
}) {
  const targets = action.actionType === "BOOST_BRAND"
    ? brands.map((brand) => ({ value: brand, label: brand }))
    : action.actionType === "BOOST_CATEGORY"
      ? categories.map((category) => ({ value: category.slug, label: category.name }))
      : products.map((product) => ({ value: product.id, label: product.name }));

  const changeActionType = (actionType: WizardRuleAction["actionType"]) => {
    const nextTargets = actionType === "BOOST_BRAND"
      ? brands
      : actionType === "BOOST_CATEGORY"
        ? categories.map((category) => category.slug)
        : products.map((product) => product.id);
    onChange({
      ...action,
      actionType,
      target: nextTargets[0] || "",
      weight: actionType === "REQUIRE_PRODUCT" ? 0 : action.weight || 20,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_minmax(0,1fr)_96px_36px]">
      <select
        value={action.actionType}
        onChange={(event) => changeActionType(event.target.value as WizardRuleAction["actionType"])}
        className="rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs font-bold"
      >
        <option value="BOOST_BRAND">Boost brand</option>
        <option value="BOOST_CATEGORY">Boost product type</option>
        <option value="REQUIRE_PRODUCT">Require product</option>
      </select>
      <select
        value={action.target}
        onChange={(event) => onChange({ ...action, target: event.target.value })}
        className="min-w-0 rounded-lg border border-[#1E293B] bg-[#0F172A] px-2.5 py-2 text-xs"
      >
        {targets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
      </select>
      <input
        type="number"
        value={action.weight}
        onChange={(event) => onChange({ ...action, weight: Number(event.target.value) })}
        disabled={action.actionType === "REQUIRE_PRODUCT"}
        className="rounded-lg border border-[#1E293B] px-2.5 py-2 text-xs font-mono disabled:bg-[#0B1121] disabled:text-gray-500"
        aria-label="Action weight"
      />
      <IconDeleteButton label="Remove action" onClick={onRemove} />
    </div>
  );
}

function IconDeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#0B1121] hover:text-rose-700"
      aria-label={label}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
