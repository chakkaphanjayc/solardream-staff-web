"use client";

import { Check, CheckCircle2, Circle, Clock3, ImageIcon, LockKeyhole, Upload } from "@/components/ui/icons";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { ClientInstallationChecklistItem, ClientInstallationSnapshot, ClientInstallationTask } from "@/types/proposals";
import { INSTALLATION_FIELD_STAGES } from "@/types/techPortal";

function idempotencyKey(scope: string) {
  return `${scope}:${crypto.randomUUID()}`;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || fallback;
}

function uploadEvidence(file: File, itemId: string, coordinate: GeolocationCoordinates | null, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.set("itemId", itemId);
    form.set("file", file);
    form.set("idempotencyKey", idempotencyKey("evidence"));
    form.set("capturedAt", new Date().toISOString());
    if (coordinate) {
      form.set("latitude", String(coordinate.latitude));
      form.set("longitude", String(coordinate.longitude));
    }
    const request = new XMLHttpRequest();
    request.open("POST", "/api/installations/evidence");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Evidence upload failed."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        try { reject(new Error((JSON.parse(request.responseText) as { error?: string }).error || "Evidence upload failed.")); }
        catch { reject(new Error("Evidence upload failed.")); }
      }
    };
    request.send(form);
  });
}

function optionalPosition() {
  return new Promise<GeolocationCoordinates | null>((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((position) => resolve(position.coords), () => resolve(null), { enableHighAccuracy: true, timeout: 5_000, maximumAge: 30_000 });
  });
}

