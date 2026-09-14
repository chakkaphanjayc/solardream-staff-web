"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  Wrench, 
  Search, 
  Calendar, 
  User, 
  X, 
  CheckSquare, 
  Square, 
  Camera, 
  ClipboardCheck, 
  Copy,
  Check,
  Trash2,
} from "@/components/ui/icons";
import { updateProjectStatus, uploadInstallationProjectPhoto } from "@/app/actions/lead";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { cn } from "@/lib/utils";
import { getBrowserPublicOrigin } from "@/lib/siteUrl";
import { toast } from "sonner";
import ProgressiveImage from "@/components/ui/progressive-image";
import ProtectedImage from "@/components/ui/ProtectedImage";
import { GsapReveal } from "@/components/ui/GsapMotion";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface ProjectsClientProps {
  initialProjects: InstallationProjectRecord[];
}

type ProjectStatus = "PREP" | "INSTALLING" | "INSPECTION" | "COMPLETE";

interface ProjectLeadRecord {
  name: string;
  email: string;
  phone: string;
  location?: string | null;
}

interface InstallationProjectRecord {
  id: string;
  status: string;
  assignedTeam?: string | null;
  scheduledDate?: string | Date | null;
  notes?: string | null;
  checklist?: unknown;
  photos?: string[] | null;
  lead: ProjectLeadRecord;
}

function isProjectStatus(value: string): value is ProjectStatus {
  return ["PREP", "INSTALLING", "INSPECTION", "COMPLETE"].includes(value);
}

function normalizeProjectStatus(value: string | null | undefined): ProjectStatus {
  return value && isProjectStatus(value) ? value : "PREP";
}

const DEFAULT_CHECKLIST = [
  "Roof attachment anchor points secured and weather-tight sealed",
  "Racking system aligned and structural weight load verified",
  "Solar panels mounted, securely bolted, and frame-grounded",
  "Inverter wiring, DC disconnect switch, and conduits inspected",
  "AC utility tie-in, main breaker, and rapid shutdown system tested",
  "System labeled with electrical compliance and warning tags"
];

function getDisplayImageUrl(url: string): string {
  if (!url) return "";
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/) || url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (match?.[1] && (url.includes("drive.google.com") || url.includes("googleusercontent.com"))) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }
  return url;
}

