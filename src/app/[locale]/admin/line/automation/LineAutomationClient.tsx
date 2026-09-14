"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FlaskConical, Plus, Save, Send, Trash2 } from "@/components/ui/icons";
import {
  publishLineAutomationRule,
  saveLineAutomationRuleDraft,
  type LineAutomationRuleDto,
} from "@/app/actions/lineAutomation";
import {
  DEFAULT_LINE_AUTOMATION_RULE,
  type LineAutomationAction,
  type LineAutomationCondition,
  type LineAutomationRuleConfig,
} from "@/lib/lineAutomationEngine";
import { AdminDataTable, AdminEmptyState, AdminErrorState, AdminPublishSummary, AdminSaveStatus, AdminStatusBadge } from "@/components/admin/AdminPrimitives";

type SaveState = "saved" | "saving" | "unsaved" | "error";

function emptyRule(): LineAutomationRuleDto {
  return {
    id: "",
    name: "New automation rule",
    draftConfig: DEFAULT_LINE_AUTOMATION_RULE,
    publishedConfig: null,
    status: "DRAFT",
    priority: 100,
    stopProcessing: false,
    cooldownSeconds: 0,
    enabled: false,
    executionCount: 0,
    lastExecutedAt: null,
    lastError: null,
    draftVersion: 1,
    publishedVersion: null,
    rowVersion: 1,
    updatedAt: new Date().toISOString(),
  };
}

function conditionForType(type: LineAutomationCondition["type"]): LineAutomationCondition {
  if (type === "tag") return { type, tag: "customer", operator: "has" };
  if (type === "businessHours") return { type, isOpen: true };
  if (type === "takeover") return { type, isTakenOver: false };
  if (type === "accountLinked") return { type, isLinked: true };
  if (type === "conversationStatus") return { type, status: "OPEN" };
  if (type === "event") return { type, field: "eventName", value: "", match: "exact" };
  return { type, field: "customerType", value: "", match: "exact" };
}

function actionForType(type: LineAutomationAction["type"]): LineAutomationAction {
  if (type === "sendText") return { type, text: "Example response. Replace this with approved customer copy." };
  if (type === "sendContent") return { type, contentId: "00000000-0000-4000-8000-000000000000" };
  if (type === "addTag" || type === "removeTag") return { type, tag: "follow-up" };
  if (type === "assignStaff") return { type, staffId: "staff-id" };
  if (type === "invokeDify") return { type, integrationId: "00000000-0000-4000-8000-000000000000" };
  if (type === "handoff") return { type, reason: "Needs a team member" };
  if (type === "setAutomation") return { type, enabled: false };
  if (type === "setRichMenu") return { type, richMenuId: "rich-menu-definition-id" };
  return { type, channel: "inbox", message: "Automation notification" };
}

