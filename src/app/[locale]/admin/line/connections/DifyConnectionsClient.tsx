"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Plus, Save, ShieldCheck, Wifi } from "@/components/ui/icons";
import { saveDifyIntegration, testDifyIntegration, type DifyIntegrationDto } from "@/app/actions/difyIntegration";
import { AdminDataTable, AdminEmptyState, AdminErrorState, AdminStatusBadge } from "@/components/admin/AdminPrimitives";

function emptyIntegration(): DifyIntegrationDto {
  return { id: "", name: "New Dify connection", baseUrl: "", appType: "chat", apiKeyMasked: null, inputMapping: { query: "query", user: "user" }, timeoutMs: 12000, fallbackContentId: null, enabled: false, lastTestedAt: null, lastTestStatus: null, lastTestError: null, updatedAt: new Date().toISOString() };
}

export default function DifyConnectionsClient({ initialIntegrations, initialError }: { initialIntegrations: DifyIntegrationDto[]; initialError: string | null }) {
  const t = useTranslations("AdminLineConnections");
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [selected, setSelected] = useState<DifyIntegrationDto | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [appType, setAppType] = useState<"chat" | "completion">("chat");
  const [apiKey, setApiKey] = useState("");
  const [mappingJson, setMappingJson] = useState('{"query":"query","user":"user"}');
  const [timeoutMs, setTimeoutMs] = useState(12000);
  const [fallbackContentId, setFallbackContentId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [isWorking, startWorking] = useTransition();

  const selectIntegration = useCallback((integration: DifyIntegrationDto) => {
    setSelected(integration);
    setName(integration.name);
    setBaseUrl(integration.baseUrl);
    setAppType(integration.appType);
    setApiKey("");
    setMappingJson(JSON.stringify(integration.inputMapping, null, 2));
    setTimeoutMs(integration.timeoutMs);
    setFallbackContentId(integration.fallbackContentId || "");
    setEnabled(integration.enabled);
  }, []);

  const createNew = () => selectIntegration(emptyIntegration());

  const parseMapping = () => {
    try {
      const parsed: unknown = JSON.parse(mappingJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const entries = Object.entries(parsed);
      if (entries.some(([key, value]) => !key.trim() || typeof value !== "string" || !value.trim())) return null;
      return Object.fromEntries(entries) as Record<string, string>;
    } catch {
      return null;
    }
  };

  const save = () => {
    const inputMapping = parseMapping();
    if (!inputMapping) {
      toast.error(t("invalidMapping"));
      return;
    }
    startWorking(async () => {
      const result = await saveDifyIntegration({ id: selected?.id || undefined, name, baseUrl, appType, apiKey, inputMapping, timeoutMs, fallbackContentId: fallbackContentId || null, enabled });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSelected(result.integration);
      setIntegrations((current) => current.some((item) => item.id === result.integration.id) ? current.map((item) => item.id === result.integration.id ? result.integration : item) : [result.integration, ...current]);
      setApiKey("");
      toast.success(t("saved"));
    });
  };

  const test = () => {
    if (!selected?.id) {
      toast.error(t("saveBeforeTest"));
      return;
    }
    startWorking(async () => {
      const result = await testDifyIntegration(selected.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(t("connectionTestPassed"));
    });
  };

  return <div data-bagui="dify-connections" className="space-y-4"><div className="flex items-start gap-3 rounded-lg border border-[#3fb950]/35 bg-[#238636]/10 px-4 py-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#7ee787]" aria-hidden="true" /><p className="text-xs leading-5 text-[var(--solar-ops-body)]">{t("difySafety")}</p></div>{initialError ? <AdminErrorState title={t("unavailable")} description={initialError} /> : null}<div className="flex justify-end"><button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white hover:bg-[var(--solar-ops-green-hover)]"><Plus className="size-4" aria-hidden="true" />{t("newConnection")}</button></div>{integrations.length ? <AdminDataTable rows={integrations} caption={t("library")} columns={[{ key: "name", label: t("name"), render: (integration) => <button type="button" onClick={() => selectIntegration(integration)} className="text-left font-semibold text-[var(--solar-ops-text)] underline-offset-4 hover:underline">{integration.name}</button> }, { key: "url", label: t("baseUrl"), render: (integration) => <span className="break-all text-xs text-[var(--solar-ops-muted)]">{integration.baseUrl}</span> }, { key: "type", label: t("appType"), render: (integration) => <span className="font-mono text-xs">{integration.appType}</span> }, { key: "status", label: t("status"), render: (integration) => <AdminStatusBadge value={integration.enabled ? t("enabled") : t("disabled")} tone={integration.enabled ? "success" : "neutral"} /> }, { key: "key", label: t("apiKey"), render: (integration) => <span className="font-mono text-xs text-[var(--solar-ops-muted)]">{integration.apiKeyMasked || t("notConfigured")}</span> }]} /> : <AdminEmptyState title={t("emptyTitle")} description={t("emptyDescription")} action={<button type="button" onClick={createNew} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3.5 text-sm font-semibold text-white"><Plus className="size-4" aria-hidden="true" />{t("newConnection")}</button>} />}{selected ? <section className="grid gap-4 lg:grid-cols-[minmax(0,0.62fr)_minmax(18rem,0.38fr)]" aria-labelledby="dify-editor-heading"><div className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><div className="flex items-start justify-between gap-3"><div><h2 id="dify-editor-heading" className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("editor")}</h2><p className="mt-1 text-xs leading-5 text-[var(--solar-ops-muted)]">{t("editorDescription")}</p></div><Wifi className="size-5 text-[var(--solar-ops-muted)]" aria-hidden="true" /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label={t("name")} value={name} onChange={setName} /><Field label={t("baseUrl")} value={baseUrl} onChange={setBaseUrl} /><label className="text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("appType")}</span><select value={appType} onChange={(event) => setAppType(event.target.value as typeof appType)} className="w-full px-3 text-sm"><option value="chat">chat</option><option value="completion">completion</option></select></label><Field label={t("timeout")} value={String(timeoutMs)} onChange={(value) => setTimeoutMs(Math.min(60000, Math.max(1000, Number(value) || 1000)))} type="number" /><label className="text-xs font-semibold text-[var(--solar-ops-body)] sm:col-span-2"><span className="mb-1.5 block">{t("apiKey")}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={selected.apiKeyMasked ? t("keepExistingKey", { masked: selected.apiKeyMasked }) : t("enterKey")} autoComplete="new-password" className="w-full px-3 text-sm" /></label><Field label={t("fallbackContentId")} value={fallbackContentId} onChange={setFallbackContentId} /><label className="flex min-h-10 items-center gap-2 self-end text-xs font-semibold text-[var(--solar-ops-body)]"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-[#238636]" />{t("enabled")}</label></div><label className="mt-3 block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{t("inputMapping")}</span><textarea value={mappingJson} onChange={(event) => setMappingJson(event.target.value)} className="min-h-28 w-full rounded-md border border-[var(--solar-ops-border)] bg-[var(--solar-ops-workspace)] p-3 font-mono text-xs text-[var(--solar-ops-body)]" /></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={save} disabled={isWorking} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--solar-ops-green)] px-3 text-sm font-semibold text-white disabled:opacity-50"><Save className="size-4" aria-hidden="true" />{t("save")}</button><button type="button" onClick={test} disabled={isWorking || !selected.id} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#58a6ff]/50 px-3 text-sm font-semibold text-[#79c0ff] disabled:opacity-50"><Wifi className="size-4" aria-hidden="true" />{t("testConnection")}</button></div></div><aside className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4"><h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">{t("testStatus")}</h2>{selected.lastTestStatus === "CONNECTED" ? <div className="mt-3 flex items-center gap-2 text-sm text-[#7ee787]"><CheckCircle2 className="size-4" aria-hidden="true" />{t("connected")}</div> : <p className="mt-3 text-xs leading-5 text-[var(--solar-ops-muted)]">{selected.lastTestError || t("notTested")}</p>}</aside></section> : null}</div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" }) {
  return <label className="block text-xs font-semibold text-[var(--solar-ops-body)]"><span className="mb-1.5 block">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full px-3 text-sm" /></label>;
}