function TaskChecklistPanel({ task, refresh }: { task: ClientInstallationTask; refresh: () => Promise<void> }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});
  const [amendLabel, setAmendLabel] = useState<Record<string, string>>({});
  const [amendReason, setAmendReason] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Record<string, "PASS" | "FAIL" | "NA">>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const run = async (key: string, action: () => Promise<Response>) => {
    setBusyKey(key);
    setError(null);
    try {
      const response = await action();
      if (!response.ok) throw new Error(await responseError(response, "The installation update failed."));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The installation update failed.");
      await refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const upload = async (item: ClientInstallationChecklistItem, file: File | null) => {
    if (!file) return;
    setBusyKey(`upload:${item.id}`);
    setProgress(0);
    setError(null);
    try {
      await uploadEvidence(file, item.id, await optionalPosition(), setProgress);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence upload failed.");
      await refresh();
    } finally {
      setBusyKey(null);
      setProgress(0);
    }
  };

  return (
    <div className="mt-4 border-t border-[#F7F6F3] pt-4">
      {error ? <p role="alert" className="mb-3 rounded-[16px] border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p> : null}
      <ul className="space-y-3">
        {task.checklist.map((item) => {
          const verified = item.status.toUpperCase() === "VERIFIED";
          const readyEvidence = item.evidence.filter((evidence) => evidence.status === "READY");
          const canExecute = task.capabilities.canExecute && !verified;
          const canSetOutcome = !verified && (canExecute || task.capabilities.canReview);
          const selectedOutcome = outcome[item.id] || (canExecute ? "PASS" : "NA");
          const itemRemarks = remarks[item.id] || "";
          const needsEvidence = selectedOutcome !== "NA" && item.evidenceRequired;
          const remarksRequired = selectedOutcome === "NA" || selectedOutcome === "FAIL";
          return (
            <li key={item.id} className="rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 shadow-sm">
              <div className="flex min-h-11 items-center gap-3 text-xs font-bold text-[#2E2C27]">
                {verified ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4F7FA8] stroke-[2.5]" aria-hidden /> : <LockKeyhole className="h-4 w-4 shrink-0 text-[#8E8B83] stroke-[2]" aria-hidden />}
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.evidenceRequired && item.outcome !== "NA" ? <span className="inline-flex items-center gap-1 rounded-full bg-[#DCE8F5] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#4F7FA8]"><ImageIcon className="h-3.5 w-3.5" aria-hidden /> {readyEvidence.length > 0 ? "Ready" : "Required"}</span> : null}
              </div>

              {verified ? (
                <div className={cn("mt-2 rounded-[16px] border p-3 text-xs", item.outcome === "FAIL" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-[#F7F6F3] bg-[#E6E3DC] text-[#2E2C27]")}>
                  <p className="font-bold">Outcome: {item.outcome || "VERIFIED"}</p>
                  {item.remarks ? <p className="mt-1 font-medium">Remarks: {item.remarks}</p> : null}
                  <p className="mt-1 text-[10px] font-mono opacity-80">Verified {item.verifiedAt ? new Date(item.verifiedAt).toLocaleString() : ""}{item.verifiedByUserId ? ` by ${item.verifiedByUserId}` : ""}</p>
                </div>
              ) : null}

              {canSetOutcome ? (
                <fieldset className="mt-3">
                  <legend className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">Checklist outcome</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(canExecute ? ["PASS", "FAIL"] as const : []).map((value) => (
                      <label key={value} className={cn("flex min-h-10 cursor-pointer items-center justify-center rounded-full border px-4 text-xs font-bold uppercase transition-all", selectedOutcome === value ? "border-[#7CA8D0] bg-[#B7D1EA] text-white shadow-sm" : "border-[#CBC7BE] bg-[#F0EEE9] text-[#4E4B44] hover:bg-[#DCE8F5] hover:text-[#2E2C27]")}>
                        <input className="sr-only" type="radio" name={`outcome-${item.id}`} value={value} checked={selectedOutcome === value} onChange={() => setOutcome((current) => ({ ...current, [item.id]: value }))} />
                        {value}
                      </label>
                    ))}
                    {(item.allowsNa || task.capabilities.canReview) ? (
                      <label className={cn("flex min-h-10 cursor-pointer items-center justify-center rounded-full border px-4 text-xs font-bold uppercase transition-all", selectedOutcome === "NA" ? "border-[#7CA8D0] bg-[#B7D1EA] text-white shadow-sm" : "border-[#CBC7BE] bg-[#F0EEE9] text-[#4E4B44] hover:bg-[#DCE8F5] hover:text-[#2E2C27]")}>
                        <input className="sr-only" type="radio" name={`outcome-${item.id}`} value="NA" checked={selectedOutcome === "NA"} onChange={() => setOutcome((current) => ({ ...current, [item.id]: "NA" }))} />
                        N/A
                      </label>
                    ) : null}
                  </div>
                  <label className="mt-3 block text-xs font-bold uppercase text-[#4E4B44]">
                    Remarks {remarksRequired ? "(required)" : "(optional)"}
                    <textarea value={itemRemarks} onChange={(event) => setRemarks((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 min-h-20 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] p-3 text-xs font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]" required={remarksRequired} />
                  </label>
                </fieldset>
              ) : null}

              {canExecute && task.capabilities.canUploadEvidence && needsEvidence ? (
                <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-5 text-xs font-bold text-[#2E2C27] shadow-sm transition hover:bg-[#DCE8F5] active:scale-95">
                  <Upload className="h-4 w-4 text-[#4F7FA8]" aria-hidden />
                  {busyKey === `upload:${item.id}` ? `Uploading ${progress}%` : readyEvidence.length > 0 ? "Replace evidence" : "Capture evidence"}
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" disabled={busyKey !== null} onChange={(event) => void upload(item, event.currentTarget.files?.[0] || null)} />
                </label>
              ) : null}

              {canSetOutcome ? (
                <button type="button" disabled={busyKey !== null || (needsEvidence && readyEvidence.length === 0) || (remarksRequired && itemRemarks.trim().length < 3)} onClick={() => void run(`verify:${item.id}`, () => fetch(`/api/installations/checklist/${item.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json", "idempotency-key": idempotencyKey("checklist") }, body: JSON.stringify({ outcome: selectedOutcome, remarks: itemRemarks.trim() || undefined }) }))} className="mt-2 inline-flex min-h-10 items-center justify-center rounded-full bg-[#B7D1EA] px-5 text-xs font-bold uppercase text-white shadow-sm transition hover:bg-[#A5C2DE] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                  {busyKey === `verify:${item.id}` ? "Saving…" : `Submit ${selectedOutcome}`}
                </button>
              ) : null}

              {task.capabilities.canReview && item.evidence.map((evidence) => (
                <div key={evidence.id} className="mt-3 rounded-[16px] border border-[#F7F6F3] bg-[#E6E3DC] p-3 shadow-sm">
                  <p className="text-xs font-bold uppercase text-[#2E2C27]">Evidence {evidence.status}</p>
                  <label className="mt-2 block text-xs font-medium text-[#4E4B44]">Review reason
                    <textarea value={reviewReason[evidence.id] || ""} onChange={(event) => setReviewReason((current) => ({ ...current, [evidence.id]: event.target.value }))} className="mt-1 min-h-20 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] p-2 text-xs font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]" required />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busyKey !== null || !(reviewReason[evidence.id] || "").trim()} onClick={() => void run(`review:${evidence.id}`, () => fetch("/api/installations/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: evidence.id, decision: "READY", reason: reviewReason[evidence.id], idempotencyKey: idempotencyKey("review") }) }))} className="min-h-9 rounded-full bg-[#B7D1EA] px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#A5C2DE] active:scale-95 disabled:opacity-50">Approve</button>
                    {task.capabilities.canReject ? <button type="button" disabled={busyKey !== null || !(reviewReason[evidence.id] || "").trim()} onClick={() => void run(`reject:${evidence.id}`, () => fetch("/api/installations/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: evidence.id, decision: "REJECTED", reason: reviewReason[evidence.id], idempotencyKey: idempotencyKey("review") }) }))} className="min-h-9 rounded-full bg-rose-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-rose-700 active:scale-95 disabled:opacity-50">Reject</button> : null}
                  </div>
                </div>
              ))}

              {task.capabilities.canAmend && verified ? (
                <div className="mt-3 grid gap-2">
                  <input aria-label="Corrected checklist label" value={amendLabel[item.id] || ""} onChange={(event) => setAmendLabel((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Required correction" className="min-h-10 flex-1 rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-3.5 text-xs font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]" />
                  <textarea aria-label="Amendment reason" value={amendReason[item.id] || ""} onChange={(event) => setAmendReason((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Reason for amendment" className="min-h-20 rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] p-3 text-xs font-semibold text-[#2E2C27] outline-none transition placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]" required />
                  <button type="button" disabled={busyKey !== null || (amendLabel[item.id] || "").trim().length < 3 || (amendReason[item.id] || "").trim().length < 3} onClick={() => void run(`amend:${item.id}`, () => fetch("/api/installations/amend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, label: amendLabel[item.id], evidenceRequired: item.evidenceRequired, allowsNa: item.allowsNa, reason: amendReason[item.id], idempotencyKey: idempotencyKey("amend") }) }))} className="min-h-10 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 text-xs font-bold text-[#2E2C27] shadow-sm hover:bg-[#DCE8F5] active:scale-95 disabled:opacity-50">Amend item</button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {task.capabilities.canExecute ? (
        <button type="button" disabled={busyKey !== null} onClick={() => void run(`task:${task.id}`, () => fetch(`/api/installations/tasks/${task.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json", "idempotency-key": idempotencyKey("task") } }))} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#B7D1EA] px-4 text-xs font-bold uppercase text-white shadow-sm transition hover:bg-[#A5C2DE] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
          {busyKey === `task:${task.id}` ? "Submitting task…" : "Complete task"}
        </button>
      ) : null}
    </div>
  );
}

export function ProjectTaskStepper({ installation, refresh }: { installation: ClientInstallationSnapshot | null; refresh: () => Promise<void> }) {
  if (!installation) {
    return (
      <div className="rounded-[24px] border border-dashed border-[#CBC7BE] bg-[#E6E3DC] p-6 text-center text-xs font-medium text-[#4E4B44]">
        ไม่มีข้อมูลความคืบหน้าการติดตั้ง (No installation snapshot available)
      </div>
    );
  }

  const completed = installation.tasks.filter((task) => task.status.toUpperCase() === "COMPLETED").length;
  const total = installation.tasks.length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
  const canonicalItems = installation.tasks.flatMap((task) => task.checklist);
  const isCanonicalWorkflow = canonicalItems.length > 0;
  const legacyPizzaTrackerStages = [
    { stage: 1, label: "ลงนามสัญญา", desc: "อนุมัติใบเสนอราคา", isDone: true },
    { stage: 2, label: "ยื่นขออนุญาต", desc: "เอกสาร กฟน./กฟภ.", isDone: completed >= 1 },
    { stage: 3, label: "จัดเตรียมอุปกรณ์", desc: "แผง & อินเวอร์เตอร์", isDone: completed >= 2 },
    { stage: 4, label: "เข้าติดตั้งระบบ", desc: "เดินสายไฟ & โครงสร้าง", isDone: completed >= 3 },
    { stage: 5, label: "ส่งมอบงาน", desc: "ทดสอบขนานไฟ & PDF", isDone: completed >= installation.tasks.length },
  ];
  const pizzaTrackerStages = isCanonicalWorkflow
    ? INSTALLATION_FIELD_STAGES.map((stage) => ({
      stage: stage.sequence,
      label: stage.titleTh,
      desc: stage.code.replaceAll("_", " "),
      isDone: canonicalItems.some((item) => (item.itemCode === stage.itemCode || stage.aliases.includes(item.itemCode)) && item.status.toUpperCase() === "VERIFIED"),
    }))
    : legacyPizzaTrackerStages;
  const currentStage = pizzaTrackerStages.find((stage) => !stage.isDone)?.stage ?? null;
  const permitStatus = installation.project.permitStatus.toUpperCase();
  const permitLabel = permitStatus === "APPROVED" ? "Approved" : permitStatus === "SUBMITTED" ? "Submitted" : "Not started";

  return (
    <section aria-labelledby="installation-progress-title" className="mt-6 rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] p-5 sm:p-6 space-y-6 shadow-sm">
      {/* 5-Stage Solar Horizontal Panel Tracker UI */}
      <div className="rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-[#2E2C27]">
            ☀️ สถานะการดำเนินงาน (Installation Lifecycle)
          </p>
          <span className="text-xs font-mono font-bold text-[#2E2C27] bg-[#DCE8F5] px-3.5 py-1 rounded-full border border-[#CBC7BE]">
            {progress}% COMPLETED
          </span>
        </div>

        {/* Horizontal Progress Line */}
        <div className="relative pt-2 pb-1">
          <div className="absolute left-0 top-6 h-3 w-full bg-[#F7F6F3] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#B7D1EA] transition-all duration-500 ease-expo"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className={cn("relative z-10 gap-1 text-center", isCanonicalWorkflow ? "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" : "grid grid-cols-5")}>
            {pizzaTrackerStages.map((st) => (
              <div key={st.stage} aria-current={st.stage === currentStage ? "step" : undefined} className="flex flex-col items-center space-y-1.5">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all",
                    st.isDone
                      ? "bg-[#B7D1EA] text-white shadow-sm"
                      : st.stage === currentStage
                        ? "border-2 border-[#7CA8D0] bg-[#DCE8F5] text-[#2E2C27] shadow-sm"
                        : "border border-[#CBC7BE] bg-[#F0EEE9] text-[#8E8B83]",
                  )}
                >
                  {st.isDone ? <Check className="h-4 w-4 stroke-[2.5]" /> : st.stage}
                </div>
                <p className={cn("max-w-full truncate px-1 text-[11px] leading-tight", st.isDone ? "font-bold text-[#2E2C27]" : st.stage === currentStage ? "font-bold text-[#2E2C27]" : "font-medium text-[#4E4B44]")}>
                  {st.label}
                </p>
                <p className="text-[9px] font-medium text-[#8E8B83] hidden sm:block">
                  {st.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] px-4 py-3 text-xs font-medium text-[#4E4B44] shadow-sm">
        <span className="font-bold text-[#2E2C27]">Permit</span>
        <span className={cn("rounded-full px-3 py-0.5 text-xs font-bold uppercase", permitStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" : permitStatus === "SUBMITTED" ? "bg-amber-100 text-amber-800" : "bg-[#F0EEE9] text-[#4E4B44] border border-[#CBC7BE]")}>{permitLabel}</span>
        {installation.project.permitAuthority ? <span>{installation.project.permitAuthority}</span> : null}
        {installation.project.permitApplicationNumber ? <span>{installation.project.permitApplicationNumber}</span> : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#4F7FA8]">Installation project · {installation.actor.role}</p>
          <h2 id="installation-progress-title" className="mt-1 text-lg font-bold uppercase text-[#2E2C27]">Project task progress</h2>
          <p className="mt-1 text-xs font-medium text-[#4E4B44]">Live progress synchronized with the installation team.</p>
        </div>
        <p className="text-xs font-mono font-bold text-[#2E2C27] bg-[#DCE8F5] px-3.5 py-1 rounded-full border border-[#CBC7BE]">{completed}/{total} complete</p>
      </div>

      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#F7F6F3]" aria-label={`${progress}% complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className="h-full bg-[#B7D1EA] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>

      <ol className="mt-6 space-y-0">
        {installation.tasks.map((task, index) => {
          const status = task.status.toUpperCase();
          const isComplete = status === "COMPLETED";
          const isActive = !isComplete && task.capabilities.dependencyReady;
          const expands = task.capabilities.canExecute || task.capabilities.canReview || task.capabilities.canAmend;
          return (
            <li key={task.id} className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-3 pb-6 last:pb-0">
              {index < installation.tasks.length - 1 ? <span aria-hidden className={cn("absolute left-[21px] top-10 h-[calc(100%-1rem)] w-0.5", isComplete ? "bg-[#B7D1EA]" : "bg-[#F7F6F3]")} /> : null}
              <span className={cn("relative z-10 flex h-11 w-11 items-center justify-center rounded-full transition-all", isComplete ? "bg-[#B7D1EA] text-white shadow-sm" : isActive ? "border-2 border-[#7CA8D0] bg-[#DCE8F5] text-[#2E2C27] shadow-sm" : "border border-[#CBC7BE] bg-[#F0EEE9] text-[#8E8B83]")}>
                {isComplete ? <Check className="h-5 w-5 stroke-[2.5]" aria-hidden /> : isActive ? <Clock3 className="h-5 w-5 stroke-[2.5] text-[#4F7FA8]" aria-hidden /> : <Circle className="h-4 w-4 stroke-[2]" aria-hidden />}
              </span>
              <div className="min-w-0 rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#2E2C27] uppercase">{task.title}</p>
                    <p className="mt-1 text-xs font-mono font-medium text-[#4E4B44]">{task.taskCode.replaceAll("_", " ")}</p>
                  </div>
                  <span className={cn("rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide", isComplete ? "bg-emerald-100 text-emerald-800" : isActive ? "bg-[#DCE8F5] text-[#4F7FA8]" : "bg-[#F0EEE9] border border-[#CBC7BE] text-[#8E8B83]")}>
                    {isComplete ? "Completed" : isActive ? "In progress" : "Locked"}
                  </span>
                </div>
                {expands ? <TaskChecklistPanel task={task} refresh={refresh} /> : task.checklist.length > 0 ? (
                  <ul className="mt-4 space-y-2 border-t border-[#F7F6F3] pt-3">
                    {task.checklist.map((item) => (
                      <li key={item.id} className="flex min-h-11 items-start gap-3 text-xs font-medium text-[#2E2C27]">
                        {item.status === "VERIFIED" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4F7FA8] stroke-[2.5]" /> : <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#8E8B83]" />}
                        <span className="min-w-0 flex-1">
                          {item.label}
                          {item.outcome ? <span className={cn("ml-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase", item.outcome === "FAIL" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800")}>{item.outcome}</span> : null}
                          {item.remarks ? <span className="mt-1 block text-xs text-[#4E4B44]">{item.remarks}</span> : null}
                          {item.verifiedAt ? <span className="mt-1 block text-[10px] font-mono text-[#8E8B83]">Verified {new Date(item.verifiedAt).toLocaleString()}{item.verifiedByUserId ? ` by ${item.verifiedByUserId}` : ""}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
