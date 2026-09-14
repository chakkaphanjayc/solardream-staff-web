"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileSignature,
  GripVertical,
  ListChecks,
  Plus,
  Save,
  TextCursorInput,
  Trash2,
  Workflow,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { ContentLocaleTabs } from "@/components/admin/ContentLocaleTabs";
import type { LocalizedContent } from "@/lib/localization/content";
import type { Locale } from "@/i18n/locales";

import {
  saveWorkflowTemplate,
  updateWorkflowStages,
} from "@/app/actions/workflows";
import {
  jobTypes,
  type JobType,
  type WorkflowFieldType,
  type WorkflowFormField,
  type WorkflowStageInput,
} from "@/lib/workflow-types";

type Template = {
  id: string;
  name: string;
  description: string | null;
  targetJobType: JobType;
  isActive: boolean;
  translations: LocalizedContent<{ name: string; description: string | null }>;
  stages: Array<{
    id: string;
    stageName: string;
    stepOrder: number;
    isMandatory: boolean;
    formSchema: unknown;
    translations: LocalizedContent<{ stageName: string }>;
  }>;
};

type LocalizedStage = WorkflowStageInput & {
  translations?: LocalizedContent<{ stageName: string }>;
};

const FIELD_OPTIONS: Array<{
  type: WorkflowFieldType;
  label: string;
  icon: typeof CheckSquare;
}> = [
  { type: "CHECKBOX", label: "Checklist", icon: CheckSquare },
  { type: "TEXT_INPUT", label: "Text input", icon: TextCursorInput },
  { type: "PHOTO_UPLOAD", label: "Photo", icon: Camera },
  { type: "SIGNATURE", label: "Signature", icon: FileSignature },
];

function parseFields(value: unknown): WorkflowFormField[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (field): field is WorkflowFormField =>
      Boolean(
        field &&
          typeof field === "object" &&
          "id" in field &&
          "label" in field &&
          "type" in field &&
          "isRequired" in field,
      ),
  );
}

function createField(type: WorkflowFieldType): WorkflowFormField {
  const option = FIELD_OPTIONS.find((item) => item.type === type);
  return {
    id: crypto.randomUUID(),
    label: option?.label || "New field",
    type,
    isRequired: true,
  };
}

function createStage(): WorkflowStageInput {
  return {
    stageName: "New installation stage",
    isMandatory: true,
    formSchema: [],
  };
}

