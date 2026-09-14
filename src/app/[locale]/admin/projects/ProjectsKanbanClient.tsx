"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Wrench,
  Truck,
  CheckCircle2,
  Clock,
  HardHat,
  Search,
  User,
  Phone,
  Sparkles,
  ArrowRight,
} from "@/components/ui/icons";
import type { ProjectMilestone } from "@/lib/customerLifecycle";
import { cn } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

export type ProjectItem = {
  id: string;
  customerName: string;
  phone: string;
  email?: string | null;
  lineUserId?: string | null;
  systemSizeKwp: number;
  milestone: ProjectMilestone;
  updatedAt: string;
};

const MILESTONES: Array<{
  key: ProjectMilestone;
  label: string;
  icon: typeof Clock;
  color: string;
  bgColor: string;
}> = [
  {
    key: "SURVEY_PENDING",
    label: "Pending survey",
    icon: Clock,
    color: "text-[#B7D1EA]",
    bgColor: "bg-[#B7D1EA]/10 border-[#B7D1EA]/30",
  },
  {
    key: "MATERIAL_DELIVERY",
    label: "Material delivery",
    icon: Truck,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
  },
  {
    key: "INSTALLING",
    label: "Installation",
    icon: HardHat,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
  },
  {
    key: "INSPECTION",
    label: "Inspection & grid",
    icon: Wrench,
    color: "text-teal-400",
    bgColor: "bg-teal-500/10 border-teal-500/30",
  },
  {
    key: "COMPLETED",
    label: "Completed",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/30",
  },
];

const NEXT_MILESTONE: Partial<Record<ProjectMilestone, ProjectMilestone>> = {
  SURVEY_PENDING: "MATERIAL_DELIVERY",
  MATERIAL_DELIVERY: "INSTALLING",
  INSTALLING: "INSPECTION",
  INSPECTION: "COMPLETED",
};

type Props = {
  initialProjects: ProjectItem[];
  initialSelectedProjectId?: string | null;
};