export default function ProjectsClient({ initialProjects }: ProjectsClientProps) {
  const [projects, setProjects] = useState<InstallationProjectRecord[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ProjectStatus>("ALL");
  const [selectedProject, setSelectedProject] = useState<InstallationProjectRecord | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form states
  const [status, setStatus] = useState<ProjectStatus>("PREP");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  const handleRowClick = (project: InstallationProjectRecord) => {
    setSelectedProject(project);
    setStatus(normalizeProjectStatus(project.status));
    setAssignedTeam(project.assignedTeam || "");
    setScheduledDate(project.scheduledDate ? new Date(project.scheduledDate).toISOString().split('T')[0] : "");
    setNotes(project.notes || "");
    
    // Parse checklist JSON
    let initialCheck: string[] = [];
    if (project.checklist && Array.isArray(project.checklist)) {
      initialCheck = project.checklist as string[];
    }
    setChecklist(initialCheck);
    setPhotos(project.photos || []);
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    setIsUpdating(true);

    try {
      const res = await updateProjectStatus(selectedProject.id, {
        status,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        assignedTeam,
        notes,
        checklist,
        photos
      });

      if (res.error) {
        toast.error(`Error: ${res.error}`);
        return;
      }

      const updated = {
        ...selectedProject,
        status,
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        assignedTeam,
        notes,
        checklist,
        photos
      };

      setProjects(prev => prev.map(p => p.id === selectedProject.id ? updated : p));
      setSelectedProject(updated);
      toast.success("Project updated successfully!");
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to save changes.");
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedProject]);

  const toggleChecklist = (item: string) => {
    setChecklist(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const handleCopyLink = () => {
    if (!selectedProject) return;
    const trackingUrl = `${getBrowserPublicOrigin()}/project-tracker/${selectedProject.id}`;
    navigator.clipboard.writeText(trackingUrl);
    setCopied(true);
    toast.success("Magic tracking link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProject) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadInstallationProjectPhoto(selectedProject.id, formData);
      if (!result.success || !result.url) {
        throw new Error(result.error || "Upload failed.");
      }

      const newPhotos = [...photos, result.url];
      setPhotos(newPhotos);
      toast.success("Photo uploaded to Google Drive successfully!");
    } catch (err: unknown) {
      console.error("Upload error:", err);
      toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const deletePhoto = (urlToDelete: string) => {
    setPhotos(prev => prev.filter(url => url !== urlToDelete));
    toast.success("Photo removed (Save changes to persist)");
  };

  // Filter projects
  const filteredProjects = projects.filter(p => {
    const matchesSearch = 
      p.lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.lead.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.assignedTeam && p.assignedTeam.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const selection = useAdminSelection(filteredProjects.map((project) => project.id));

  const handleBulkStatusChange = async (status: ProjectStatus) => {
    if (selection.selectedCount === 0) return;
    setIsBulkUpdating(true);
    try {
      const selectedProjects = projects.filter((project) => selection.selectedIds.includes(project.id));
      const settled = await Promise.allSettled(selectedProjects.map((project) => updateProjectStatus(project.id, {
        status,
        scheduledDate: project.scheduledDate ?? null,
        assignedTeam: project.assignedTeam ?? null,
        notes: project.notes ?? null,
        checklist: project.checklist,
        photos: project.photos ?? [],
      })));
      const succeededIds = selectedProjects.filter((_, index) => {
        const result = settled[index];
        return result?.status === "fulfilled" && !result.value.error;
      }).map((project) => project.id);
      const failedCount = selectedProjects.length - succeededIds.length;
      if (succeededIds.length > 0) {
        setProjects((current) => current.map((project) => succeededIds.includes(project.id) ? { ...project, status } : project));
        selection.clear();
      }
      if (failedCount > 0) toast.error(`${failedCount} project(s) could not be updated.`);
      else toast.success(`${succeededIds.length} project(s) moved to ${status}.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update selected projects.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <GsapReveal className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight text-gray-100 font-sans uppercase flex items-center gap-2.5">
          <Wrench className="w-8 h-8 text-[#B7D1EA]" />
          Installer <span className="text-[#B7D1EA]">Portal</span> & Projects
        </h1>
        <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
          Track active solar array installations, safety checklists, and photo approvals.
        </p>
      </div>

      {/* Control Panel (Search & Status Toggle) */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#0F172A] border border-[#1E293B] p-4 rounded-xl shadow-none">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by client name, team..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#0B1121] border border-[#1E293B] focus:border-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all placeholder:text-gray-500 placeholder:font-semibold"
          />
        </div>

        {/* Filters Status Pills */}
        <div className="flex flex-wrap gap-1.5 self-start md:self-auto">
          {(["ALL", "PREP", "INSTALLING", "INSPECTION", "COMPLETE"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                statusFilter === s
                  ? "bg-slate-900 text-white shadow-none border border-slate-900"
                  : "bg-[#0B1121] text-gray-400 hover:text-gray-100 border border-[#1E293B]"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid List */}
      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={filteredProjects.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        isPending={isBulkUpdating}
        actions={[
          {
            id: "installing",
            label: "Start installation",
            icon: Wrench,
            tone: "default",
            onClick: () => void handleBulkStatusChange("INSTALLING"),
          },
          {
            id: "inspection",
            label: "Inspection",
            icon: ClipboardCheck,
            tone: "warning",
            onClick: () => void handleBulkStatusChange("INSPECTION"),
          },
          {
            id: "complete",
            label: "Complete",
            icon: CheckSquare,
            tone: "success",
            onClick: () => void handleBulkStatusChange("COMPLETE"),
          },
        ]}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full py-16 text-center border border-dashed border-[#1E293B] rounded-xl bg-[#0F172A]">
            <ClipboardCheck className="w-10 h-10 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">No active installation projects</p>
          </div>
        ) : (
          filteredProjects.map((p) => {
            const completedCount = Array.isArray(p.checklist) ? p.checklist.length : 0;
            const progressPct = Math.round((completedCount / DEFAULT_CHECKLIST.length) * 100);

            return (
              <div 
                key={p.id}
                onClick={() => handleRowClick(p)}
                className="group bg-[#0F172A] border border-[#1E293B] hover:border-[#B7D1EA]/30 hover:shadow-none rounded-xl p-6 transition-all cursor-pointer flex flex-col justify-between h-64 shadow-none"
              >
                <div className="space-y-3.5">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5" onClick={(event) => event.stopPropagation()}>
                        <AdminSelectionCheckbox
                          checked={selection.isSelected(p.id)}
                          disabled={isBulkUpdating}
                          label={`Select installation project ${p.lead.name}`}
                          onChange={() => selection.toggle(p.id)}
                        />
                      </div>
                      <div>
                      <h3 className="text-gray-100 font-extrabold uppercase text-sm group-hover:text-[#B7D1EA] transition-colors">{p.lead.name}</h3>
                      <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">{p.lead.phone}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border",
                      p.status === "PREP" && "bg-[#0B1121] text-gray-400 border-[#1E293B]",
                      p.status === "INSTALLING" && "bg-sky-500/10 text-sky-300 border-sky-500/20",
                      p.status === "INSPECTION" && "bg-amber-500/10 text-amber-300 border-amber-500/20",
                      p.status === "COMPLETE" && "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                    )}>
                      {p.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold text-gray-400">
                    <div>
                      <span className="text-[7.5px] uppercase font-black text-gray-500 block">Assigned Team</span>
                      <span className="text-gray-100 font-bold">{p.assignedTeam || "Unassigned"}</span>
                    </div>
                    <div>
                      <span className="text-[7.5px] uppercase font-black text-gray-500 block">Scheduled Date</span>
                      <span className="text-gray-100 font-bold font-mono">
                        {p.scheduledDate ? new Date(p.scheduledDate).toLocaleDateString("th-TH") : "TBD"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-[#1E293B]">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-gray-400">
                    <span>Safety Checklist</span>
                    <span className="text-[#B7D1EA] font-mono">{completedCount}/{DEFAULT_CHECKLIST.length} ({progressPct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#0B1121] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#B7D1EA] rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detailed Project Control Drawer */}
      {selectedProject && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedProject(null)}
          />

          <GsapReveal from="right" className="relative z-50 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b border-[#1E293B]">
              <div>
                <h3 className="text-base font-black text-gray-100 uppercase flex items-center gap-1.5">
                  <Wrench className="w-4.5 h-4.5 text-[#B7D1EA]" />
                  Project Sizing & Schedulers
                </h3>
                <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5 tracking-widest">
                  Project ID: {selectedProject.id.substring(0, 8).toUpperCase()}
                </p>
              </div>
              <button 
                onClick={() => setSelectedProject(null)}
                className="p-1.5 hover:bg-[#0B1121] rounded-full transition-colors cursor-pointer text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Schedulers Details Form */}
            <form onSubmit={handleSaveDetails} className="space-y-6 pt-4">
              {/* Customer Sizing Info */}
              <div className="bg-[#0B1121] border border-[#1E293B]/60 p-4 rounded-xl space-y-3">
                <h4 className="text-[9px] font-black uppercase tracking-wider text-[#B7D1EA] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>Contact Information & Location</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] font-semibold text-gray-400">
                  <div>
                    <span className="text-[8px] uppercase font-black text-gray-500 block">Client Name</span>
                    <span className="text-gray-100 font-bold text-xs uppercase">{selectedProject.lead.name}</span>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase font-black text-gray-500 block">Phone</span>
                    <span className="text-gray-100 font-mono font-bold text-xs">{selectedProject.lead.phone}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[8px] uppercase font-black text-gray-500 block">Email Address</span>
                    <span className="text-gray-100 font-mono font-bold text-xs">{selectedProject.lead.email}</span>
                  </div>
                  {selectedProject.lead.location && (
                    <div className="sm:col-span-2">
                      <span className="text-[8px] uppercase font-black text-gray-500 block">Installation Address</span>
                      <span className="text-gray-100 font-bold text-xs">{selectedProject.lead.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Schedulers & Status Select */}
              <div className="bg-[#0B1121] border border-[#1E293B]/60 p-4 rounded-xl space-y-4">
                <h4 className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Installation Schedulers & Assignments</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-gray-500">Project Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                      className="w-full p-2.5 bg-[#0F172A] border border-[#1E293B] rounded-xl text-xs font-bold text-gray-100 focus:outline-none focus:border-[#B7D1EA]"
                    >
                      <option value="PREP">PREP (Preparation)</option>
                      <option value="INSTALLING">INSTALLING</option>
                      <option value="INSPECTION">INSPECTION</option>
                      <option value="COMPLETE">COMPLETE</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-gray-500">Assigned Team</label>
                    <input
                      type="text"
                      placeholder="e.g. Team Alpha"
                      value={assignedTeam}
                      onChange={(e) => setAssignedTeam(e.target.value)}
                      className="w-full p-2 bg-[#0F172A] border border-[#1E293B] rounded-xl text-xs font-bold text-gray-100 focus:outline-none focus:border-[#B7D1EA]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-gray-500">Installation Date</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full p-2 bg-[#0F172A] border border-[#1E293B] rounded-xl text-xs font-bold text-gray-100 focus:outline-none focus:border-[#B7D1EA]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-gray-500">Engineering Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Log technical notes (e.g. Needs extra racking rails due to tile pitch...)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-3 bg-[#0F172A] border border-[#1E293B] rounded-xl text-xs font-semibold text-gray-100 focus:outline-none focus:border-[#B7D1EA]"
                  />
                </div>
              </div>

              {/* Magic Customer Link Generator */}
              <div className="bg-[#B7D1EA]/5 border border-[#B7D1EA]/20 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-[#B7D1EA]">Customer Magic Sizing Link</h4>
                    <p className="text-[9px] text-gray-400 font-medium">Provide this link to the customer to track progress in real-time.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] border border-[#1E293B] hover:border-[#B7D1EA] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-none active:scale-95"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy Link"}</span>
                  </button>
                </div>
              </div>

              {/* Safety & Quality Checklist */}
              <div className="bg-[#0B1121] border border-[#1E293B]/60 p-4 rounded-xl space-y-4">
                <h4 className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Technical & Safety Checklist</span>
                </h4>
                <div className="space-y-2.5">
                  {DEFAULT_CHECKLIST.map((item, idx) => {
                    const isChecked = checklist.includes(item);
                    return (
                      <div 
                        key={idx}
                        onClick={() => toggleChecklist(item)}
                        className="flex items-start gap-3 p-3 bg-[#0F172A] border border-[#1E293B] rounded-lg cursor-pointer hover:border-[#B7D1EA]/30 select-none shadow-none"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-[#B7D1EA] shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-355 shrink-0 mt-0.5" />
                        )}
                        <span className={cn(
                          "text-[10.5px] font-semibold text-gray-300",
                          isChecked && "line-through text-gray-500"
                        )}>
                          {item}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Site Photos Upload Gallery */}
              <div className="bg-[#0B1121] border border-[#1E293B]/60 p-4 rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    <span>Upload Site Photos & Approvals</span>
                  </h4>
                  <label className={cn(
                    "px-3 py-1.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1.5 shadow-none",
                    isUploading && "opacity-50 pointer-events-none"
                  )}>
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isUploading ? "Uploading..." : "Upload Photo"}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handlePhotoUpload} 
                      className="hidden" 
                      disabled={isUploading}
                    />
                  </label>
                </div>

                {photos.length === 0 ? (
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider text-center py-6">No site photos uploaded yet.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {photos.map((url, idx) => (
                      <div key={idx} className="relative aspect-square border border-[#1E293B] rounded-lg overflow-hidden group">
                        <ProtectedImage
                          src={url}
                          alt={`Upload ${idx}`}
                          fill
                          sizes="25vw"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => deletePhoto(url)}
                          className="absolute inset-0 bg-slate-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white rounded-xl"
                        >
                          <Trash2 className="w-5 h-5 text-rose-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sticky Footer Save Button */}
              <div className="pt-4 border-t border-[#1E293B] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedProject(null)}
                  className="px-5 py-2.5 border border-[#1E293B] hover:bg-[#0B1121] text-gray-300 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-[#B7D1EA] text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-none"
                >
                  {isUpdating ? "Saving Details..." : "Save Project Sizing"}
                </button>
              </div>
            </form>
          </GsapReveal>
        </div>,
        document.body
      )}
    </GsapReveal>
  );
}