export default function WorkflowBuilderClient({
  initialTemplates,
}: {
  initialTemplates: Template[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [templates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(initialTemplates[0]?.id || "");
  const [name, setName] = useState(initialTemplates[0]?.name || "");
  const [description, setDescription] = useState(initialTemplates[0]?.description || "");
  const [targetJobType, setTargetJobType] = useState<JobType>(
    initialTemplates[0]?.targetJobType || "INSTALLATION",
  );
  const [isActive, setIsActive] = useState(initialTemplates[0]?.isActive ?? true);
  const [contentLocale, setContentLocale] = useState<Locale>("th");
  const [templateTranslations, setTemplateTranslations] = useState<LocalizedContent<{ name: string; description: string | null }>>(initialTemplates[0]?.translations || {});
  const [stages, setStages] = useState<LocalizedStage[]>(
    initialTemplates[0]?.stages.map((stage) => ({
      id: stage.id,
      stageName: stage.stageName,
      isMandatory: stage.isMandatory,
      formSchema: parseFields(stage.formSchema),
      translations: stage.translations || {},
    })) || [],
  );
  const [expandedStage, setExpandedStage] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [selectedId, templates],
  );

  const loadTemplate = (template: Template) => {
    setSelectedId(template.id);
    setName(template.name);
    setDescription(template.description || "");
    setTemplateTranslations(template.translations || {});
    setTargetJobType(template.targetJobType);
    setIsActive(template.isActive);
    setStages(
      [...template.stages]
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((stage) => ({
          id: stage.id,
          stageName: stage.stageName,
          isMandatory: stage.isMandatory,
          formSchema: parseFields(stage.formSchema),
          translations: stage.translations || {},
        })),
    );
    setExpandedStage(0);
  };

  const startNewTemplate = () => {
    setSelectedId("");
    setName("");
    setDescription("");
    setTemplateTranslations({});
    setTargetJobType("INSTALLATION");
    setIsActive(true);
    setStages([createStage()]);
    setExpandedStage(0);
  };

  const updateStage = (index: number, patch: Partial<LocalizedStage>) => {
    setStages((current) =>
      current.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    );
  };

  const translatedTemplateName = templateTranslations[contentLocale]?.name ?? name;
  const translatedTemplateDescription = templateTranslations[contentLocale]?.description ?? description;
  const updateTemplateTranslation = (field: "name" | "description", value: string) => {
    setTemplateTranslations((current) => ({
      ...current,
      [contentLocale]: { ...current[contentLocale], [field]: value },
    }));
  };

  const stageNameForLocale = (stage: LocalizedStage) => stage.translations?.[contentLocale]?.stageName ?? stage.stageName;
  const updateStageNameForLocale = (index: number, value: string) => {
    if (contentLocale === "th") {
      updateStage(index, {
        stageName: value,
        translations: {
          ...stages[index].translations,
          th: { ...stages[index].translations?.th, stageName: value },
        },
      });
      return;
    }
    updateStage(index, {
      translations: {
        ...stages[index].translations,
        [contentLocale]: { ...stages[index].translations?.[contentLocale], stageName: value },
      },
    });
  };

  const addField = (stageIndex: number, type: WorkflowFieldType) => {
    const stage = stages[stageIndex];
    updateStage(stageIndex, {
      formSchema: [...stage.formSchema, createField(type)],
    });
  };

  const updateField = (
    stageIndex: number,
    fieldIndex: number,
    patch: Partial<WorkflowFormField>,
  ) => {
    const fields = stages[stageIndex].formSchema.map((field, index) =>
      index === fieldIndex ? { ...field, ...patch } : field,
    );
    updateStage(stageIndex, { formSchema: fields });
  };

  const moveStage = (from: number, to: number) => {
    if (from === to || to < 0 || to >= stages.length) return;
    setStages((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setExpandedStage(to);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Enter a workflow name.");
      return;
    }
    if (stages.length === 0) {
      toast.error("Add at least one workflow stage.");
      return;
    }

    startTransition(async () => {
      try {
        const templateResult = await saveWorkflowTemplate({
          id: selectedId || undefined,
          name,
          description,
          targetJobType,
          isActive,
          translations: templateTranslations,
        });
        if (!templateResult.success || !templateResult.template) {
          toast.error(templateResult.error || "Could not save workflow.");
          return;
        }

        const stageResult = await updateWorkflowStages(
          templateResult.template.id,
          stages,
        );
        if (!stageResult.success) {
          toast.error(stageResult.error || "Could not save stages.");
          return;
        }

        toast.success("Workflow saved.");
        setSelectedId(templateResult.template.id);
        router.refresh();
      } catch (error) {
        console.error("Workflow save error:", error);
        toast.error("Could not save workflow. Please try again.");
      }
    });
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-col gap-4 border-b border-[#1E293B] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-400">
            <Workflow className="h-4 w-4 text-[#5F88AD]" />
            ISO workflow control
          </div>
          <h1 className="mt-2 text-2xl font-bold text-gray-100">
            Workflow Builder
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-400">
            Define installation stages and the evidence required before field teams can proceed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ContentLocaleTabs locale={contentLocale} onChange={setContentLocale} />
          <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 text-sm font-bold text-gray-100 transition hover:bg-[#A5C2DE] focus:outline-none focus:ring-2 focus:ring-[#7FA8CC] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? <GsapSpinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          Save workflow
          </button>
        </div>
      </header>

      <div className="grid min-h-[min(640px,76dvh)] overflow-hidden rounded-xl border border-[#1E293B] bg-[#0B1121] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-b border-[#1E293B] bg-[#0F172A]/55 p-4 lg:border-b-0 lg:border-r">
          <button
            type="button"
            onClick={startNewTemplate}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#1E293B] bg-[#0F172A] px-4 text-sm font-bold text-gray-100 transition hover:border-[#8FB4D3] hover:bg-[#F0F6FB] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]"
          >
            <Plus className="h-4 w-4" />
            New template
          </button>

          <div className="mt-4 space-y-1">
            {templates.map((template) => {
              const active = template.id === selectedId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => loadTemplate(template)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] ${
                    active
                      ? "bg-[#B7D1EA]/30 text-gray-100"
                      : "text-gray-300 hover:bg-[#0B1121]"
                  }`}
                >
                  <ListChecks className="h-4 w-4 shrink-0 text-[#5F88AD]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{template.name}</span>
                    <span className="mt-0.5 block text-xs text-gray-400">
                      {template.targetJobType} · {template.stages.length} stages
                    </span>
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      template.isActive ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                    aria-label={template.isActive ? "Active" : "Inactive"}
                  />
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 p-4 sm:p-6">
          <div className="grid gap-4 border-b border-[#1E293B] pb-6 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-gray-300">
                  Template name
                </span>
                <input
                  value={contentLocale === "th" ? name : translatedTemplateName}
                  onChange={(event) => {
                    if (contentLocale === "th") {
                      setName(event.target.value);
                      setTemplateTranslations((current) => ({ ...current, th: { ...current.th, name: event.target.value } }));
                    } else updateTemplateTranslation("name", event.target.value);
                  }}
                  placeholder="Standard solar installation ISO-9001"
                  className="min-h-11 w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3.5 text-sm text-gray-100 outline-none transition placeholder:text-gray-400 focus:border-[#7FA8CC] focus:ring-2 focus:ring-[#B7D1EA]/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-gray-300">
                  Description
                </span>
                <textarea
                  value={contentLocale === "th" ? description : translatedTemplateDescription || ""}
                  onChange={(event) => {
                    if (contentLocale === "th") {
                      setDescription(event.target.value);
                      setTemplateTranslations((current) => ({ ...current, th: { ...current.th, description: event.target.value } }));
                    } else updateTemplateTranslation("description", event.target.value);
                  }}
                  rows={2}
                  className="w-full resize-y rounded-lg border border-[#1E293B] bg-[#0F172A] px-3.5 py-2.5 text-sm text-gray-100 outline-none transition focus:border-[#7FA8CC] focus:ring-2 focus:ring-[#B7D1EA]/60"
                />
              </label>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-gray-300">
                  ประเภทงานที่รองรับ
                </span>
                <select
                  value={targetJobType}
                  onChange={(event) => setTargetJobType(event.target.value as JobType)}
                  className="min-h-11 w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3.5 text-sm font-bold text-gray-100 outline-none focus:border-[#7FA8CC] focus:ring-2 focus:ring-[#B7D1EA]/60"
                >
                  {jobTypes.map((jobType) => (
                    <option key={jobType} value={jobType}>
                      {jobType.charAt(0) + jobType.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-[#1E293B] bg-[#0F172A] px-3.5 py-3 text-sm font-bold text-gray-100">
                Active template
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  className="h-5 w-5 rounded border-[#1E293B] text-[#5F88AD] focus:ring-[#B7D1EA]"
                />
              </label>
              <p className="text-xs leading-5 text-gray-400">
                Activating this template automatically deactivates the previous template for the same job type.
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-100">Installation stages</h2>
              <p className="text-xs leading-5 text-gray-400">
                Drag stages to change the execution order.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStages((current) => [...current, createStage()]);
                setExpandedStage(stages.length);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#1E293B] bg-[#0F172A] px-4 text-sm font-bold text-gray-100 transition hover:bg-[#0B1121] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]"
            >
              <Plus className="h-4 w-4" />
              Add stage
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {stages.map((stage, stageIndex) => {
              const expanded = expandedStage === stageIndex;
              return (
                <section
                  key={stage.id || `new-${stageIndex}`}
                  draggable
                  onDragStart={() => setDraggedIndex(stageIndex)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedIndex !== null) moveStage(draggedIndex, stageIndex);
                    setDraggedIndex(null);
                  }}
                  onDragEnd={() => setDraggedIndex(null)}
                  className={`overflow-hidden rounded-lg border bg-[#0F172A] transition ${
                    draggedIndex === stageIndex
                      ? "border-[#7FA8CC] opacity-60"
                      : "border-[#1E293B]"
                  }`}
                >
                  <div className="flex min-h-14 items-center gap-2 px-3">
                    <button
                      type="button"
                      className="cursor-grab rounded-md p-2 text-gray-500 hover:bg-[#0B1121] hover:text-gray-300 active:cursor-grabbing"
                      aria-label={`Drag stage ${stageIndex + 1}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B7D1EA]/35 text-xs font-black text-gray-100">
                      {stageIndex + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedStage(expanded ? -1 : stageIndex)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left"
                    >
                      <span className="truncate text-sm font-bold text-gray-100">
                        {stageNameForLocale(stage) || "Untitled stage"}
                      </span>
                      <span className="hidden text-xs text-gray-400 sm:inline">
                        {stage.formSchema.length} fields
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setStages((current) =>
                          current.filter((_, index) => index !== stageIndex),
                        )
                      }
                      className="rounded-md p-2 text-gray-400 transition hover:bg-[#0B1121] hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-250"
                      aria-label="Delete stage"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    )}
                  </div>

                  {expanded && (
                    <div className="border-t border-[#1E293B] bg-[#0B1121] p-4">
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
                        <label>
                          <span className="mb-1.5 block text-xs font-bold text-gray-300">
                            Stage name
                          </span>
                          <input
                            value={stageNameForLocale(stage)}
                            onChange={(event) => updateStageNameForLocale(stageIndex, event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3.5 text-sm text-gray-100 outline-none focus:border-[#7FA8CC] focus:ring-2 focus:ring-[#B7D1EA]/60"
                          />
                        </label>
                        <label className="flex min-h-11 cursor-pointer items-center justify-between self-end rounded-lg border border-[#1E293B] bg-[#0F172A] px-3.5 text-sm font-bold text-gray-100">
                          Mandatory
                          <input
                            type="checkbox"
                            checked={stage.isMandatory}
                            onChange={(event) =>
                              updateStage(stageIndex, {
                                isMandatory: event.target.checked,
                              })
                            }
                            className="h-5 w-5 rounded border-[#1E293B] text-[#5F88AD] focus:ring-[#B7D1EA]"
                          />
                        </label>
                      </div>

                      <div className="mt-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-gray-100">Required evidence</h3>
                          <div className="flex flex-wrap gap-2">
                            {FIELD_OPTIONS.map((option) => (
                              <button
                                key={option.type}
                                type="button"
                                onClick={() => addField(stageIndex, option.type)}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#1E293B] bg-[#0F172A] px-3 text-xs font-bold text-gray-300 transition hover:border-[#8FB4D3] hover:bg-[#F0F6FB] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]"
                              >
                                <option.icon className="h-3.5 w-3.5" />
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {stage.formSchema.map((field, fieldIndex) => {
                            const option = FIELD_OPTIONS.find(
                              (item) => item.type === field.type,
                            );
                            const Icon = option?.icon || TextCursorInput;
                            return (
                              <div
                                key={field.id}
                                className="grid gap-2 rounded-lg border border-[#1E293B] bg-[#0F172A] p-3 sm:grid-cols-[32px_minmax(0,1fr)_150px_110px_36px] sm:items-center"
                              >
                                <Icon className="h-4 w-4 text-[#5F88AD]" />
                                <input
                                  value={field.label}
                                  onChange={(event) =>
                                    updateField(stageIndex, fieldIndex, {
                                      label: event.target.value,
                                    })
                                  }
                                  aria-label="Field label"
                                  className="min-h-10 min-w-0 rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-sm text-gray-100 outline-none focus:border-[#7FA8CC] focus:ring-2 focus:ring-[#B7D1EA]/60"
                                />
                                <select
                                  value={field.type}
                                  onChange={(event) =>
                                    updateField(stageIndex, fieldIndex, {
                                      type: event.target.value as WorkflowFieldType,
                                    })
                                  }
                                  aria-label="Field type"
                                  className="min-h-10 rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 text-xs font-bold text-gray-100 outline-none focus:ring-2 focus:ring-[#B7D1EA]"
                                >
                                  {FIELD_OPTIONS.map((item) => (
                                    <option key={item.type} value={item.type}>
                                      {item.label}
                                    </option>
                                  ))}
                                </select>
                                <label className="flex min-h-10 items-center gap-2 text-xs font-bold text-gray-300">
                                  <input
                                    type="checkbox"
                                    checked={field.isRequired}
                                    onChange={(event) =>
                                      updateField(stageIndex, fieldIndex, {
                                        isRequired: event.target.checked,
                                      })
                                    }
                                    className="h-4 w-4 rounded border-[#1E293B] text-[#5F88AD]"
                                  />
                                  Required
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStage(stageIndex, {
                                      formSchema: stage.formSchema.filter(
                                        (_, index) => index !== fieldIndex,
                                      ),
                                    })
                                  }
                                  className="flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition hover:bg-[#0B1121] hover:text-rose-700"
                                  aria-label="Delete field"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                          {stage.formSchema.length === 0 && (
                            <div className="rounded-lg border border-dashed border-[#1E293B] px-4 py-8 text-center text-sm text-gray-400">
                              Add a checklist, text field, photo, or signature requirement.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </main>
      </div>

      {!selectedTemplate && templates.length === 0 && (
        <p className="text-sm text-gray-400">Create the first workflow template to begin.</p>
      )}
    </div>
  );
}