export default function ProjectsKanbanClient({ initialProjects, initialSelectedProjectId = null }: Props) {
  const [milestoneOverrides, setMilestoneOverrides] = useState<Record<string, ProjectMilestone>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(() =>
    initialSelectedProjectId
      ? initialProjects.find((project) => project.id === initialSelectedProjectId) || null
      : null,
  );
  const [updateDetails, setUpdateDetails] = useState("");
  const [isPending, startTransition] = useTransition();

  const projects = initialProjects.map((project) => ({
    ...project,
    milestone: milestoneOverrides[project.id] ?? project.milestone,
  }));

  const handleMilestoneAdvance = (project: ProjectItem, nextMilestone: ProjectMilestone) => {
    startTransition(async () => {
      try {
        const isComplete = nextMilestone === "COMPLETED";
        const endpoint = isComplete ? "/api/lifecycle/complete-project" : "/api/lifecycle/project-update";

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName: project.customerName,
            phone: project.phone,
            email: project.email,
            lineUserId: project.lineUserId,
            projectId: project.id,
            milestone: nextMilestone,
            milestoneDetails: updateDetails || `Project phase advanced to ${nextMilestone}`,
          }),
        });

        const data = await response.json();

        if (data.success) {
          toast.success(
            isComplete
              ? "Project 100% Completed! LINE Rich Menu Swapped to After-Sales & Warranty Issued."
              : `Milestone updated to ${nextMilestone}. Real-time LINE alert dispatched.`
          );

          setMilestoneOverrides((current) => ({ ...current, [project.id]: nextMilestone }));
          setSelectedProject(null);
          setUpdateDetails("");
        } else {
          toast.error(data.error || "Failed to update project milestone.");
        }
      } catch {
        toast.error("Error connecting to project transition endpoint.");
      }
    });
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone.includes(searchQuery)
  );
  const projectSelection = useAdminSelection(filteredProjects.map((project) => project.id));

  const handleBulkAdvance = () => {
    const selected = projects.filter((project) => projectSelection.selectedIds.includes(project.id));
    const actionable = selected
      .map((project) => ({ project, nextMilestone: NEXT_MILESTONE[project.milestone] }))
      .filter((item): item is { project: ProjectItem; nextMilestone: ProjectMilestone } => Boolean(item.nextMilestone));

    if (actionable.length === 0) {
      toast.error("Select projects that have a next milestone.");
      return;
    }
    if (actionable.length !== selected.length) {
      toast.error("Completed projects cannot be advanced again.");
      return;
    }

    startTransition(async () => {
      try {
        const settled = await Promise.allSettled(
          actionable.slice(0, 100).map(async ({ project, nextMilestone }) => {
            const isComplete = nextMilestone === "COMPLETED";
            const response = await fetch(
              isComplete ? "/api/lifecycle/complete-project" : "/api/lifecycle/project-update",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  customerName: project.customerName,
                  phone: project.phone,
                  email: project.email,
                  lineUserId: project.lineUserId,
                  projectId: project.id,
                  milestone: nextMilestone,
                  milestoneDetails: `Project phase advanced to ${nextMilestone}`,
                }),
              },
            );
            const data = (await response.json()) as { success?: boolean; error?: string };
            return { project, nextMilestone, success: response.ok && data.success === true, error: data.error };
          }),
        );
        const completed = settled.flatMap((item) =>
          item.status === "fulfilled" && item.value.success ? [item.value] : [],
        );
        const failed = settled.length - completed.length;
        if (completed.length > 0) {
          setMilestoneOverrides((current) => Object.fromEntries([
            ...Object.entries(current),
            ...completed.map((result) => [result.project.id, result.nextMilestone] as const),
          ]));
          projectSelection.remove(completed.map((result) => result.project.id));
          toast.success(`Advanced ${completed.length} project${completed.length === 1 ? "" : "s"}.`);
        }
        if (failed > 0) {
          toast.error(`${failed} project${failed === 1 ? "" : "s"} could not be advanced.`);
        }
      } catch (error) {
        console.error("Bulk project milestone update error:", error);
        toast.error("Could not advance the selected projects. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-6 text-slate-100 selection:bg-[#B7D1EA] selection:text-[#0F172A]">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#B7D1EA]">Delivery workspace</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Field projects</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Track every project from site survey through installation, inspection, and handover.</p>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search customer or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-700 bg-[#0F172A] py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#B7D1EA]"
          />
        </div>
      </div>

      <AdminBulkActionBar
        selectedCount={projectSelection.selectedCount}
        visibleCount={filteredProjects.length}
        allVisibleSelected={projectSelection.allVisibleSelected}
        someVisibleSelected={projectSelection.someVisibleSelected}
        onToggleVisible={projectSelection.toggleVisible}
        onClear={projectSelection.clear}
        isPending={isPending}
        actions={[
          { id: "advance", label: "Advance selected", icon: ArrowRight, tone: "success", onClick: handleBulkAdvance },
        ]}
      />

      {/* KANBAN BOARD */}
      <div className="grid gap-4 pb-2 sm:grid-cols-2 xl:grid-cols-5">
        {MILESTONES.map((m) => {
          const Icon = m.icon;
          const stageProjects = filteredProjects.filter((p) => p.milestone === m.key);

          return (
            <div
              key={m.key}
              className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-800 bg-[#0F172A] p-4"
            >
              <div className="space-y-4">
                <div className={cn("p-3 rounded-xl border flex items-center justify-between", m.bgColor)}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", m.color)} />
                    <span className="text-xs font-bold text-white">{m.label}</span>
                  </div>
                    <span className="text-xs font-black text-slate-300">
                    {stageProjects.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {stageProjects.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
                      No projects in this stage.
                    </div>
                  ) : (
                    stageProjects.map((proj) => (
                      <div
                        key={proj.id}
                        onClick={() => setSelectedProject(proj)}
                        className="cursor-pointer space-y-2 rounded-lg border border-slate-800 bg-[#0B1121] p-3.5 transition hover:border-[#B7D1EA]/50 hover:bg-slate-900"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            <div onClick={(event) => event.stopPropagation()}>
                              <AdminSelectionCheckbox
                                checked={projectSelection.isSelected(proj.id)}
                                onChange={() => projectSelection.toggle(proj.id)}
                                label={`Select project for ${proj.customerName}`}
                              />
                            </div>
                            <h4 className="flex min-w-0 items-center gap-1.5 truncate text-xs font-bold text-white">
                              <User className="h-3.5 w-3.5 shrink-0 text-[#B7D1EA]" />
                              {proj.customerName}
                            </h4>
                          </div>
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                            {proj.systemSizeKwp} kWp
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-500" />
                            {proj.phone}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(proj.updatedAt).toLocaleDateString("th-TH")}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADVANCE MILESTONE DRAWER */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="bg-[#0F172A] border-l border-slate-800 w-full max-w-md h-full p-6 flex flex-col justify-between shadow-2xl overflow-y-auto space-y-6">
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <span className="font-mono text-[10px] uppercase text-[#B7D1EA] bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 px-2 py-0.5 rounded">
                  Project #{selectedProject.id.slice(0, 8)}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">Update Installation Stage</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Advance milestone for <strong>{selectedProject.customerName}</strong> ({selectedProject.systemSizeKwp} kWp)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                  Select Next Milestone:
                </label>
                <div className="space-y-2">
                  {MILESTONES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => handleMilestoneAdvance(selectedProject, m.key)}
                      disabled={isPending}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border flex items-center justify-between text-xs font-mono transition-all cursor-pointer",
                        selectedProject.milestone === m.key
                          ? "bg-[#B7D1EA] text-[#0F172A] border-[#B7D1EA] font-bold"
                          : "bg-[#0B1121] border-slate-800 text-slate-300 hover:border-slate-700"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <m.icon className="w-4 h-4" />
                        {m.label}
                      </span>
                      {m.key === "COMPLETED" && (
                        <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          LINE Rich Menu Swap
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                  Customer Update Notes (Sent via LINE Push):
                </label>
                <textarea
                  rows={3}
                  value={updateDetails}
                  onChange={(e) => setUpdateDetails(e.target.value)}
                  placeholder="e.g. Engineering team will arrive tomorrow at 9 AM for inverter wiring."
                  className="w-full bg-[#0B1121] border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#B7D1EA] resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
