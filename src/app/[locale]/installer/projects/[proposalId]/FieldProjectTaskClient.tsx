"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ProjectTaskStepper } from "@/components/proposals/detail/ProjectTaskStepper";
import type { ClientInstallationSnapshot } from "@/components/proposals/portalTypes";

export default function FieldProjectTaskClient({ locale, proposalId, initialInstallation }: { locale: string; proposalId: string; initialInstallation: NonNullable<ClientInstallationSnapshot> }) {
  const t = useTranslations("InstallerWorkflow");
  const [installation, setInstallation] = useState<ClientInstallationSnapshot>(initialInstallation);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden" || inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/installations/projects/${encodeURIComponent(proposalId)}/snapshot`, { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; snapshot?: ClientInstallationSnapshot };
      if (response.ok && payload.success && payload.snapshot) setInstallation(payload.snapshot);
    } finally {
      inFlight.current = false;
    }
  }, [proposalId]);

  useEffect(() => {
    const whenVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(whenVisible, 15_000);
    window.addEventListener("focus", whenVisible);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", whenVisible);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [refresh]);

  return (
    <main className="min-h-dvh bg-[#FAF9F6] px-4 pb-10 pt-24 text-slate-950 [font-family:'Sarabun','Inter',sans-serif] sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href={`/${locale}/installer`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-800">← {t("assignedJobs")}</Link>
        <header className="mt-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0D9488]">{t("fieldOperations")}</p>
          <h1 className="mt-1 text-xl font-black text-slate-950">{installation?.project.projectCode || t("installationProject")}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-600">{t("assignedTasksOnly")}</p>
        </header>
        <ProjectTaskStepper installation={installation} refresh={refresh} />
      </div>
    </main>
  );
}
