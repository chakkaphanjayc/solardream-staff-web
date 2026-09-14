"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BadgePercent,
  CheckCircle2,
  Edit3,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "@/components/ui/icons";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";

import {
  deleteCrossSellRule,
  saveCrossSellRule,
  setCrossSellRuleActive,
  type CrossSellProductOption,
  type CrossSellQuestionOption,
  type CrossSellRuleRow,
} from "@/app/actions/crossSell";
import Combobox from "@/components/ui/combobox";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useAdminSelection } from "@/hooks/useAdminSelection";

const formSchema = z.object({
  id: z.string().uuid().optional(),
  ruleName: z.string().trim().min(2, "Rule name is required.").max(160),
  addonProductId: z.string().trim().min(1, "Select an add-on product."),
  promotionalTag: z.string().trim().max(240).optional(),
  priority: z.number().int().min(-999).max(999),
  isActive: z.boolean(),
  questionId: z.string().trim().min(1, "Select a wizard question."),
  operator: z.enum(["==", "!="]),
  value: z.string().trim().min(1, "Select or enter a trigger value."),
});

type CrossSellFormValues = z.infer<typeof formSchema>;

function getActionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const defaultValues: CrossSellFormValues = {
  ruleName: "",
  addonProductId: "",
  promotionalTag: "",
  priority: 0,
  isActive: true,
  questionId: "",
  operator: "==",
  value: "",
};