export default function LineAutomationClient({
  locale,
  initialRules,
  initialError,
}: {
  locale: string;
  initialRules: LineAutomationRuleDto[];
  initialError: string | null;
}) {
  const t = useTranslations("AdminLineAutomation");
  const [rules, setRules] = useState(initialRules);
  const [selected, setSelected] = useState<LineAutomationRuleDto | null>(null);
  const [name, setName] = useState("");
  const [config, setConfig] = useState<LineAutomationRuleConfig | null>(null);
  const [priority, setPriority] = useState(100);
  const [stopProcessing, setStopProcessing] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [isSaving, startSaving] = useTransition();

  const selectRule = useCallback((rule: LineAutomationRuleDto) => {
    setSelected(rule);
    setName(rule.name);
    setConfig(rule.draftConfig);
    setPriority(rule.priority);
    setStopProcessing(rule.stopProcessing);
    setCooldownSeconds(rule.cooldownSeconds);
    setEnabled(rule.enabled);
    setSaveState("saved");
  }, []);

  const createNew = () => selectRule(emptyRule());
  const markUnsaved = () => setSaveState("unsaved");

  const updateConfig = (updater: (current: LineAutomationRuleConfig) => LineAutomationRuleConfig) => {
    setConfig((current) => current ? updater(current) : current);
    markUnsaved();
  };

  const updateCondition = (index: number, condition: LineAutomationCondition) => updateConfig((current) => ({ ...current, conditions: current.conditions.map((item, itemIndex) => itemIndex === index ? condition : item) }));
  const updateAction = (index: number, action: LineAutomationAction) => updateConfig((current) => ({ ...current, actions: current.actions.map((item, itemIndex) => itemIndex === index ? action : item) }));

  const saveDraft = () => {
    if (!config) return;
    startSaving(async () => {
      setSaveState("saving");
      const result = await saveLineAutomationRuleDraft({ id: selected?.id || undefined, name, config, priority, stopProcessing, cooldownSeconds, enabled, expectedRowVersion: selected?.id ? selected.rowVersion : undefined });
      if (!result.success) {
        setSaveState("error");
        toast.error(result.error);
        return;
      }
      setSelected(result.rule);
      setRules((current) => current.some((rule) => rule.id === result.rule.id) ? current.map((rule) => rule.id === result.rule.id ? result.rule : rule) : [result.rule, ...current]);
      setSaveState("saved");
      toast.success(t("saved"));
    });
  };

  const publish = () => {
    if (!selected?.id) {
      toast.error(t("saveBeforePublish"));
      return;
    }
    startSaving(async () => {
      const result = await publishLineAutomationRule(selected.id, selected.rowVersion);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSelected(result.rule);
      setRules((current) => current.map((rule) => rule.id === result.rule.id ? result.rule : rule));
      toast.success(t("published"));
    });
  };

  return (
    <div data-bagui="line-automation-rules" className="space-y-4">
      {initialError ? <AdminErrorState title={t("unavailable")} description={initialError} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d29922]/40 bg-[#d29922]/10 px-4 py-3"><p className="max-w-3xl text-xs leading-5 text-[var(--solar-ops-body)]">{t("safetyDescription")}</p><Link href={`/${locale}/admin/line/test-center`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#d29922]/50 px-3 text-xs font-semibold text-[#e3b341] hover:bg-[#d29922]/15"><FlaskConical className="size-3.5" aria-hidden="true" />{t("testCenter")}</Link></div>
      <div className="flex justify-end"><button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--solar-ops-green-hover)]"><Plus className="size-4" aria-hidden="true" />{t("newRule")}</button></div>
      {!rules.length && !selected ? <AdminEmptyState title={t("emptyTitle")} description={t("emptyDescription")} action={<button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white"><Plus className="size-4" aria-hidden="true" />{t("newRule")}</button>} /> : null}
      {rules.length ? <AdminDataTable rows={rules} caption={t("library")} columns={[
        { key: "name", label: t("ruleName"), render: (rule) => <button type="button" onClick={() => selectRule(rule)} className="text-left font-semibold text-[var(--solar-ops-text)] underline-offset-4 hover:underline">{rule.name}</button> },
        { key: "trigger", label: t("trigger"), render: (rule) => <span className="text-xs">{t(`triggerTypes.${rule.draftConfig.trigger.type}`)} · {rule.draftConfig.trigger.value || t("emptyValue")}</span> },
        { key: "priority", label: t("priority"), render: (rule) => <span className="font-mono text-xs">{rule.priority}</span> },
        { key: "status", label: t("status"), render: (rule) => <AdminStatusBadge value={t(`statuses.${rule.status}`)} /> },
        { key: "enabled", label: t("enabled"), render: (rule) => <AdminStatusBadge value={rule.enabled ? t("on") : t("off")} tone={rule.enabled ? "success" : "neutral"} /> },
      ]} /> : null}
      {selected && config ? <section className="grid gap-4 xl:grid-cols-[minmax(18rem,0.56fr)_minmax(18rem,0.44fr)]" aria-labelledby="automation-editor-heading">
        <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4">
          <div className="flex items-start justify-between gap-3"><div><h2 id="automation-editor-heading" className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("editor")}</h2><p className="mt-1 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("editorDescription")}</p></div><AdminSaveStatus state={saveState} label={saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : saveState === "error" ? t("saveError") : t("unsaved")} /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label={t("ruleName")} value={name} onChange={(value) => { setName(value); markUnsaved(); }} /><NumberField label={t("priority")} value={priority} onChange={(value) => { setPriority(value); markUnsaved(); }} min={0} max={10000} /><NumberField label={t("cooldown")} value={cooldownSeconds} onChange={(value) => { setCooldownSeconds(value); markUnsaved(); }} min={0} max={86400} /><label className="flex min-h-10 items-center gap-2 self-end text-xs font-semibold text-[var(--solar-ops-body)]"><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); markUnsaved(); }} className="size-4 accent-[#238636]" />{t("enabled")}</label></div>
          <label className="mt-3 flex min-h-10 items-center gap-2 text-xs font-semibold text-[var(--solar-ops-body)]"><input type="checkbox" checked={stopProcessing} onChange={(event) => { setStopProcessing(event.target.checked); markUnsaved(); }} className="size-4 accent-[#238636]" />{t("stopProcessing")}</label>
          <div className="mt-5 border-t border-[var(--solar-ops-border)] pt-4"><h3 className="text-xs font-semibold text-[var(--solar-ops-muted)]">{t("trigger")}</h3><div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]"><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("triggerType")}</span><select value={config.trigger.type} onChange={(event) => updateConfig((current) => ({ ...current, trigger: { ...current.trigger, type: event.target.value as typeof current.trigger.type } }))} className="w-full px-3 text-sm"><option value="follow">{t("triggerTypes.follow")}</option><option value="message">{t("triggerTypes.message")}</option><option value="postback">{t("triggerTypes.postback")}</option><option value="accountLink">{t("triggerTypes.accountLink")}</option><option value="event">{t("triggerTypes.event")}</option><option value="schedule">{t("triggerTypes.schedule")}</option></select></label><Field label={t("triggerField")} value={config.trigger.field} onChange={(value) => updateConfig((current) => ({ ...current, trigger: { ...current.trigger, field: value } }))} /><Field label={t("triggerValue")} value={config.trigger.value} onChange={(value) => updateConfig((current) => ({ ...current, trigger: { ...current.trigger, value } }))} /><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("matchMode")}</span><select value={config.trigger.match} onChange={(event) => updateConfig((current) => ({ ...current, trigger: { ...current.trigger, match: event.target.value as typeof current.trigger.match } }))} className="w-full px-3 text-sm"><option value="exact">{t("matchModes.exact")}</option><option value="contains">{t("matchModes.contains")}</option><option value="startsWith">{t("matchModes.startsWith")}</option><option value="regex">{t("matchModes.regex")}</option></select></label></div></div>
          <div className="mt-5 border-t border-[var(--solar-ops-border)] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-[var(--solar-ops-muted)]">{t("conditions")}</h3><button type="button" onClick={() => updateConfig((current) => ({ ...current, conditions: [...current.conditions, conditionForType("tag")] }))} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[var(--solar-ops-blue)]"><Plus className="size-3.5" aria-hidden="true" />{t("addCondition")}</button></div><p className="mt-1 text-xs text-[var(--solar-ops-muted)]">{t("conditionsHint")}</p><label className="mt-3 block max-w-xs text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("conditionMode")}</span><select value={config.conditionMode} onChange={(event) => updateConfig((current) => ({ ...current, conditionMode: event.target.value as typeof current.conditionMode }))} className="w-full px-3 text-sm"><option value="all">{t("conditionModes.all")}</option><option value="any">{t("conditionModes.any")}</option></select></label><div className="mt-3 space-y-3">{config.conditions.map((condition, index) => <ConditionEditor key={`${index}-${condition.type}`} condition={condition} index={index} onChange={updateCondition} onRemove={() => updateConfig((current) => ({ ...current, conditions: current.conditions.filter((_, itemIndex) => itemIndex !== index) }))} t={t} />)}</div></div>
          <div className="mt-5 border-t border-[var(--solar-ops-border)] pt-4"><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-[var(--solar-ops-muted)]">{t("actions")}</h3><button type="button" onClick={() => updateConfig((current) => ({ ...current, actions: [...current.actions, actionForType("sendText")] }))} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[var(--solar-ops-blue)]"><Plus className="size-3.5" aria-hidden="true" />{t("addAction")}</button></div><div className="mt-3 space-y-3">{config.actions.map((action, index) => <ActionEditor key={`${index}-${action.type}`} action={action} onChange={(next) => updateAction(index, next)} onRemove={() => { if (config.actions.length > 1) updateConfig((current) => ({ ...current, actions: current.actions.filter((_, itemIndex) => itemIndex !== index) })); }} t={t} />)}</div></div>
        </div>
        <div className="space-y-4"><AdminPublishSummary draftVersion={selected.draftVersion} publishedVersion={selected.publishedVersion} status={selected.status === "PUBLISHED" ? t("statuses.PUBLISHED") : t("notPublished")} note={t("publishNote")} /><div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={saveDraft} disabled={isSaving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3 text-xs font-semibold text-white disabled:opacity-50"><Save className="size-3.5" aria-hidden="true" />{t("save")}</button><button type="button" onClick={publish} disabled={isSaving || !selected.id} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#3fb950]/50 px-3 text-xs font-semibold text-[#7ee787] disabled:opacity-50"><Send className="size-3.5" aria-hidden="true" />{t("publish")}</button><Link href={`/${locale}/admin/line/test-center`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)]"><FlaskConical className="size-3.5" aria-hidden="true" />{t("test")}</Link></div></div><div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><p className="text-xs leading-5 text-[var(--solar-ops-muted)]">{t("executionNote", { count: selected.executionCount })}</p>{selected.lastError ? <p className="mt-2 text-xs text-[#ff7b72]">{selected.lastError}</p> : null}</div></div>
      </section> : null}
      {!selected && rules.length ? <AdminEmptyState title={t("selectRule")} description={t("selectRuleDescription")} action={<button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)]"><Plus className="size-4" aria-hidden="true" />{t("newRule")}</button>} /> : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full px-3 text-sm" /></label>;
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number }) {
  return <label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || 0)))} className="w-full px-3 text-sm" /></label>;
}

