"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Coins,
  Copy,
  Eye,
  EyeOff,
  Images,
  MessageSquareQuote,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from "@/components/ui/icons";
import { toast } from "sonner";

import {
  removePortfolioProject,
  savePortfolioProject,
  savePortfolioShowcaseConfig,
} from "@/app/actions/portfolioShowcase";
import {
  createDefaultProjectDraft,
  MAX_PORTFOLIO_SHOWCASE_PROJECTS,
  type GalleryItem,
  type PortfolioShowcaseConfig,
  type PortfolioShowcaseItemConfig,
  type ProjectCaseStudy,
} from "@/types/portfolio";
import { cn } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import ShowcaseCoverUploader from "./ShowcaseCoverUploader";
import ShowcaseGalleryManager from "./ShowcaseGalleryManager";
import { THAI_PROVINCES } from "@/lib/thaiProvinces";

type ShowcaseSettingsClientProps = Readonly<{
  initialConfig: PortfolioShowcaseConfig;
  projects: readonly ProjectCaseStudy[];
}>;

type ProjectQuote = NonNullable<ProjectCaseStudy["quote"]>;
type BeforeAfterField = keyof ProjectCaseStudy["beforeAfter"];

type FieldProps = Readonly<{
  label: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}>;

function Field({ label, children, className, hint }: FieldProps) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="flex items-center justify-between text-xs font-semibold text-[#8b949e]">
        <span>{label}</span>
        {hint ? <span className="text-[10px] font-normal text-[#6e7681]">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  badge,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-[#30363d] bg-[#161b22] p-5 shadow-sm transition-all hover:border-[#3d444d]", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#30363d]/80 pb-3.5">
        <div className="flex items-start gap-2.5">
          {Icon ? (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#58a6ff]/20 bg-[#58a6ff]/10 text-[#58a6ff]">
              <Icon className="size-4" />
            </div>
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#f0f6fc]">{title}</h3>
              {badge}
            </div>
            {description ? <p className="mt-0.5 text-xs text-[#8b949e]">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function cloneProject(project: ProjectCaseStudy): ProjectCaseStudy {
  return {
    ...project,
    galleryImages: project.galleryImages.map((image) => ({ ...image })),
    tags: [...project.tags],
    quote: project.quote ? { ...project.quote } : undefined,
    beforeAfter: { ...project.beforeAfter },
  };
}

function orderItems(items: readonly PortfolioShowcaseItemConfig[]) {
  return [...items].sort((left, right) => {
    const sortOrderDifference = left.sortOrder - right.sortOrder;
    return sortOrderDifference !== 0 ? sortOrderDifference : left.projectId.localeCompare(right.projectId);
  });
}

function reindexItems(items: readonly PortfolioShowcaseItemConfig[]) {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

function generateSlug(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  if (!base || base.length < 2) {
    return `proj-${Date.now().toString(36)}`;
  }
  return base;
}

export default function ShowcaseSettingsClient({
  initialConfig,
  projects,
}: ShowcaseSettingsClientProps) {
  const t = useTranslations("AdminShowcaseSettings");
  const [config, setConfig] = useState(initialConfig);
  const [editableProjects, setEditableProjects] = useState(() => projects.map(cloneProject));
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "featured" | "notFeatured">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ProjectCaseStudy["category"]>("all");
  const [provinceFilter, setProvinceFilter] = useState<"all" | ProjectCaseStudy["province"]>("all");
  const [editingProject, setEditingProject] = useState<ProjectCaseStudy | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [hasCustomSlug, setHasCustomSlug] = useState(false);
  const [projectToRemove, setProjectToRemove] = useState<ProjectCaseStudy | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isProjectPending, startProjectTransition] = useTransition();
  const [isRemovePending, startRemoveTransition] = useTransition();

  useEffect(() => {
    if (!editingProject && !projectToRemove) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingProject, projectToRemove]);

  // Keyboard shortcuts (Escape to close, Ctrl+S to save)
  useEffect(() => {
    if (!editingProject) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isProjectPending) {
        setEditingProject(null);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleProjectSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingProject, isProjectPending]);

  const projectById = useMemo(
    () => new Map(editableProjects.map((project) => [project.id, project])),
    [editableProjects],
  );
  const orderedItems = useMemo(() => orderItems(config.items), [config.items]);
  const orderIndexByProjectId = useMemo(
    () => new Map(orderedItems.map((item, index) => [item.projectId, index])),
    [orderedItems],
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleItems = useMemo(
    () => orderedItems.filter((item) => {
      const project = projectById.get(item.projectId);
      if (!project) return false;

      if (statusFilter === "featured" && !item.isFeatured) return false;
      if (statusFilter === "notFeatured" && item.isFeatured) return false;
      if (categoryFilter !== "all" && project.category !== categoryFilter) return false;
      if (provinceFilter !== "all" && project.province !== provinceFilter) return false;

      if (!normalizedSearch) return true;

      const searchableText = `${project.title} ${project.location} ${project.clientName} ${project.id} ${project.tags.join(" ")}`.toLowerCase();
      return searchableText.includes(normalizedSearch);
    }),
    [categoryFilter, normalizedSearch, orderedItems, projectById, provinceFilter, statusFilter],
  );

  const projectSelection = useAdminSelection(visibleItems.map((item) => item.projectId));
  const featuredCount = useMemo(
    () => config.items.filter((item) => item.isFeatured).length,
    [config.items],
  );

  const toggleFeatured = (projectId: string) => {
    const currentItem = config.items.find((item) => item.projectId === projectId);
    if (!currentItem) return;

    if (!currentItem.isFeatured && featuredCount >= MAX_PORTFOLIO_SHOWCASE_PROJECTS) {
      toast.error(t("maxFeatured"));
      return;
    }

    setConfig((current) => ({
      ...current,
      items: current.items.map((item) => (
        item.projectId === projectId ? { ...item, isFeatured: !item.isFeatured } : item
      )),
    }));
  };

  const handleBulkFeatured = (isFeatured: boolean) => {
    const selectedIds = Array.from(projectSelection.selectedIds);
    if (selectedIds.length === 0) return;

    const selectedIdSet = new Set(selectedIds);
    const currentlyFeaturedOutsideSelection = config.items.filter(
      (item) => item.isFeatured && !selectedIdSet.has(item.projectId),
    ).length;
    const requestedFeaturedCount = config.items.filter(
      (item) => selectedIdSet.has(item.projectId) && isFeatured,
    ).length;
    if (isFeatured && currentlyFeaturedOutsideSelection + requestedFeaturedCount > MAX_PORTFOLIO_SHOWCASE_PROJECTS) {
      toast.error(t("maxFeatured"));
      return;
    }

    setConfig((current) => ({
      ...current,
      items: current.items.map((item) => (
        selectedIdSet.has(item.projectId) ? { ...item, isFeatured } : item
      )),
    }));
    projectSelection.clear();
    toast.success(isFeatured ? "Selected projects added to the showcase." : "Selected projects removed from the showcase.");
  };

  const moveProject = (projectId: string, direction: -1 | 1) => {
    setConfig((current) => {
      const nextItems = orderItems(current.items);
      const currentIndex = nextItems.findIndex((item) => item.projectId === projectId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= nextItems.length) return current;

      const [movedItem] = nextItems.splice(currentIndex, 1);
      nextItems.splice(nextIndex, 0, movedItem);

      return { ...current, items: reindexItems(nextItems) };
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await savePortfolioShowcaseConfig(config);

        if (!result.success) {
          toast.error(result.error || t("saveFailed"));
          return;
        }

        if (result.config) setConfig(result.config);
        toast.success(t("saved"));
      } catch (error) {
        console.error("Portfolio showcase save error:", error);
        toast.error(t("saveFailed"));
      }
    });
  };

  const openNewProject = () => {
    const autoId = `proj-${Date.now().toString(36)}`;
    const draft = createDefaultProjectDraft(autoId);
    draft.isFeatured = false;
    setEditingProject(draft);
    setIsCreating(true);
    setHasCustomSlug(false);
  };

  const openProjectEditor = (project: ProjectCaseStudy) => {
    const currentItem = config.items.find((item) => item.projectId === project.id);
    const draft = cloneProject(project);
    draft.isFeatured = currentItem?.isFeatured ?? false;
    setEditingProject(draft);
    setIsCreating(false);
    setHasCustomSlug(true);
  };

  const handleDuplicateProject = (project: ProjectCaseStudy) => {
    const duplicateId = `${project.id}-copy-${Date.now().toString().slice(-4)}`;
    const draft = cloneProject(project);
    draft.id = duplicateId;
    draft.title = `${project.title} (Copy)`;
    draft.isFeatured = false;
    setEditingProject(draft);
    setIsCreating(true);
    setHasCustomSlug(true);
    toast.success(t("duplicateSuccess"));
  };

  const updateEditingProject = (changes: Partial<ProjectCaseStudy>) => {
    setEditingProject((current) => current ? { ...current, ...changes } : current);
  };

  const updateBeforeAfter = (field: BeforeAfterField, value: number) => {
    setEditingProject((current) => current ? {
      ...current,
      beforeAfter: { ...current.beforeAfter, [field]: value },
    } : current);
  };

  const updateQuote = (changes: Partial<ProjectQuote>) => {
    setEditingProject((current) => current ? {
      ...current,
      quote: { text: "", author: "", role: "", ...current.quote, ...changes },
    } : current);
  };

  const handleProjectSave = () => {
    if (!editingProject) return;
    const trimmedTitle = editingProject.title.trim();
    const trimmedHero = editingProject.heroImage.trim();
    const trimmedId = editingProject.id.trim();

    if (!trimmedTitle) {
      toast.error(t("requiredProjectFields"));
      return;
    }

    if (!trimmedId || !/^[a-zA-Z0-9_-]{2,80}$/.test(trimmedId)) {
      toast.error(t("invalidIdError"));
      return;
    }

    if (isCreating && editableProjects.some((p) => p.id === trimmedId)) {
      toast.error(t("duplicateIdError"));
      return;
    }

    const draft: ProjectCaseStudy = {
      ...cloneProject(editingProject),
      id: trimmedId,
      title: trimmedTitle,
      heroImage: trimmedHero,
    };

    startProjectTransition(async () => {
      const result = await savePortfolioProject(draft);

      if (!result.success || !result.project) {
        toast.error(result.error || t("projectSaveFailed"));
        return;
      }

      const saved = result.project;
      setEditableProjects((current) => {
        const exists = current.some((project) => project.id === saved.id);
        return exists
          ? current.map((project) => (project.id === saved.id ? saved : project))
          : [saved, ...current];
      });

      setConfig((current) => {
        const exists = current.items.some((item) => item.projectId === saved.id);
        if (exists) {
          return {
            ...current,
            items: current.items.map((item) => (
              item.projectId === saved.id
                ? { ...item, isFeatured: draft.isFeatured ?? item.isFeatured }
                : item
            )),
          };
        }
        return {
          ...current,
          items: [
            {
              projectId: saved.id,
              isFeatured: draft.isFeatured ?? false,
              sortOrder: 0,
            },
            ...current.items.map((item, idx) => ({ ...item, sortOrder: idx + 1 })),
          ],
        };
      });

      setEditingProject(null);
      setIsCreating(false);
      toast.success(isCreating ? t("projectCreated") : t("projectSaved"));
    });
  };

  const requestRemoveProject = (project: ProjectCaseStudy) => {
    setProjectToRemove(project);
  };

  const handleRemoveProject = () => {
    if (!projectToRemove || isRemovePending) return;

    const projectId = projectToRemove.id;
    startRemoveTransition(async () => {
      const result = await removePortfolioProject(projectId);

      if (!result.success) {
        toast.error(result.error || t("projectRemoveFailed"));
        return;
      }

      setEditableProjects((current) => current.filter((project) => project.id !== projectId));
      setConfig((current) => ({
        ...current,
        items: current.items.filter((item) => item.projectId !== projectId),
      }));
      projectSelection.clear();
      setProjectToRemove(null);
      setEditingProject((current) => current?.id === projectId ? null : current);
      toast.success(t("projectRemoved"));
    });
  };

  // Live bill difference calculation
  const billSavingsDelta = useMemo(() => {
    if (!editingProject) return null;
    const before = editingProject.beforeAfter.beforeBillThb;
    const after = editingProject.beforeAfter.afterBillThb;
    if (before > 0 && after >= 0 && before > after) {
      const diff = before - after;
      const pct = Math.round((diff / before) * 100);
      return { diff, pct };
    }
    return null;
  }, [editingProject]);

  return (
    <div className="space-y-6 p-4 text-[#c9d1d9] sm:p-6 lg:p-8">
      {/* Top Banner Header */}
      <header className="flex flex-col gap-5 border-b border-[#30363d] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8b949e]">
            <Images className="size-4 text-[#58a6ff]" aria-hidden="true" />
            <span>{t("eyebrow")}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">{t("title")}</h1>
          <div className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">{t("description")}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-showcase-add="true"
            onClick={openNewProject}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#238636] bg-[#238636]/20 px-4 text-sm font-semibold text-[#3fb950] transition-colors hover:bg-[#238636] hover:text-white focus-visible:outline-none"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addProject")}
          </button>
          <button
            type="button"
            data-showcase-save="true"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#238636] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2ea043] disabled:cursor-wait disabled:opacity-60 shadow-sm"
          >
            <Save className="size-4" aria-hidden="true" />
            {isPending ? t("saving") : t("saveChanges")}
          </button>
        </div>
      </header>

      {/* Global Status & Bulk Actions Bar */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <div className="ops-surface rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", config.isEnabled ? "bg-[#238636]/20 text-[#3fb950]" : "bg-[#30363d] text-[#8b949e]") }>
                {config.isEnabled ? <Eye className="size-[18px]" aria-hidden="true" /> : <EyeOff className="size-[18px]" aria-hidden="true" />}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[#f0f6fc]">{t("publishing")}</h2>
                <div className="mt-1 text-sm font-medium text-[#c9d1d9]">{config.isEnabled ? t("enabled") : t("disabled")}</div>
                <div className="mt-1 text-xs leading-5 text-[#8b949e]">
                  {config.isEnabled ? t("enabledDescription") : t("disabledDescription")}
                </div>
              </div>
            </div>
            <button
              type="button"
              data-showcase-toggle="enabled"
              role="switch"
              aria-checked={config.isEnabled}
              aria-label={config.isEnabled ? t("enabled") : t("disabled")}
              onClick={() => setConfig((current) => ({ ...current, isEnabled: !current.isEnabled }))}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 rounded-full border border-transparent transition-colors focus-visible:outline-none disabled:opacity-60",
                config.isEnabled ? "bg-[#238636]" : "bg-[#30363d]",
              )}
            >
              <span className={cn("absolute top-1 size-5 rounded-full bg-[#f0f6fc] transition-[left]", config.isEnabled ? "left-6" : "left-1")} />
            </button>
          </div>
        </div>

        <div className="ops-surface rounded-xl p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#21262d] text-[#58a6ff]">
              <Star className="size-[18px]" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#f0f6fc]">{t("featuredCount", { count: featuredCount, total: editableProjects.length })}</h2>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-[#f0f6fc]">{featuredCount} / {editableProjects.length}</div>
              <div className="mt-1 text-xs leading-5 text-[#8b949e]">{t("limitNote")}</div>
            </div>
          </div>
        </div>

        <AdminBulkActionBar
          selectedCount={projectSelection.selectedCount}
          visibleCount={visibleItems.length}
          allVisibleSelected={projectSelection.allVisibleSelected}
          someVisibleSelected={projectSelection.someVisibleSelected}
          onToggleVisible={projectSelection.toggleVisible}
          onClear={projectSelection.clear}
          className="lg:col-span-2"
          actions={[
            { id: "feature", label: "Feature selected", icon: Star, tone: "success", onClick: () => handleBulkFeatured(true) },
            { id: "unfeature", label: "Remove selected", icon: EyeOff, tone: "default", onClick: () => handleBulkFeatured(false) },
          ]}
        />
      </section>

      {/* Projects Catalog Section */}
      <section className="ops-surface overflow-hidden rounded-xl" aria-labelledby="showcase-projects-heading">
        <div className="border-b border-[#30363d] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="showcase-projects-heading" className="text-lg font-semibold text-[#f0f6fc]">{t("projectsTitle")}</h2>
              <div className="mt-1 max-w-2xl text-sm leading-6 text-[#8b949e]">{t("projectsDescription")}</div>
            </div>
            <div className="text-xs font-medium text-[#8b949e]">
              {t("shownCount", { shown: visibleItems.length, total: editableProjects.length })}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#0d1117] p-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    statusFilter === "all" ? "bg-[#21262d] text-[#f0f6fc] shadow-sm" : "text-[#8b949e] hover:text-[#c9d1d9]"
                  )}
                >
                  {t("filterAll")} ({editableProjects.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("featured")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    statusFilter === "featured" ? "bg-[#238636]/20 text-[#3fb950] shadow-sm" : "text-[#8b949e] hover:text-[#c9d1d9]"
                  )}
                >
                  <Star className="size-3 fill-current" />
                  {t("filterFeatured")} ({featuredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("notFeatured")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    statusFilter === "notFeatured" ? "bg-[#21262d] text-[#f0f6fc] shadow-sm" : "text-[#8b949e] hover:text-[#c9d1d9]"
                  )}
                >
                  {t("filterNotFeatured")} ({editableProjects.length - featuredCount})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
                  className="h-9 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 text-xs font-medium text-[#c9d1d9] focus-visible:outline-none"
                >
                  <option value="all">{t("filterCategoryAll")}</option>
                  <option value="residential">{t("residential")}</option>
                  <option value="villa">{t("villa")}</option>
                  <option value="commercial">{t("commercial")}</option>
                  <option value="industrial">Industrial (โรงงานอุตสาหกรรม)</option>
                  <option value="agricultural">Agricultural (เกษตรกรรม)</option>
                  <option value="other">Other (อื่นๆ)</option>
                </select>

                <select
                  value={provinceFilter}
                  onChange={(event) => setProvinceFilter(event.target.value as typeof provinceFilter)}
                  className="h-9 max-w-[200px] rounded-lg border border-[#30363d] bg-[#0d1117] px-3 text-xs font-medium text-[#c9d1d9] focus-visible:outline-none"
                >
                  <option value="all">{t("filterProvinceAll")}</option>
                  {THAI_PROVINCES.map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.nameTh} ({prov.nameEn})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="relative block max-w-xl">
              <span className="sr-only">{t("searchPlaceholder")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b949e]" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-10 w-full rounded-lg border border-[#30363d] bg-[#0d1117] pl-9 pr-3 text-sm text-[#f0f6fc] placeholder:text-[#8b949e]"
              />
            </label>
          </div>
        </div>

        {visibleItems.length > 0 ? (
          <div className="divide-y divide-[#30363d]">
            {visibleItems.map((item) => {
              const project = projectById.get(item.projectId);
              if (!project) return null;

              const orderIndex = orderIndexByProjectId.get(item.projectId) ?? 0;
              const isFirst = orderIndex === 0;
              const isLast = orderIndex === orderedItems.length - 1;

              return (
                <article key={project.id} data-showcase-project={project.id} className="grid gap-4 p-4 [contain-intrinsic-size:6rem] [content-visibility:auto] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
                  <div className="flex items-start gap-2">
                    <AdminSelectionCheckbox
                      checked={projectSelection.isSelected(project.id)}
                      onChange={() => projectSelection.toggle(project.id)}
                      label={`Select project ${project.title}`}
                      className="mt-1 shrink-0"
                    />
                    <div className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#30363d] bg-[#0d1117]">
                      {project.heroImage ? (
                        <Image src={project.heroImage} alt="" fill sizes="96px" className="object-cover" />
                      ) : (
                        <Images className="size-5 text-[#8b949e]" />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-[#8b949e]">{String(orderIndex + 1).padStart(2, "0")}</span>
                      <h3 className="min-w-0 text-sm font-semibold text-[#f0f6fc]">{project.title}</h3>
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", item.isFeatured ? "border-[#3fb950]/40 bg-[#238636]/15 text-[#3fb950]" : "border-[#30363d] text-[#8b949e]") }>
                        {item.isFeatured ? <CheckCircle2 className="size-3" aria-hidden="true" /> : null}
                        {item.isFeatured ? t("featured") : t("notFeatured")}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8b949e]">
                      <span>{project.location || "—"}</span>
                      <span>{t("installed", { year: project.completionYear })}</span>
                      <span>{project.solarSizeKw} kW</span>
                      <span>{t("galleryCount", { count: project.galleryImages.length })}</span>
                      <span className="font-mono text-[10px] text-[#58a6ff]">ID: {project.id}</span>
                    </div>
                    <div className="mt-1 text-xs font-medium text-[#8b949e]">
                      {item.isFeatured ? t("publishedOnHomepage") : t("notPublished")}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      data-showcase-edit={project.id}
                      onClick={() => openProjectEditor(project)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#58a6ff]/40 px-3 text-xs font-semibold text-[#79c0ff] transition-colors hover:bg-[#58a6ff]/10 focus-visible:outline-none"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      {t("editProject")}
                    </button>
                    <button
                      type="button"
                      data-showcase-duplicate={project.id}
                      onClick={() => handleDuplicateProject(project)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#30363d] px-3 text-xs font-semibold text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none"
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                      {t("duplicateProject")}
                    </button>
                    <button
                      type="button"
                      data-showcase-featured={item.isFeatured ? "true" : "false"}
                      aria-pressed={item.isFeatured}
                      onClick={() => toggleFeatured(project.id)}
                      className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none", item.isFeatured ? "border-[#3fb950]/50 bg-[#238636]/15 text-[#3fb950] hover:bg-[#238636]/25" : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]")}
                    >
                      <Star className={cn("size-3.5", item.isFeatured && "fill-current")} aria-hidden="true" />
                      {item.isFeatured ? t("featured") : t("notFeatured")}
                    </button>
                    <button
                      type="button"
                      data-showcase-remove={project.id}
                      onClick={() => requestRemoveProject(project)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#f85149]/40 px-3 text-xs font-semibold text-[#ff7b72] transition-colors hover:bg-[#f85149]/10 focus-visible:outline-none"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {t("removeProject")}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={t("moveUp", { title: project.title })}
                        onClick={() => moveProject(project.id, -1)}
                        disabled={isFirst}
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[#30363d] text-[#8b949e] transition-colors hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={t("moveDown", { title: project.title })}
                        onClick={() => moveProject(project.id, 1)}
                        disabled={isLast}
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[#30363d] text-[#8b949e] transition-colors hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-16 text-center text-sm font-medium text-[#8b949e]">{t("empty")}</div>
        )}
      </section>

      {/* FULL SCREEN POPUP / MODAL EDITOR */}
      {editingProject ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-[#010409]/85 backdrop-blur-md animate-in fade-in duration-200" data-showcase-editor="true">
          <button
            type="button"
            aria-label={t("closeEditor")}
            onClick={() => setEditingProject(null)}
            className="absolute inset-0 h-full w-full cursor-default"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="installation-project-editor-title"
            className="relative z-10 flex h-full max-h-[96vh] w-full max-w-[1520px] flex-col rounded-2xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Top Modal Header */}
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#30363d] bg-[#161b22] px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#58a6ff]/30 bg-[#58a6ff]/15 text-[#58a6ff]">
                  <Sparkles className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#58a6ff]">
                      {isCreating ? t("newProjectEyebrow") : t("editorEyebrow")}
                    </span>
                    <span className="rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-0.5 font-mono text-[10px] text-[#8b949e]">
                      slug: {editingProject.id}
                    </span>
                  </div>
                  <h2 id="installation-project-editor-title" className="mt-0.5 truncate text-lg font-bold text-[#f0f6fc]">
                    {isCreating ? (editingProject.title || t("newProjectTitle")) : editingProject.title}
                  </h2>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Direct Featured Switch in Header */}
                <div className="flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5">
                  <Star className={cn("size-3.5", editingProject.isFeatured ? "fill-[#e3b341] text-[#e3b341]" : "text-[#8b949e]")} />
                  <span className="text-xs font-semibold text-[#c9d1d9]">
                    {editingProject.isFeatured ? t("featured") : t("notFeatured")}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editingProject.isFeatured === true}
                    onClick={() => updateEditingProject({ isFeatured: !editingProject.isFeatured })}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ml-1",
                      editingProject.isFeatured ? "bg-[#238636]" : "bg-[#30363d]"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-4 rounded-full bg-[#f0f6fc] transition-[left]",
                        editingProject.isFeatured ? "left-4.5" : "left-0.5"
                      )}
                    />
                  </button>
                </div>

                {!isCreating ? (
                  <button
                    type="button"
                    onClick={() => requestRemoveProject(editingProject)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#f85149]/40 px-3 text-xs font-semibold text-[#ff7b72] transition-colors hover:bg-[#f85149]/10 focus-visible:outline-none"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{t("removeProject")}</span>
                  </button>
                ) : null}

                <div className="h-6 w-px bg-[#30363d]" />

                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#30363d] px-3.5 text-xs font-semibold text-[#c9d1d9] transition-colors hover:bg-[#21262d] focus-visible:outline-none"
                >
                  {t("cancel")}
                </button>

                <button
                  type="button"
                  onClick={handleProjectSave}
                  disabled={isProjectPending}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[#238636] px-4 text-xs font-bold text-white transition-colors hover:bg-[#2ea043] disabled:cursor-wait disabled:opacity-60 shadow-sm"
                >
                  <Save className="size-3.5" aria-hidden="true" />
                  {isProjectPending ? t("savingProject") : (isCreating ? t("createProject") : t("saveProject"))}
                </button>

                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-[#30363d] text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none ml-1"
                  aria-label={t("closeEditor")}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            {/* Scrollable Form Content */}
            <form onSubmit={(event) => { event.preventDefault(); handleProjectSave(); }} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  
                  {/* LEFT COLUMN: Story & Media (7 of 12) */}
                  <div className="space-y-6 lg:col-span-7">
                    
                    {/* Section: Project Identity */}
                    <SectionCard
                      title={t("contentSection")}
                      description={t("contentSectionDescription")}
                      icon={Images}
                    >
                      {isCreating ? (
                        <Field label={t("projectId")} hint="Auto-generated from title or custom ID">
                          <div className="flex items-center gap-2">
                            <input
                              value={editingProject.id}
                              onChange={(event) => {
                                setHasCustomSlug(true);
                                updateEditingProject({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") });
                              }}
                              placeholder="e.g. chiangmai-hill-villa"
                              className="admin-showcase-input font-mono text-xs flex-1"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const autoId = editingProject.title ? generateSlug(editingProject.title) : `proj-${Date.now().toString(36)}`;
                                setHasCustomSlug(false);
                                updateEditingProject({ id: autoId });
                                toast.info("Auto-generated Project ID");
                              }}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#58a6ff]/40 bg-[#58a6ff]/10 px-3 text-xs font-semibold text-[#79c0ff] hover:bg-[#58a6ff]/20 transition-colors shrink-0"
                              title="Auto Generate Project ID"
                            >
                              <Sparkles className="size-3.5" />
                              Auto Generate
                            </button>
                          </div>
                        </Field>
                      ) : null}

                      <Field label={t("projectTitle")}>
                        <input
                          value={editingProject.title}
                          onChange={(event) => {
                            const title = event.target.value;
                            const updates: Partial<ProjectCaseStudy> = { title };
                            if (isCreating && !hasCustomSlug) {
                              const slug = generateSlug(title);
                              if (slug) updates.id = slug;
                            }
                            updateEditingProject(updates);
                          }}
                          className="admin-showcase-input font-medium"
                          placeholder="e.g. Modern Villa Solar 5 kW Rooftop Solution"
                          required
                        />
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("clientName")}>
                          <input
                            value={editingProject.clientName}
                            onChange={(event) => updateEditingProject({ clientName: event.target.value })}
                            className="admin-showcase-input"
                            placeholder="e.g. คุณสมชาย & ครอบครัว"
                          />
                        </Field>
                        <Field label={t("location")}>
                          <input
                            value={editingProject.location}
                            onChange={(event) => updateEditingProject({ location: event.target.value })}
                            className="admin-showcase-input"
                            placeholder="e.g. อ.หางดง, เชียงใหม่"
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("province")}>
                          <select value={editingProject.province} onChange={(event) => updateEditingProject({ province: event.target.value })} className="admin-showcase-input">
                            {THAI_PROVINCES.map((prov) => (
                              <option key={prov.id} value={prov.id}>
                                {prov.nameTh} ({prov.nameEn})
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={t("category")}>
                          <select value={editingProject.category} onChange={(event) => updateEditingProject({ category: event.target.value })} className="admin-showcase-input">
                            <option value="residential">{t("residential")}</option>
                            <option value="villa">{t("villa")}</option>
                            <option value="commercial">{t("commercial")}</option>
                            <option value="industrial">Industrial (โรงงานอุตสาหกรรม)</option>
                            <option value="agricultural">Agricultural (เกษตรกรรม)</option>
                            <option value="other">Other (อื่นๆ)</option>
                          </select>
                        </Field>
                      </div>

                      <Field label={t("summary")}>
                        <textarea
                          value={editingProject.summary}
                          onChange={(event) => updateEditingProject({ summary: event.target.value })}
                          rows={4}
                          className="admin-showcase-input resize-y"
                          placeholder="Short summary highlighting customer benefits and system impact..."
                        />
                      </Field>

                      <Field label={t("tags")} hint={t("tagsHint")}>
                        <input
                          value={editingProject.tags.join(", ")}
                          onChange={(event) => updateEditingProject({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
                          className="admin-showcase-input"
                          placeholder={t("addTagPlaceholder")}
                        />
                      </Field>
                    </SectionCard>

                    {/* Section: Primary & Multi-Gallery Media Manager */}
                    <SectionCard
                      title={t("gallerySection")}
                      description={t("gallerySectionDescription")}
                      icon={Images}
                    >
                      {/* Primary Cover Image */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#58a6ff]">
                            {t("heroImage")}
                          </span>
                          <span className="text-[11px] text-[#8b949e]">Required primary card cover</span>
                        </div>
                        <ShowcaseCoverUploader
                          projectId={editingProject.id}
                          value={editingProject.heroImage}
                          alt={editingProject.title}
                          onChange={(value) => updateEditingProject({ heroImage: value })}
                          onClear={() => updateEditingProject({ heroImage: "" })}
                        />
                      </div>

                      {/* Multi-Photo Gallery Manager */}
                      <div className="mt-6 space-y-2 border-t border-[#30363d]/80 pt-5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#f0f6fc]">
                            Project Gallery ({editingProject.galleryImages.length}/48)
                          </span>
                          <span className="text-[11px] text-[#8b949e]">Supports multiple photos</span>
                        </div>
                        <ShowcaseGalleryManager
                          projectId={editingProject.id}
                          images={editingProject.galleryImages}
                          heroImage={editingProject.heroImage}
                          onChange={(galleryImages) => updateEditingProject({ galleryImages })}
                          onSetAsCover={(url) => updateEditingProject({ heroImage: url })}
                        />
                      </div>
                    </SectionCard>

                  </div>

                  {/* RIGHT COLUMN: Specs, Financials & Quote (5 of 12) */}
                  <div className="space-y-6 lg:col-span-5">

                    {/* Section: Technical System Engineering */}
                    <SectionCard
                      title={t("systemSection")}
                      description={t("systemSectionDescription")}
                      icon={Zap}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("solarSize")}>
                          <input type="number" min="0" step="0.1" value={editingProject.solarSizeKw} onChange={(event) => updateEditingProject({ solarSizeKw: Number(event.target.value) })} className="admin-showcase-input" />
                        </Field>
                        <Field label={t("panelCount")}>
                          <input type="number" min="0" step="1" value={editingProject.panelCount} onChange={(event) => updateEditingProject({ panelCount: Number(event.target.value) })} className="admin-showcase-input" />
                        </Field>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("inverter")}>
                          <input value={editingProject.inverterModel} onChange={(event) => updateEditingProject({ inverterModel: event.target.value })} className="admin-showcase-input" placeholder="e.g. Huawei SUN2000" />
                        </Field>
                        <Field label={t("completionYear")}>
                          <input value={editingProject.completionYear} onChange={(event) => updateEditingProject({ completionYear: event.target.value })} className="admin-showcase-input" placeholder="2026" />
                        </Field>
                      </div>

                      <Field label={t("battery")} hint="Leave empty if grid-tied only">
                        <input
                          value={editingProject.batteryBackup ?? ""}
                          onChange={(event) => updateEditingProject({ batteryBackup: event.target.value || undefined })}
                          className="admin-showcase-input"
                          placeholder={t("noBattery")}
                        />
                      </Field>
                    </SectionCard>

                    {/* Section: Financial Savings & Carbon Offset */}
                    <SectionCard
                      title="Financial ROI & Carbon Offset"
                      description="Visible performance facts and customer bill reductions."
                      icon={Coins}
                      badge={
                        billSavingsDelta ? (
                          <span className="rounded-full border border-[#238636]/50 bg-[#238636]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#3fb950]">
                            {t("billDeltaBadge", { amount: billSavingsDelta.diff.toLocaleString(), percent: billSavingsDelta.pct })}
                          </span>
                        ) : null
                      }
                    >
                      <div className="flex items-center justify-between rounded-lg border border-[#30363d] bg-[#0d1117] p-3 mb-2">
                        <div>
                          <span className="text-xs font-bold text-[#f0f6fc]">Display Financial ROI & Carbon Offset</span>
                          <p className="text-[11px] text-[#8b949e]">Toggle on to display financial savings, payback period, and CO2 offset metrics on public project cards.</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={editingProject.showFinancials !== false}
                          onClick={() => updateEditingProject({ showFinancials: editingProject.showFinancials === false ? true : false })}
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                            editingProject.showFinancials !== false ? "bg-[#238636]" : "bg-[#30363d]"
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 size-5 rounded-full bg-[#f0f6fc] transition-[left]",
                              editingProject.showFinancials !== false ? "left-5.5" : "left-0.5"
                            )}
                          />
                        </button>
                      </div>

                      <div className={cn("space-y-4 transition-opacity", editingProject.showFinancials === false && "opacity-40 pointer-events-none")}>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label={t("monthlySavings")}>
                            <input type="number" min="0" step="1" value={editingProject.monthlySavingsThb} onChange={(event) => updateEditingProject({ monthlySavingsThb: Number(event.target.value) })} className="admin-showcase-input" />
                          </Field>
                          <Field label={t("annualCo2")}>
                            <input type="number" min="0" step="0.1" value={editingProject.annualCo2SavedTons} onChange={(event) => updateEditingProject({ annualCo2SavedTons: Number(event.target.value) })} className="admin-showcase-input" />
                          </Field>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field label={t("beforeBill")}>
                            <input type="number" min="0" step="1" value={editingProject.beforeAfter.beforeBillThb} onChange={(event) => updateBeforeAfter("beforeBillThb", Number(event.target.value))} className="admin-showcase-input" />
                          </Field>
                          <Field label={t("afterBill")}>
                            <input type="number" min="0" step="1" value={editingProject.beforeAfter.afterBillThb} onChange={(event) => updateBeforeAfter("afterBillThb", Number(event.target.value))} className="admin-showcase-input" />
                          </Field>
                          <Field label={t("payback")}>
                            <input type="number" min="0" step="0.1" value={editingProject.beforeAfter.paybackYears} onChange={(event) => updateBeforeAfter("paybackYears", Number(event.target.value))} className="admin-showcase-input" />
                          </Field>
                        </div>
                      </div>
                    </SectionCard>

                    {/* Section: Customer Testimonial */}
                    <SectionCard
                      title={t("quoteSection")}
                      description={t("quoteSectionDescription")}
                      icon={MessageSquareQuote}
                      action={
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(editingProject.quote)}
                          onClick={() => updateEditingProject({ quote: editingProject.quote ? undefined : { text: "", author: "", role: "" } })}
                          className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", editingProject.quote ? "bg-[#238636]" : "bg-[#30363d]")}
                        >
                          <span className={cn("absolute top-0.5 size-5 rounded-full bg-[#f0f6fc] transition-[left]", editingProject.quote ? "left-5" : "left-0.5")} />
                        </button>
                      }
                    >
                      {editingProject.quote ? (
                        <div className="space-y-4 pt-1">
                          <Field label={t("quoteText")}>
                            <textarea
                              value={editingProject.quote.text}
                              onChange={(event) => updateQuote({ text: event.target.value })}
                              rows={3}
                              className="admin-showcase-input resize-y"
                              placeholder="Direct feedback from customer..."
                            />
                          </Field>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={t("quoteAuthor")}>
                              <input value={editingProject.quote.author} onChange={(event) => updateQuote({ author: event.target.value })} className="admin-showcase-input" placeholder="e.g. คุณชัยวัฒน์" />
                            </Field>
                            <Field label={t("quoteRole")}>
                              <input value={editingProject.quote.role} onChange={(event) => updateQuote({ role: event.target.value })} className="admin-showcase-input" placeholder="e.g. เจ้าของบ้าน อ.หางดง" />
                            </Field>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[#8b949e]">Toggle on to display a customer quote on the project detail modal.</p>
                      )}
                    </SectionCard>

                  </div>

                </div>
              </div>

              {/* Modal Sticky Bottom Action Footer */}
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#30363d] bg-[#161b22] px-6 py-4">
                <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                  <span className="rounded bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#c9d1d9]">Ctrl+S / ⌘S</span>
                  <span>{t("keyboardSaveHint")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingProject(null)}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#30363d] px-4 text-sm font-semibold text-[#c9d1d9] transition-colors hover:bg-[#21262d]"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isProjectPending}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#238636] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2ea043] disabled:cursor-wait disabled:opacity-60 shadow-sm"
                  >
                    <Save className="size-4" aria-hidden="true" />
                    {isProjectPending ? t("savingProject") : (isCreating ? t("createProject") : t("saveProject"))}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {/* Remove Confirmation Dialog */}
      {projectToRemove ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-[#010409]/80 backdrop-blur-[2px]" data-showcase-remove-dialog="true">
          <button
            type="button"
            aria-label={t("cancelRemoveProject")}
            onClick={() => {
              if (!isRemovePending) setProjectToRemove(null);
            }}
            className="absolute inset-0 h-full w-full"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-showcase-project-title"
            className="relative w-full max-w-md rounded-xl border border-[#30363d] bg-[#161b22] p-5 text-[#c9d1d9] shadow-2xl sm:p-6"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#f85149]/10 text-[#ff7b72]">
              <Trash2 className="size-5" aria-hidden="true" />
            </div>
            <h2 id="remove-showcase-project-title" className="mt-4 text-lg font-semibold text-[#f0f6fc]">
              {t("removeProjectTitle")}
            </h2>
            <div className="mt-2 text-sm leading-6 text-[#8b949e]">
              {t("removeProjectDescription", { title: projectToRemove.title })}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setProjectToRemove(null)}
                disabled={isRemovePending}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#30363d] px-4 text-sm font-semibold text-[#c9d1d9] transition-colors hover:bg-[#21262d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleRemoveProject}
                disabled={isRemovePending}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#b62324] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#da3633] disabled:cursor-wait disabled:opacity-60"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {isRemovePending ? t("removingProject") : t("confirmRemoveProject")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