export default function CrossSellRulesClient({
  initialRules,
  products,
  questions,
}: {
  initialRules: CrossSellRuleRow[];
  products: CrossSellProductOption[];
  questions: CrossSellQuestionOption[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [query, setQuery] = useState("");
  const [editingRule, setEditingRule] = useState<CrossSellRuleRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const productOptions = useMemo(
    () => products.map((product) => ({
      value: product.id,
      label: product.label,
      description: product.description,
    })),
    [products],
  );

  const questionOptions = useMemo(
    () => questions.map((question) => ({
      value: question.id,
      label: question.label,
      description: `${question.wizardTitle} · ${question.stateKey}`,
    })),
    [questions],
  );

  const filteredRules = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rules;
    return rules.filter((rule) =>
      [
        rule.ruleName,
        rule.addonProductName || "",
        rule.promotionalTag || "",
        rule.triggerConditions.map((condition) => `${condition.questionLabel} ${condition.value}`).join(" "),
      ].join(" ").toLowerCase().includes(normalized),
    );
  }, [query, rules]);
  const selection = useAdminSelection(filteredRules.map((rule) => rule.id));

  const form = useForm<CrossSellFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const selectedQuestionId = useWatch({
    control: form.control,
    name: "questionId",
  });

  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) || null;

  const openNewDialog = () => {
    setEditingRule(null);
    form.reset(defaultValues);
    setDialogOpen(true);
  };

  const openEditDialog = (rule: CrossSellRuleRow) => {
    const condition = rule.triggerConditions[0];
    const matchingQuestion = questions.find((question) => question.stateKey === condition?.questionKey);
    setEditingRule(rule);
    form.reset({
      id: rule.id,
      ruleName: rule.ruleName,
      addonProductId: rule.addonProductId,
      promotionalTag: rule.promotionalTag || "",
      priority: rule.priority,
      isActive: rule.isActive,
      questionId: matchingQuestion?.id || "",
      operator: condition?.operator || "==",
      value: condition?.value || "",
    });
    setDialogOpen(true);
  };

  const onSubmit = (values: CrossSellFormValues) => {
    const question = questions.find((item) => item.id === values.questionId);
    if (!question) {
      form.setError("questionId", { message: "Selected question was not found." });
      return;
    }

    startTransition(async () => {
      try {
        const result = await saveCrossSellRule({
          id: values.id,
          ruleName: values.ruleName,
          addonProductId: values.addonProductId,
          promotionalTag: values.promotionalTag,
          priority: values.priority,
          isActive: values.isActive,
          triggerConditions: [{
            questionKey: question.stateKey,
            questionLabel: question.label,
            operator: values.operator,
            value: values.value,
          }],
        });

        if (result.success) {
          toast.success(values.id ? "Cross-sell rule updated." : "Cross-sell rule created.");
          setDialogOpen(false);
          router.refresh();
        } else {
          toast.error(result.error || "Failed to save rule.");
        }
      } catch (error) {
        toast.error(getActionError(error, "Failed to save rule."));
      }
    });
  };

  const handleDelete = (rule: CrossSellRuleRow) => {
    if (!confirm(`Delete "${rule.ruleName}"?`)) return;
    startTransition(async () => {
      try {
        const result = await deleteCrossSellRule(rule.id);
        if (result.success) {
          setRules((current) => current.filter((item) => item.id !== rule.id));
          toast.success("Cross-sell rule deleted.");
          router.refresh();
        } else {
          toast.error(result.error || "Failed to delete rule.");
        }
      } catch (error) {
        toast.error(getActionError(error, "Failed to delete rule."));
      }
    });
  };

  const handleToggleStatus = (rule: CrossSellRuleRow) => {
    const nextStatus = !rule.isActive;
    setRules((current) => current.map((item) => item.id === rule.id ? { ...item, isActive: nextStatus } : item));
    startTransition(async () => {
      try {
        const result = await setCrossSellRuleActive(rule.id, nextStatus);
        if (result.success) {
          toast.success(nextStatus ? "Rule activated." : "Rule paused.");
          router.refresh();
        } else {
          setRules((current) => current.map((item) => item.id === rule.id ? { ...item, isActive: rule.isActive } : item));
          toast.error(result.error || "Failed to update rule status.");
        }
      } catch (error) {
        setRules((current) => current.map((item) => item.id === rule.id ? { ...item, isActive: rule.isActive } : item));
        toast.error(getActionError(error, "Failed to update rule status."));
      }
    });
  };

  const handleBulkToggleStatus = (isActive: boolean) => {
    if (selection.selectedCount === 0) return;
    startTransition(async () => {
      const ids = selection.selectedIds;
      try {
        const settled = await Promise.allSettled(ids.map((id) => setCrossSellRuleActive(id, isActive)));
        const succeededIds = ids.filter((id, index) => settled[index]?.status === "fulfilled" && settled[index].value.success);
        const failedCount = ids.length - succeededIds.length;
        setRules((current) => current.map((rule) => succeededIds.includes(rule.id) ? { ...rule, isActive } : rule));
        if (succeededIds.length > 0) selection.clear();
        if (failedCount > 0) {
          toast.error(`${failedCount} rule(s) could not be updated.`);
        } else {
          toast.success(`${succeededIds.length} rule(s) ${isActive ? "activated" : "paused"}.`);
        }
      } catch (error) {
        toast.error(getActionError(error, "Some rules could not be updated."));
      }
    });
  };

  const handleBulkDelete = () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected cross-sell rule(s)?`)) return;
    startTransition(async () => {
      const ids = selection.selectedIds;
      try {
        const settled = await Promise.allSettled(ids.map((id) => deleteCrossSellRule(id)));
        const succeededIds = ids.filter((id, index) => settled[index]?.status === "fulfilled" && settled[index].value.success);
        const failedCount = ids.length - succeededIds.length;
        setRules((current) => current.filter((rule) => !succeededIds.includes(rule.id)));
        if (succeededIds.length > 0) selection.clear();
        if (failedCount > 0) {
          toast.error(`${failedCount} rule(s) could not be deleted.`);
        } else {
          toast.success(`${succeededIds.length} rule(s) deleted.`);
        }
        if (succeededIds.length > 0) router.refresh();
      } catch (error) {
        toast.error(getActionError(error, "Some rules could not be deleted."));
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black text-gray-100">
            <BadgePercent className="h-7 w-7 text-[#B7D1EA]" />
            Cross-sell Rules
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            Recommend add-on products from wizard answers, such as EV chargers, load controllers, or under-panel protection.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewDialog}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B7D1EA] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#99BFE3]"
        >
          <Plus className="h-4 w-4" />
          Add rule
        </button>
      </div>

      <section className="rounded-lg border border-[#1E293B] bg-[#0F172A]">
        <div className="flex flex-col gap-3 border-b border-[#1E293B] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black text-gray-100">Rule library</h2>
            <p className="mt-1 text-xs text-gray-400">{rules.length} configured rules</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2 lg:w-80">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rules"
              className="w-full bg-transparent text-sm font-medium text-gray-100 outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        {filteredRules.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center p-8 text-center">
            <div>
              <BadgePercent className="mx-auto h-9 w-9 text-slate-300" />
              <h3 className="mt-3 text-base font-bold text-gray-100">No cross-sell rules found</h3>
              <p className="mt-1 text-sm text-gray-400">Create a rule to recommend add-on products from wizard answers.</p>
              <button
                type="button"
                onClick={openNewDialog}
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#1E293B] px-4 py-2 text-sm font-bold text-gray-300 transition-colors hover:bg-[#0B1121]"
              >
                <Plus className="h-4 w-4" />
                Add first rule
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-3">
          <AdminBulkActionBar
            selectedCount={selection.selectedCount}
            visibleCount={filteredRules.length}
            allVisibleSelected={selection.allVisibleSelected}
            someVisibleSelected={selection.someVisibleSelected}
            onToggleVisible={selection.toggleVisible}
            onClear={selection.clear}
            isPending={isPending}
            actions={[
              {
                id: "activate",
                label: "Activate",
                icon: CheckCircle2,
                tone: "success",
                onClick: () => handleBulkToggleStatus(true),
              },
              {
                id: "pause",
                label: "Pause",
                icon: XCircle,
                tone: "warning",
                onClick: () => handleBulkToggleStatus(false),
              },
              {
                id: "delete",
                label: "Delete",
                icon: Trash2,
                tone: "danger",
                onClick: handleBulkDelete,
              },
            ]}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-[#0B1121] text-xs font-bold text-gray-400">
                <tr>
                  <th className="w-14 px-4 py-3">
                    <AdminSelectionCheckbox
                      checked={selection.allVisibleSelected}
                      indeterminate={selection.someVisibleSelected}
                      disabled={isPending}
                      label="Select all visible cross-sell rules"
                      onChange={selection.toggleVisible}
                    />
                  </th>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Add-on</th>
                  <th className="px-4 py-3">Tag</th>
                  <th className="px-4 py-3 text-right">Priority</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRules.map((rule) => {
                  const condition = rule.triggerConditions[0];
                  return (
                    <tr key={rule.id} className="align-top text-sm">
                      <td className="px-4 py-4">
                        <AdminSelectionCheckbox
                          checked={selection.isSelected(rule.id)}
                          disabled={isPending}
                          label={`Select cross-sell rule ${rule.ruleName}`}
                          onChange={() => selection.toggle(rule.id)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(rule)}
                            disabled={isPending}
                            className={cn(
                              "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                              rule.isActive ? "bg-emerald-500/10" : "bg-[#0B1121]",
                              rule.isActive ? "text-emerald-900" : "text-gray-300",
                            )}
                            aria-label={rule.isActive ? "Pause rule" : "Activate rule"}
                          >
                            {rule.isActive ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                          </button>
                          <div>
                            <p className="font-bold text-gray-100">{rule.ruleName}</p>
                            <p className="mt-1 text-xs text-gray-400">{rule.isActive ? "Active" : "Paused"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-100">{condition?.questionLabel || "No trigger"}</p>
                        <p className="mt-1 font-mono text-xs text-gray-400">
                          {condition ? `${condition.questionKey} ${condition.operator === "==" ? "equals" : "does not equal"} ${condition.value}` : "Missing condition"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-100">{rule.addonProductName || "Product not found"}</p>
                        {rule.addonProductMeta && <p className="mt-1 text-xs text-gray-400">{rule.addonProductMeta}</p>}
                      </td>
                      <td className="px-4 py-4">
                        {rule.promotionalTag ? (
                          <span className="inline-flex rounded-md bg-cyan-500/10 px-2.5 py-1 text-xs font-bold text-cyan-800">
                            {rule.promotionalTag}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">No tag</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm font-bold text-gray-300">{rule.priority}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(rule)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#0B1121] hover:text-gray-100"
                            aria-label="Edit rule"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                             type="button"
                             onClick={() => handleDelete(rule)}
                             className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#0B1121] hover:text-rose-700"
                             aria-label="Delete rule"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </section>

      <Dialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} size="md" className="rounded-xl">
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b border-[#1E293B] bg-[#0F172A] px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-gray-100">{editingRule ? "Edit cross-sell rule" : "Add cross-sell rule"}</h2>
                <p className="mt-1 text-sm text-gray-400">Set one wizard answer trigger and the product to recommend.</p>
              </div>
            </DialogHeader>
            <DialogBody className="space-y-5 px-5 py-5">
              <FormField label="Rule name" error={form.formState.errors.ruleName?.message}>
                <input
                  {...form.register("ruleName")}
                  placeholder="EV Charger for Home Owners"
                  className="w-full rounded-lg border border-[#1E293B] px-3 py-2.5 text-sm font-medium text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/15"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <FormField label="Add-on product" error={form.formState.errors.addonProductId?.message}>
                  <Controller
                    control={form.control}
                    name="addonProductId"
                    render={({ field }) => (
                      <Combobox
                        options={productOptions}
                        value={field.value}
                        onSelect={field.onChange}
                        placeholder="Select active product"
                        searchPlaceholder="Search products"
                        emptyText="No active products found."
                      />
                    )}
                  />
                </FormField>
                <FormField label="Priority" error={form.formState.errors.priority?.message}>
                  <input
                    type="number"
                    {...form.register("priority", { valueAsNumber: true })}
                    className="w-full rounded-lg border border-[#1E293B] px-3 py-2.5 text-sm font-mono text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/15"
                  />
                </FormField>
              </div>

              <FormField label="Promotional tag" error={form.formState.errors.promotionalTag?.message}>
                <input
                  {...form.register("promotionalTag")}
                  placeholder="Free Installation"
                  className="w-full rounded-lg border border-[#1E293B] px-3 py-2.5 text-sm font-medium text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/15"
                />
              </FormField>

              <section className="rounded-lg border border-[#1E293B] bg-[#0B1121] p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-black text-gray-100">Trigger condition</h3>
                  <p className="mt-1 text-xs text-gray-400">When this answer matches, the add-on appears in the recommendation list.</p>
                </div>
                <div className="grid gap-4">
                  <FormField label="Wizard question" error={form.formState.errors.questionId?.message}>
                    <Controller
                      control={form.control}
                      name="questionId"
                      render={({ field }) => (
                        <Combobox
                          options={questionOptions}
                          value={field.value}
                          onSelect={(questionId) => {
                            field.onChange(questionId);
                            const question = questions.find((item) => item.id === questionId);
                            form.setValue("value", question?.values[0]?.value || "", { shouldValidate: true });
                          }}
                          placeholder="Select wizard question"
                          searchPlaceholder="Search questions"
                          emptyText="No wizard questions found."
                        />
                      )}
                    />
                  </FormField>

                  <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
                    <FormField label="Operator" error={form.formState.errors.operator?.message}>
                      <select
                        {...form.register("operator")}
                        className="w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm font-bold text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/15"
                      >
                        <option value="==">Equals</option>
                        <option value="!=">Does not equal</option>
                      </select>
                    </FormField>
                    <FormField label="Value" error={form.formState.errors.value?.message}>
                      {selectedQuestion?.values.length ? (
                        <select
                          {...form.register("value")}
                          className="w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm font-medium text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/15"
                        >
                          {selectedQuestion.values.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...form.register("value")}
                          placeholder="Answer value"
                          className="w-full rounded-lg border border-[#1E293B] px-3 py-2.5 text-sm font-medium text-gray-100 outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/15"
                        />
                      )}
                    </FormField>
                  </div>
                </div>
              </section>

              <label className="flex items-center gap-2 text-sm font-bold text-gray-300">
                <input
                  type="checkbox"
                  {...form.register("isActive")}
                  className="h-4 w-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                />
                Active rule
              </label>
            </DialogBody>
            <DialogFooter className="border-t border-[#1E293B] bg-[#0F172A] px-5 py-4">
              <DialogCloseButton>Cancel</DialogCloseButton>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#B7D1EA] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && <GsapSpinner className="h-4 w-4" />}
                Save rule
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-gray-400">{label}</span>
      {children}
      {error && <span className="block text-xs font-semibold text-rose-600">{error}</span>}
    </label>
  );
}
