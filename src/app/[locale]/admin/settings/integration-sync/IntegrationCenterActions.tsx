"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, WifiOff } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";

export function ERPNextConnectionButton() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  const check = async () => {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/v2/integrations/erpnext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "ERPNext connection failed.");
      setState("ok");
      setMessage("ERPNext responded successfully.");
    } catch (error: unknown) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "ERPNext connection failed.");
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button type="button" variant="outline" size="sm" onClick={() => void check()} disabled={state === "loading"} className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
        {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : state === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
        Check connection
      </Button>
      {message ? <p className={"max-w-xs text-right text-xs " + (state === "ok" ? "text-emerald-700" : "text-rose-700")} role={state === "error" ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}

export function RetryOutboxButton({ eventId, disabled }: { eventId: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const retry = async () => {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/v2/integrations/erpnext/outbox/" + eventId, { method: "POST" });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The event could not be queued.");
      setState("done");
      setMessage("Queued");
    } catch (error: unknown) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Retry failed.");
    }
  };

  if (state === "done") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {message}</span>;
  if (state === "error") return <button type="button" onClick={() => void retry()} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 underline underline-offset-2" aria-label={message}>{message}</button>;
  return <Button type="button" variant="quiet" size="sm" onClick={() => void retry()} disabled={disabled || state === "loading"} className="min-h-8 px-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-950">{state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} Retry</Button>;
}

export function IntegrationUnavailableNotice() {
  return <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> ERPNext credentials or the installation sync flag are not active. Local field operations remain available.</div>;
}
