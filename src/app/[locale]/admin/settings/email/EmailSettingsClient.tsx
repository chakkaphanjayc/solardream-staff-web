"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Mail, Save, Send, Settings2 } from "@/components/ui/icons";
import { toast } from "sonner";

import { saveEmailAutomation, type EmailAutomationSettings } from "@/app/actions/emailSettings";
import { cn } from "@/lib/utils";

type ListmonkTemplate = { id: number; name: string; subject: string; type: string };

export default function EmailSettingsClient({ initialAutomations }: { initialAutomations: EmailAutomationSettings[] | null }) {
  const [automations, setAutomations] = useState<EmailAutomationSettings[]>(initialAutomations ?? []);
  const [activeKey, setActiveKey] = useState(automations[0]?.templateKey ?? "welcome");
  const [templates, setTemplates] = useState<ListmonkTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const [testEmail, setTestEmail] = useState("");
  const active = useMemo(() => automations.find((item) => item.templateKey === activeKey) ?? automations[0], [activeKey, automations]);

  useEffect(() => {
    void fetch("/api/listmonk/templates", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!response.ok || !body?.success) throw new Error(body?.error || "Listmonk templates are unavailable.");
        setTemplates(body.templates);
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Listmonk templates are unavailable."))
      .finally(() => setIsLoadingTemplates(false));
  }, []);

  const updateActive = (patch: Partial<EmailAutomationSettings>) => {
    if (!active) return;
    setAutomations((current) => current.map((item) => item.templateKey === active.templateKey ? { ...item, ...patch } : item));
  };

  const save = () => {
    if (!active) return;
    startSaving(async () => {
      const result = await saveEmailAutomation({
        templateKey: active.templateKey,
        isEnabled: active.isEnabled,
        listmonkTemplateId: active.listmonkTemplateId,
      });
      if (!result.success) {
        toast.error(result.error || "Could not save the Listmonk mapping.");
        return;
      }
      toast.success(`${active.name} mapping saved.`);
    });
  };

  const sendTest = () => {
    if (!active?.listmonkTemplateId || !testEmail.trim()) return;
    startTesting(async () => {
      try {
        const response = await fetch("/api/admin/listmonk/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail.trim(),
            templateId: active.listmonkTemplateId,
          }),
        });
        const body: unknown = await response.json().catch(() => null);
        const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
          ? body.message
          : typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error
            : "Listmonk could not accept the test delivery.";
        if (!response.ok) throw new Error(message);
        toast.success(message);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Listmonk could not accept the test delivery.");
      }
    });
  };

  if (!active) return <p className="text-sm text-gray-400">No email automations are configured.</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-black tracking-[-0.03em] text-gray-100">Email automation</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">Map SolarDream events to transactional templates managed in Listmonk.</p>
        </div>
        <a href="https://mail.solar-dream.org" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-800 px-5 text-sm font-bold text-gray-100 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]">
          Open Listmonk <ExternalLink className="h-4 w-4" />
        </a>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-xl bg-[#0F172A] p-3">
          {automations.map((automation) => (
            <button key={automation.templateKey} type="button" onClick={() => setActiveKey(automation.templateKey)} className={cn("w-full rounded-xl px-4 py-3 text-left transition", automation.templateKey === active.templateKey ? "bg-[#B7D1EA] text-[#0F172A]" : "text-gray-200 hover:bg-[#0B1121]")}>
              <span className="block text-sm font-bold">{automation.name}</span>
              <span className={cn("mt-1 block text-xs", automation.templateKey === active.templateKey ? "text-slate-700" : "text-gray-400")}>{automation.isEnabled ? "Enabled" : "Disabled"}</span>
            </button>
          ))}
        </aside>

        <section className="rounded-xl bg-[#0F172A] p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-gray-100"><Mail className="h-5 w-5 text-[#B7D1EA]" />{active.name}</h2>
              <p className="mt-1 text-sm leading-6 text-gray-400">{active.description}</p>
              <p className="mt-2 text-xs font-semibold text-gray-300">Trigger: {active.trigger}</p>
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-full bg-[#0B1121] px-4 text-sm font-bold text-gray-100">
              <span>{active.isEnabled ? "Enabled" : "Disabled"}</span>
              <input type="checkbox" checked={active.isEnabled} onChange={(event) => updateActive({ isEnabled: event.target.checked })} className="h-4 w-4 rounded border-slate-800 text-sky-600 focus:ring-[#B7D1EA]" />
            </label>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,.85fr)]">
            <label className="space-y-2">
              <span className="text-sm font-bold text-gray-100">Listmonk transactional template</span>
              <select value={active.listmonkTemplateId?.toString() ?? ""} onChange={(event) => updateActive({ listmonkTemplateId: event.target.value ? Number(event.target.value) : null })} disabled={isLoadingTemplates} className="min-h-12 w-full rounded-xl border border-slate-800 bg-[#0F172A] px-3 text-sm text-gray-100 outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA] disabled:opacity-60">
                <option value="">No template mapped</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.id} · {template.name}{template.subject ? ` — ${template.subject}` : ""}</option>)}
              </select>
              <span className="block text-xs leading-5 text-gray-400">Only transactional templates are listed. Disabled or unmapped events never send an email.</span>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-gray-100">Template ID</span>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={active.listmonkTemplateId?.toString() ?? ""} onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "");
                updateActive({ listmonkTemplateId: value ? Number(value) : null });
              }} placeholder="e.g. 3" className="min-h-12 w-full rounded-xl border border-slate-800 bg-[#0F172A] px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]" />
              <span className="block text-xs leading-5 text-gray-400">Use this when your Listmonk API role cannot list templates. Enter the ID of a <code className="text-[#B7D1EA]">tx</code> template.</span>
            </label>

            <div className="rounded-xl bg-[#0B1121] p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-gray-100"><Settings2 className="h-4 w-4 text-[#B7D1EA]" />Use in Listmonk</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {active.variables.map((variable) => <code key={variable} className="rounded-lg bg-[#0F172A] px-2 py-1 text-xs text-[#B7D1EA]">{`{{ .Tx.Data.${variable} }}`}</code>)}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={save} disabled={isSaving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#B7D1EA] px-5 text-sm font-black text-[#0F172A] transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{isSaving ? "Saving..." : "Save mapping"}</button>
          </div>
          {active.listmonkTemplateId && <p className="mt-4 flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 className="h-4 w-4" />Template ID {active.listmonkTemplateId} is mapped.</p>}
        </section>
      </div>

      <section className="border-t border-slate-800 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-2">
            <span className="text-sm font-bold text-gray-100">Test delivery recipient</span>
            <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="you@example.com" className="min-h-12 w-full rounded-xl border border-slate-800 bg-[#0F172A] px-3 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]" />
          </label>
          <button type="button" onClick={sendTest} disabled={isTesting || !active.listmonkTemplateId || !testEmail.trim()} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#B7D1EA] px-5 text-sm font-black text-[#B7D1EA] transition hover:bg-[#B7D1EA] hover:text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" />{isTesting ? "Sending..." : "Send test"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-400">Sends the selected template directly through Listmonk using sample values. Save the event mapping separately before enabling production delivery.</p>
      </section>
    </div>
  );
}