function ConditionEditor({ condition, index, onChange, onRemove, t }: { condition: LineAutomationCondition; index: number; onChange: (index: number, condition: LineAutomationCondition) => void; onRemove: () => void; t: (key: string) => string }) {
  return <div className="rounded-md border border-[var(--solar-ops-border)] p-3"><div className="flex items-start gap-2"><select value={condition.type} onChange={(event) => onChange(index, conditionForType(event.target.value as LineAutomationCondition["type"]))} className="min-w-0 flex-1 px-3 text-sm"><option value="tag">{t("conditionTypes.tag")}</option><option value="field">{t("conditionTypes.field")}</option><option value="businessHours">{t("conditionTypes.businessHours")}</option><option value="takeover">{t("conditionTypes.takeover")}</option><option value="accountLinked">{t("conditionTypes.accountLinked")}</option><option value="conversationStatus">{t("conditionTypes.conversationStatus")}</option><option value="event">{t("conditionTypes.event")}</option></select><button type="button" onClick={onRemove} className="rounded-md p-2 text-[#ff7b72] hover:bg-[#f85149]/10" aria-label={t("removeCondition")}><Trash2 className="size-3.5" aria-hidden="true" /></button></div>{condition.type === "tag" ? <div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label={t("tag")} value={condition.tag} onChange={(value) => onChange(index, { ...condition, tag: value })} /><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("tagOperator")}</span><select value={condition.operator} onChange={(event) => onChange(index, { ...condition, operator: event.target.value as typeof condition.operator })} className="w-full px-3 text-sm"><option value="has">{t("hasTag")}</option><option value="missing">{t("missingTag")}</option></select></label></div> : null}{condition.type === "businessHours" ? <label className="mt-2 flex min-h-9 items-center gap-2 text-xs text-[var(--solar-ops-body)]"><input type="checkbox" checked={condition.isOpen} onChange={(event) => onChange(index, { ...condition, isOpen: event.target.checked })} className="size-4 accent-[#238636]" />{t("businessHoursOpen")}</label> : null}{condition.type === "takeover" ? <label className="mt-2 flex min-h-9 items-center gap-2 text-xs text-[var(--solar-ops-body)]"><input type="checkbox" checked={condition.isTakenOver} onChange={(event) => onChange(index, { ...condition, isTakenOver: event.target.checked })} className="size-4 accent-[#238636]" />{t("takeoverActive")}</label> : null}{condition.type === "accountLinked" ? <label className="mt-2 flex min-h-9 items-center gap-2 text-xs text-[var(--solar-ops-body)]"><input type="checkbox" checked={condition.isLinked} onChange={(event) => onChange(index, { ...condition, isLinked: event.target.checked })} className="size-4 accent-[#238636]" />{t("accountLinked")}</label> : null}{condition.type === "conversationStatus" ? <label className="mt-2 block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("conversationStatus")}</span><select value={condition.status} onChange={(event) => onChange(index, { ...condition, status: event.target.value as typeof condition.status })} className="w-full px-3 text-sm"><option value="UNASSIGNED">{t("conversationStatuses.UNASSIGNED")}</option><option value="OPEN">{t("conversationStatuses.OPEN")}</option><option value="RESOLVED">{t("conversationStatuses.RESOLVED")}</option><option value="CLOSED">{t("conversationStatuses.CLOSED")}</option></select></label> : null}{condition.type === "field" || condition.type === "event" ? <div className="mt-2 grid gap-2 sm:grid-cols-3"><Field label={t("field")} value={condition.field} onChange={(value) => onChange(index, { ...condition, field: value })} /><Field label={t("value")} value={condition.value} onChange={(value) => onChange(index, { ...condition, value })} /><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("matchMode")}</span><select value={condition.match} onChange={(event) => onChange(index, { ...condition, match: event.target.value as typeof condition.match })} className="w-full px-3 text-sm"><option value="exact">{t("matchModes.exact")}</option><option value="contains">{t("matchModes.contains")}</option><option value="startsWith">{t("matchModes.startsWith")}</option><option value="regex">{t("matchModes.regex")}</option></select></label></div> : null}</div>;
}

