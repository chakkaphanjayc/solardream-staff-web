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
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [mobileMilestone, setMobileMilestone] = useState<ProjectMilestone>(() =>
    initialProjects[0]?.milestone ?? MILESTONES[0].key,
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

      {/* Mobile stage picker keeps the current lane in view without stacking five full columns. */}
      <div className="space-y-3 sm:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filter projects by stage">
          {MILESTONES.map((milestone) => {
            const Icon = milestone.icon;
            const count = filteredProjects.filter((project) => project.milestone === milestone.key).length;
            return (
              <button
                key={milestone.key}
                type="button"
                aria-pressed={mobileMilestone === milestone.key}
                onClick={() => setMobileMilestone(milestone.key)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]",
                  mobileMilestone === milestone.key
                    ? "border-[#B7D1EA] bg-[#B7D1EA] text-[#0F172A]"
                    : "border-slate-700 bg-[#0F172A] text-slate-300 hover:border-slate-500",
                )}
              >
                <Icon className={cn("size-4", mobileMilestone === milestone.key ? "text-[#0F172A]" : milestone.color)} aria-hidden="true" />
                <span>{milestone.label}</span>
                <span className="rounded-full bg-black/10 px-2 py-0.5 font-mono text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>
        {filteredProjects.filter((project) => project.milestone === mobileMilestone).length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
            No projects in this stage.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProjects.filter((project) => project.milestone === mobileMilestone).map((project) => (
              <article key={project.id} className="rounded-xl border border-slate-800 bg-[#0F172A] p-3">
                <div className="flex items-start gap-3">
                  <AdminSelectionCheckbox
                    checked={projectSelection.isSelected(project.id)}
                    onChange={() => projectSelection.toggle(project.id)}
                    label={`Select project for ${project.customerName}`}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedProject(project)}
                    className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
                    aria-label={`Open project details for ${project.customerName}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
                        <User className="size-4 shrink-0 text-[#B7D1EA]" aria-hidden="true" />
                        <span className="truncate">{project.customerName}</span>
                      </span>
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                        {project.systemSizeKwp} kWp
                      </span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><Phone className="size-3.5 text-slate-500" aria-hidden="true" />{project.phone}</span>
                      <span>Updated {new Date(project.updatedAt).toLocaleDateString("th-TH")}</span>
                    </span>
                    <span className="mt-2 block text-xs font-semibold text-[#B7D1EA]">Open project details</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* KANBAN BOARD */}
      <div className="hidden gap-4 pb-2 sm:grid sm:grid-cols-2 xl:grid-cols-5">
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
                      <article key={proj.id} className="space-y-2 rounded-lg border border-slate-800 bg-[#0B1121] p-3.5 transition hover:border-[#B7D1EA]/50 hover:bg-slate-900">
                        <div className="flex items-start gap-2">
                          <AdminSelectionCheckbox
                            checked={projectSelection.isSelected(proj.id)}
                            onChange={() => projectSelection.toggle(proj.id)}
                            label={`Select project for ${proj.customerName}`}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedProject(proj)}
                            className="min-w-0 flex-1 space-y-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
                            aria-label={`Open project details for ${proj.customerName}`}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-bold text-white">
                                <User className="size-3.5 shrink-0 text-[#B7D1EA]" aria-hidden="true" />
                                {proj.customerName}
                              </span>
                              <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                                {proj.systemSizeKwp} kWp
                              </span>
                            </span>
                            <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400">
                              <span className="inline-flex items-center gap-1"><Phone className="size-3 text-slate-500" aria-hidden="true" />{proj.phone}</span>
                              <span className="text-[10px] text-slate-500">{new Date(proj.updatedAt).toLocaleDateString("th-TH")}</span>
                            </span>
                            <span className="block text-[11px] font-semibold text-[#B7D1EA]">Open project details</span>
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADVANCE MILESTONE DRAWER */}
      <Dialog
        isOpen={selectedProject !== null}
        onClose={() => setSelectedProject(null)}
        size="md"
        tone="dark"
        ariaLabel="Update installation stage"
        closeLabel="Close project stage dialog"
        className="max-h-[90dvh] overflow-hidden border-slate-800 bg-[#0F172A] p-0"
      >
        {selectedProject ? (
          <DialogContent>
            <DialogHeader className="border-b border-slate-800" closeLabel="Close project stage dialog">
              <div>
                <span className="font-mono text-[10px] uppercase text-[#B7D1EA] bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 px-2 py-0.5 rounded">
                  Project #{selectedProject.id.slice(0, 8)}
                </span>
                <DialogTitle className="mt-1 text-lg">Update Installation Stage</DialogTitle>
                <DialogDescription className="mt-1 text-xs text-slate-400">
                  Advance milestone for <strong>{selectedProject.customerName}</strong> ({selectedProject.systemSizeKwp} kWp)
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogBody className="space-y-6">
              <div className="space-y-2">
                <p id="project-next-milestone-label" className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Select Next Milestone:
                </p>
                <div className="space-y-2" role="group" aria-labelledby="project-next-milestone-label">
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
                <label htmlFor="project-update-notes" className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                  Customer Update Notes (Sent via LINE Push):
                </label>
                <textarea
                  id="project-update-notes"
                  rows={3}
                  value={updateDetails}
                  onChange={(e) => setUpdateDetails(e.target.value)}
                  placeholder="e.g. Engineering team will arrive tomorrow at 9 AM for inverter wiring."
                  className="w-full bg-[#0B1121] border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#B7D1EA] resize-none"
                />
              </div>
            </DialogBody>
            <DialogFooter className="border-t border-slate-800">
              <DialogCloseButton className="rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:ring-offset-[#0F172A]">Close</DialogCloseButton>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
