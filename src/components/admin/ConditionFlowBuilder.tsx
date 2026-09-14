"use client";

import { ArrowDown, Code2, GitBranch, Plus, Trash2 } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  createConditionRow,
  getFieldOption,
  operatorNeedsValue,
  type ConditionFieldOption,
  type ConditionMode,
  type ConditionOperator,
  type ConditionOperatorOption,
  type ConditionRow,
  type MatchMode,
} from "@/lib/conditionFlow";

type ConditionFlowBuilderProps<TField extends string> = {
  mode: ConditionMode;
  onModeChange: (mode: ConditionMode) => void;
  matchMode: MatchMode;
  onMatchModeChange: (mode: MatchMode) => void;
  rows: ConditionRow<TField>[];
  onRowsChange: (updater: (rows: ConditionRow<TField>[]) => ConditionRow<TField>[]) => void;
  fieldOptions: ConditionFieldOption<TField>[];
  operatorOptions: ConditionOperatorOption[];
  jsonValue: string;
  onJsonValueChange: (value: string) => void;
  title?: string;
  description?: string;
};

export default function ConditionFlowBuilder<TField extends string>({
  mode,
  onModeChange,
  matchMode,
  onMatchModeChange,
  rows,
  onRowsChange,
  fieldOptions,
  operatorOptions,
  jsonValue,
  onJsonValueChange,
  title,
  description,
}: ConditionFlowBuilderProps<TField>) {
  const t = useTranslations("ConditionFlowBuilder");
  const defaultField = fieldOptions[0].value;

  return (
    <div className="space-y-4 rounded-2xl border border-[#1E293B] bg-[#0B1121] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-400">
            {title ?? t("title")}
          </span>
          <p className="mt-1 text-xs leading-5 text-gray-400">{description ?? t("description")}</p>
        </div>
        <div className="flex shrink-0 rounded-xl border border-[#1E293B] bg-[#0F172A] p-1">
          {(["BUILDER", "JSON"] as ConditionMode[]).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => onModeChange(nextMode)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition",
                mode === nextMode ? "bg-[#B7D1EA] text-white" : "text-gray-400 hover:bg-[#0B1121]",
              )}
            >
              {nextMode === "BUILDER" ? <GitBranch className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
              {nextMode === "BUILDER" ? t("flow") : "JSON"}
            </button>
          ))}
        </div>
      </div>

      {mode === "BUILDER" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#B7D1EA]/25 text-[#B7D1EA]">
                <GitBranch className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-black text-gray-100">{t("start")}</p>
                <p className="text-[11px] leading-5 text-gray-400">
                  {t("startDescription")}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-400">
              {t("match")}
              <select
                value={matchMode}
                onChange={(event) => onMatchModeChange(event.target.value as MatchMode)}
                disabled={rows.length <= 1}
                className="rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-2 text-xs font-bold text-gray-300 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10 disabled:opacity-50"
              >
                <option value="all">{t("allNodes")}</option>
                <option value="any">{t("anyNode")}</option>
              </select>
            </label>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const fieldOption = getFieldOption(fieldOptions, row.field);
              const needsValue = operatorNeedsValue(operatorOptions, row.operator);
              const enumValues =
                fieldOption.type === "boolean" ? ["true", "false"] : fieldOption.values ?? [];

              return (
                <div key={row.id} className="space-y-3">
                  <div className="flex justify-center">
                    <div className="flex flex-col items-center text-slate-300">
                      <ArrowDown className="h-4 w-4" />
                      {index > 0 && (
                        <span className="mt-1 rounded-full bg-[#0F172A] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-gray-400">
                          {matchMode === "all" ? t("and") : t("or")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#0B1121] text-[10px] font-black text-gray-400">
                          {index + 1}
                        </span>
                        <p className="truncate text-xs font-black text-gray-100">
                          {t("if")} {fieldOption.label} {operatorOptions.find((item) => item.value === row.operator)?.label}
                          {needsValue ? ` ${row.value || "..."}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onRowsChange((currentRows) =>
                            currentRows.length === 1
                              ? currentRows
                              : currentRows.filter((item) => item.id !== row.id),
                          )
                        }
                        disabled={rows.length === 1}
                        className="inline-flex h-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-500/10 px-2.5 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title={t("removeCondition", { count: index + 1 })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid gap-2 lg:grid-cols-[1fr_160px_1fr]">
                      <label className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                          {t("field")}
                        </span>
                        <select
                          value={row.field}
                          onChange={(event) => {
                            const nextField = event.target.value as TField;
                            const nextFieldOption = getFieldOption(fieldOptions, nextField);
                            const nextValue =
                              nextFieldOption.type === "boolean"
                                ? "true"
                                : nextFieldOption.values?.[0] ?? "";
                            onRowsChange((currentRows) =>
                              currentRows.map((item) =>
                                item.id === row.id
                                  ? { ...item, field: nextField, value: nextValue }
                                  : item,
                              ),
                            );
                          }}
                          className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
                        >
                          {fieldOptions.map((field) => (
                            <option key={field.value} value={field.value}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                          {t("operator")}
                        </span>
                        <select
                          value={row.operator}
                          onChange={(event) =>
                            onRowsChange((currentRows) =>
                              currentRows.map((item) =>
                                item.id === row.id
                                  ? { ...item, operator: event.target.value as ConditionOperator }
                                  : item,
                              ),
                            )
                          }
                          className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
                        >
                          {operatorOptions.map((operator) => (
                            <option key={operator.value} value={operator.value}>
                              {operator.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                          {t("value")}
                        </span>
                        {enumValues.length > 0 && row.operator !== "in" ? (
                          <select
                            value={row.value}
                            disabled={!needsValue}
                            onChange={(event) =>
                              onRowsChange((currentRows) =>
                                currentRows.map((item) =>
                                  item.id === row.id
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10 disabled:opacity-50"
                          >
                            {enumValues.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={row.value}
                            disabled={!needsValue}
                            onChange={(event) =>
                              onRowsChange((currentRows) =>
                                currentRows.map((item) =>
                                  item.id === row.id
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder={row.operator === "in" ? "A, B, C" : t("value")}
                            className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs font-bold text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10 disabled:opacity-50"
                          />
                        )}
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => onRowsChange((currentRows) => [...currentRows, createConditionRow(defaultField)])}
              className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition hover:bg-[#0B1121]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addCondition")}
            </button>
          </div>
        </div>
      ) : (
        <label className="block space-y-1.5">
          <span className="text-xs font-black uppercase tracking-wider text-gray-400">
            {t("conditionJson")}
          </span>
          <textarea
            value={jsonValue}
            onChange={(event) => onJsonValueChange(event.target.value)}
            rows={8}
            className="w-full resize-y rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-3 font-mono text-xs leading-5 text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
          />
        </label>
      )}
    </div>
  );
}