function ActionEditor({ action, onChange, onRemove, t }: { action: LineAutomationAction; onChange: (action: LineAutomationAction) => void; onRemove: () => void; t: (key: string) => string }) {
  const value = action.type === "sendText" ? action.text : action.type === "sendContent" ? action.contentId : action.type === "addTag" || action.type === "removeTag" ? action.tag : action.type === "assignStaff" ? action.staffId : action.type === "invokeDify" ? action.integrationId : action.type === "handoff" ? action.reason : action.type === "setRichMenu" ? action.richMenuId : action.type === "notify" ? action.message : "";
  return <div className="rounded-md border border-[var(--solar-ops-border)] p-3"><div className="flex items-start gap-2"><select value={action.type} onChange={(event) => onChange(actionForType(event.target.value as LineAutomationAction["type"]))} className="min-w-0 flex-1 px-3 text-sm"><option value="sendText">{t("actionTypes.sendText")}</option><option value="sendContent">{t("actionTypes.sendContent")}</option><option value="addTag">{t("actionTypes.addTag")}</option><option value="removeTag">{t("actionTypes.removeTag")}</option><option value="assignStaff">{t("actionTypes.assignStaff")}</option><option value="invokeDify">{t("actionTypes.invokeDify")}</option><option value="handoff">{t("actionTypes.handoff")}</option><option value="setAutomation">{t("actionTypes.setAutomation")}</option><option value="notify">{t("actionTypes.notify")}</option><option value="setRichMenu">{t("actionTypes.setRichMenu")}</option></select><button type="button" onClick={onRemove} className="rounded-md p-2 text-[#ff7b72] hover:bg-[#f85149]/10" aria-label={t("removeAction")}><Trash2 className="size-3.5" aria-hidden="true" /></button></div><div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">{action.type === "notify" ? <div className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("channel")}</span><span className="inline-flex min-h-9 items-center rounded-md border border-[var(--solar-ops-border)] px-3 font-normal text-[var(--solar-ops-muted)]">{t("inbox")}</span></div> : null}{action.type === "setAutomation" ? <label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("actionValue")}</span><select value={action.enabled ? "enabled" : "disabled"} onChange={(event) => onChange({ ...action, enabled: event.target.value === "enabled" })} className="w-full px-3 text-sm"><option value="enabled">{t("automationEnabled")}</option><option value="disabled">{t("automationDisabled")}</option></select></label> : <Field label={t("actionValue")} value={value} onChange={(nextValue) => onChange(updateActionValue(action, nextValue))} />}</div></div>;
}

function updateActionValue(action: LineAutomationAction, value: string): LineAutomationAction {
  if (action.type === "sendText") return { ...action, text: value };
  if (action.type === "sendContent") return { ...action, contentId: value };
  if (action.type === "addTag" || action.type === "removeTag") return { ...action, tag: value };
  if (action.type === "assignStaff") return { ...action, staffId: value };
  if (action.type === "invokeDify") return { ...action, integrationId: value };
  if (action.type === "handoff") return { ...action, reason: value };
  if (action.type === "setRichMenu") return { ...action, richMenuId: value };
  if (action.type === "notify") return { ...action, message: value };
  return action;
}
