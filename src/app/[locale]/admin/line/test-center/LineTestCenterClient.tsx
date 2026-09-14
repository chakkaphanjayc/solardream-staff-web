"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, FlaskConical, Play, Send } from "@/components/ui/icons";
import { simulateDifyConversation, type DifyIntegrationDto } from "@/app/actions/difyIntegration";
import { simulateLineAutomation, type LineAutomationRuleDto } from "@/app/actions/lineAutomation";
import { AdminErrorState, AdminStatusBadge } from "@/components/admin/AdminPrimitives";

type TestEventType = "follow" | "message" | "postback" | "accountLink" | "event" | "schedule";

type JsonFieldValue = string | number | boolean | null;
type DifyResult = Awaited<ReturnType<typeof simulateDifyConversation>>;
type AutomationResult = Awaited<ReturnType<typeof simulateLineAutomation>>;

function parseJsonRecord(value: string): { value: Record<string, JsonFieldValue>; error: string | null } {
  if (!value.trim()) return { value: {}, error: null };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { value: {}, error: "Use a JSON object." };
    const entries = Object.entries(parsed);
    if (entries.some(([, entry]) => entry !== null && typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean")) return { value: {}, error: "Use only text, number, boolean, or null values." };
    return { value: parsed as Record<string, JsonFieldValue>, error: null };
  } catch {
    return { value: {}, error: "The JSON object is invalid." };
  }
}

export default function LineTestCenterClient({
  initialRules,
  initialIntegrations,
  initialError,
}: {
  initialRules: LineAutomationRuleDto[];
  initialIntegrations: DifyIntegrationDto[];
  initialError: string | null;
}) {
  const t = useTranslations("AdminLineTestCenter");
  const [rules] = useState(initialRules);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [text, setText] = useState("hello");
  const [eventType, setEventType] = useState<TestEventType>("message");
  const [postbackData, setPostbackData] = useState("");
  const [tags, setTags] = useState("");
  const [fieldsJson, setFieldsJson] = useState("{}");
  const [eventFieldsJson, setEventFieldsJson] = useState("{}");
  const [isBusinessHours, setIsBusinessHours] = useState(true);
  const [humanTakeover, setHumanTakeover] = useState(false);
  const [accountLinked, setAccountLinked] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<"UNASSIGNED" | "OPEN" | "RESOLVED" | "CLOSED">("UNASSIGNED");
  const [mode, setMode] = useState<"draft" | "published">("draft");
  const [automationResult, setAutomationResult] = useState<AutomationResult | null>(null);
  const [difyId, setDifyId] = useState(initialIntegrations[0]?.id ?? "");
  const [difyQuery, setDifyQuery] = useState("What are the next steps for a solar consultation?");
  const [difyUser, setDifyUser] = useState("admin-test-user");
  const [difyConversationId, setDifyConversationId] = useState("");
  const [difyResult, setDifyResult] = useState<DifyResult | null>(null);
  const [isRunning, startRunning] = useTransition();

  const fields = useMemo(() => parseJsonRecord(fieldsJson), [fieldsJson]);
  const eventFields = useMemo(() => parseJsonRecord(eventFieldsJson), [eventFieldsJson]);

  const runAutomation = () => {
    if (fields.error || eventFields.error) {
      toast.error(fields.error || eventFields.error || t("invalidContext"));
      return;
    }
    startRunning(async () => {
      const result = await simulateLineAutomation({ text, eventType, postbackData: postbackData || null, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), fields: fields.value, eventFields: eventFields.value, isBusinessHours, humanTakeover, accountLinked, conversationStatus, mode, ruleIds: selectedRuleIds.length ? selectedRuleIds : undefined });
      setAutomationResult(result);
      if (!result.success) toast.error(result.error);
    });
  };

  const runDify = () => {
    if (!difyId) {
      toast.error(t("noDifyConnection"));
      return;
    }
    startRunning(async () => {
      const result = await simulateDifyConversation({ id: difyId, query: difyQuery, user: difyUser, conversationId: difyConversationId || null });
      setDifyResult(result);
      if (!result.success) toast.error(result.error);
    });
  };

  return (
    <div data-bagui="line-test-center" className="space-y-4">
      {initialError ? <AdminErrorState title={t("unavailable")} description={initialError} /> : null}
      <div className="flex items-start gap-3 rounded-lg border border-[#58a6ff]/40 bg-[#58a6ff]/10 px-4 py-3"><FlaskConical className="mt-0.5 size-5 shrink-0 text-[#79c0ff]" aria-hidden="true" /><div><p className="text-sm font-semibold text-[#79c0ff]">{t("safetyTitle")}</p><p className="mt-1 text-xs leading-5 text-[var(--solar-ops-body)]">{t("safetyDescription")}</p></div></div>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]" aria-labelledby="automation-simulation-heading">
        <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><div className="flex items-start justify-between gap-3"><div><h2 id="automation-simulation-heading" className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("simulationTitle")}</h2><p className="mt-1 text-xs text-[var(--solar-ops-muted)]">{t("simulationDescription")}</p></div><AdminStatusBadge value={mode === "draft" ? t("draftMode") : t("publishedMode")} tone={mode === "draft" ? "warning" : "info"} /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("eventType")}</span><select value={eventType} onChange={(event) => setEventType(event.target.value as TestEventType)} className="w-full px-3 text-sm"><option value="follow">{t("eventTypes.follow")}</option><option value="message">{t("eventTypes.message")}</option><option value="postback">{t("eventTypes.postback")}</option><option value="accountLink">{t("eventTypes.accountLink")}</option><option value="event">{t("eventTypes.event")}</option><option value="schedule">{t("eventTypes.schedule")}</option></select></label><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("mode")}</span><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="w-full px-3 text-sm"><option value="draft">{t("draftMode")}</option><option value="published">{t("publishedMode")}</option></select></label><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("conversationStatus")}</span><select value={conversationStatus} onChange={(event) => setConversationStatus(event.target.value as typeof conversationStatus)} className="w-full px-3 text-sm"><option value="UNASSIGNED">{t("conversationStatuses.UNASSIGNED")}</option><option value="OPEN">{t("conversationStatuses.OPEN")}</option><option value="RESOLVED">{t("conversationStatuses.RESOLVED")}</option><option value="CLOSED">{t("conversationStatuses.CLOSED")}</option></select></label><Field label={t("text")} value={text} onChange={setText} /><Field label={t("postbackData")} value={postbackData} onChange={setPostbackData} /><Field label={t("tags")} value={tags} onChange={setTags} /><Field label={t("fieldsJson")} value={fieldsJson} onChange={setFieldsJson} /><Field label={t("eventFieldsJson")} value={eventFieldsJson} onChange={setEventFieldsJson} /></div>
          <div className="mt-3 flex flex-wrap gap-4"><label className="flex min-h-9 items-center gap-2 text-xs text-[var(--solar-ops-body)]"><input type="checkbox" checked={isBusinessHours} onChange={(event) => setIsBusinessHours(event.target.checked)} className="size-4 accent-[#238636]" />{t("businessHours")}</label><label className="flex min-h-9 items-center gap-2 text-xs text-[var(--solar-ops-body)]"><input type="checkbox" checked={humanTakeover} onChange={(event) => setHumanTakeover(event.target.checked)} className="size-4 accent-[#238636]" />{t("humanTakeover")}</label><label className="flex min-h-9 items-center gap-2 text-xs text-[var(--solar-ops-body)]"><input type="checkbox" checked={accountLinked} onChange={(event) => setAccountLinked(event.target.checked)} className="size-4 accent-[#238636]" />{t("accountLinked")}</label></div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={runAutomation} disabled={isRunning} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3 text-sm font-semibold text-white disabled:opacity-50"><Play className="size-4" aria-hidden="true" />{isRunning ? t("running") : t("runSimulation")}</button><button type="button" onClick={() => { setSelectedRuleIds([]); setAutomationResult(null); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-sm font-semibold text-[var(--solar-ops-body)] hover:bg-[var(--solar-ops-hover)]">{t("clear")}</button></div>
        </div>
        <div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("ruleScope")}</h2><p className="mt-1 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("ruleScopeDescription")}</p><div className="mt-3 space-y-2">{rules.length ? rules.map((rule) => <label key={rule.id} className="flex items-start gap-2 rounded-md border border-[var(--solar-ops-border)] p-2.5 text-xs text-[var(--solar-ops-body)]"><input type="checkbox" checked={selectedRuleIds.includes(rule.id)} onChange={(event) => setSelectedRuleIds((current) => event.target.checked ? [...current, rule.id] : current.filter((id) => id !== rule.id))} className="mt-0.5 size-4 accent-[#238636]" /><span className="min-w-0"><span className="block font-semibold text-[var(--solar-ops-text)]">{rule.name}</span><span className="mt-0.5 block text-[var(--solar-ops-muted)]">{rule.status} · priority {rule.priority}</span></span></label>) : <p className="text-xs text-[var(--solar-ops-muted)]">{t("noRules")}</p>}</div></div>
      </section>

      {automationResult ? <section className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4" aria-live="polite"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#7ee787]" aria-hidden="true" /><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("simulationResult")}</h2></div>{automationResult.success ? <div className="mt-3 grid gap-4 lg:grid-cols-3"><div><p className="text-xs text-[var(--solar-ops-muted)]">{t("matchedRules")}</p><p className="mt-1 font-mono text-sm text-[#7ee787]">{automationResult.result.matchedRules.length ? automationResult.result.matchedRules.join(", ") : t("none")}</p></div><div><p className="text-xs text-[var(--solar-ops-muted)]">{t("actions")}</p><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--solar-ops-workspace)] p-2 text-xs text-[var(--solar-ops-body)]">{JSON.stringify(automationResult.result.actions, null, 2)}</pre></div><div><p className="text-xs text-[var(--solar-ops-muted)]">{t("reasons")}</p><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--solar-ops-workspace)] p-2 text-xs text-[var(--solar-ops-body)]">{JSON.stringify(automationResult.result.reasons, null, 2)}</pre></div></div> : <p className="mt-2 text-sm text-[#ff7b72]">{automationResult.error}</p>}</section> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.58fr)_minmax(18rem,0.42fr)]" aria-labelledby="dify-simulation-heading"><div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><div className="flex items-start justify-between gap-3"><div><h2 id="dify-simulation-heading" className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("difyTitle")}</h2><p className="mt-1 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("difyDescription")}</p></div><Send className="size-5 text-[var(--solar-ops-muted)]" aria-hidden="true" /></div>{initialIntegrations.length ? <div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("connection")}</span><select value={difyId} onChange={(event) => setDifyId(event.target.value)} className="w-full px-3 text-sm">{initialIntegrations.map((integration) => <option key={integration.id} value={integration.id}>{integration.name} · {integration.baseUrl}</option>)}</select></label><Field label={t("difyQuery")} value={difyQuery} onChange={setDifyQuery} /><Field label={t("difyUser")} value={difyUser} onChange={setDifyUser} /><Field label={t("conversationId")} value={difyConversationId} onChange={setDifyConversationId} /><button type="button" onClick={runDify} disabled={isRunning} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#58a6ff]/50 px-3 text-sm font-semibold text-[#79c0ff] disabled:opacity-50"><Send className="size-4" aria-hidden="true" />{t("runDify")}</button></div> : <p className="mt-4 rounded-md border border-dashed border-[var(--solar-ops-border)] p-3 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("noDifyConnection")}</p>}</div><div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("difyResult")}</h2>{difyResult ? difyResult.success ? <div className="mt-3 space-y-2 text-xs"><AdminStatusBadge value={t("connected")} tone="success" /><p className="whitespace-pre-wrap rounded-md bg-[var(--solar-ops-workspace)] p-3 leading-5 text-[var(--solar-ops-body)]">{difyResult.answer}</p><p className="font-mono text-[var(--solar-ops-muted)]">{difyResult.conversationId || "—"}</p></div> : <p className="mt-3 text-sm text-[#ff7b72]">{difyResult.error}</p> : <p className="mt-3 text-xs text-[var(--solar-ops-muted)]">{t("noResult")}</p>}</div></section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full px-3 text-sm" /></label>;
}
