"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Layers, 
  X, 
  AlertTriangle,
  Folder,
  ChevronDown,
  ChevronRight,
  Search
} from "@/components/ui/icons";
import LiveSerpPreview from "@/components/admin/LiveSerpPreview";
import { 
  createCategory, 
  updateCategory, 
  deleteCategory,
  createBlueprint,
  deleteBlueprint
} from "./actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GsapPulse, GsapReveal } from "@/components/ui/GsapMotion";
import { ContentLocaleTabs } from "@/components/admin/ContentLocaleTabs";
import type { Locale } from "@/i18n/locales";

type CategoryTranslations = Partial<Record<Locale, { name?: string; description?: string | null }>>;

interface CategoryWithProducts {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  displayOrder: number;
  isRequired: boolean;
  allowMultiple: boolean;
  blueprintId: string | null;
  parentId: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  seoImage?: string | null;
  translations?: CategoryTranslations | null;
  _count: {
    products: number;
  };
}

interface Blueprint {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
}

interface CategoriesListProps {
  initialCategories: CategoryWithProducts[];
  initialBlueprints: Blueprint[];
  selectedBlueprintId: string;
}

function withProductCount(
  category: Omit<CategoryWithProducts, "_count">,
  productCount = 0,
): CategoryWithProducts {
  return {
    ...category,
    _count: { products: productCount },
  };
}

export default function CategoriesList({ 
  initialCategories,
  initialBlueprints,
  selectedBlueprintId: propSelectedBlueprintId
}: CategoriesListProps) {
  const router = useRouter();
  const t = useTranslations("BuildCategories");
  const [categories, setCategories] = useState<CategoryWithProducts[]>(initialCategories);
  const [blueprints, setBlueprints] = useState<Blueprint[]>(initialBlueprints);
  
  // Active Blueprint state (default to dynamic parameter)
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>(propSelectedBlueprintId);

  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBpAddOpen, setIsBpAddOpen] = useState(false);
  const [isBpDeleteOpen, setIsBpDeleteOpen] = useState(false);

  // Form states (Categories)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isRequired, setIsRequired] = useState(true);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [seoImage, setSeoImage] = useState("");
  const [contentLocale, setContentLocale] = useState<Locale>("th");
  const [translations, setTranslations] = useState<CategoryTranslations>({});
  const [localizedName, setLocalizedName] = useState("");
  const [localizedDescription, setLocalizedDescription] = useState("");

  // Form states (Blueprints)
  const [bpName, setBpName] = useState("");
  const [bpSlug, setBpSlug] = useState("");
  const [bpDescription, setBpDescription] = useState("");

  // Collapsed tree nodes map
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // Active blueprint metadata
  const activeBlueprint = blueprints.find(bp => bp.id === selectedBlueprintId);

  // Filter categories to only those belonging to the active Blueprint
  const activeCategories = categories.filter(c => c.blueprintId === selectedBlueprintId);

  // Build Parent-Child map
  const parentToChildrenMap: Record<string, CategoryWithProducts[]> = {};
  activeCategories.forEach(cat => {
    if (cat.parentId) {
      if (!parentToChildrenMap[cat.parentId]) {
        parentToChildrenMap[cat.parentId] = [];
      }
      parentToChildrenMap[cat.parentId].push(cat);
    }
  });

  // Find root categories for active blueprint
  const rootCategories = activeCategories.filter(cat => {
    // A node is a root if it has no parentId, OR if its parentId is not present in active categories
    return !cat.parentId || !activeCategories.some(c => c.id === cat.parentId);
  });

  // Auto slug generation for categories
  const handleNameChange = (val: string) => {
    setName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-");
    setSlug(generatedSlug);
  };

  // Auto slug generation for blueprints
  const handleBpNameChange = (val: string) => {
    setBpName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-");
    setBpSlug(generatedSlug);
  };

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const openAddModal = (defaultParentId: string | null = null) => {
    setName("");
    setDescription("");
    setSlug("");
    setDisplayOrder(activeCategories.length);
    setIsRequired(true);
    setAllowMultiple(false);
    setParentId(defaultParentId);
    setSeoTitle("");
    setSeoDescription("");
    setSeoKeywords("");
    setSeoImage("");
    setTranslations({});
    setLocalizedName("");
    setLocalizedDescription("");
    setIsAddOpen(true);
  };

  const openEditModal = (cat: CategoryWithProducts) => {
    setSelectedId(cat.id);
    setName(cat.name);
    setDescription(cat.description || "");
    setSlug(cat.slug);
    setDisplayOrder(cat.displayOrder);
    setIsRequired(cat.isRequired);
    setAllowMultiple(cat.allowMultiple);
    setParentId(cat.parentId);
    setSeoTitle(cat.seoTitle || "");
    setSeoDescription(cat.description || ""); // Fallback description
    if (cat.seoDescription) setSeoDescription(cat.seoDescription);
    setSeoKeywords(cat.seoKeywords || "");
    setSeoImage(cat.seoImage || "");
    const nextTranslations = cat.translations ?? {};
    setTranslations(nextTranslations);
    setLocalizedName(nextTranslations[contentLocale]?.name ?? cat.name);
    setLocalizedDescription(nextTranslations[contentLocale]?.description ?? cat.description ?? "");
    setIsEditOpen(true);
  };

  const changeContentLocale = (nextLocale: Locale) => {
    setTranslations((current) => ({
      ...current,
      [contentLocale]: { name: localizedName, description: localizedDescription || null },
    }));
    const next = translations[nextLocale];
    setContentLocale(nextLocale);
    setLocalizedName(next?.name ?? name);
    setLocalizedDescription(next?.description ?? description);
  };

  const localizedPayload = (): CategoryTranslations => ({
    ...translations,
    [contentLocale]: { name: localizedName || name, description: localizedDescription || null },
  });

  const openDeleteModal = (cat: CategoryWithProducts) => {
    setSelectedId(cat.id);
    setName(cat.name);
    setIsDeleteOpen(true);
  };

  // Submission handlers
  const handleCategoryAdd = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await createCategory({
          name,
          description,
          slug,
          displayOrder,
          isRequired,
          allowMultiple,
          blueprintId: selectedBlueprintId,
          parentId: parentId || null,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
          seoKeywords: seoKeywords.trim() || null,
          seoImage: seoImage.trim() || null,
          translations: localizedPayload(),
        });

        if (res.success) {
          toast.success(res.message);
          setIsAddOpen(false);
          if (res.category) {
            setCategories((current) => [
              ...current,
              withProductCount(res.category),
            ]);
          }
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Failed to create category:", error);
        toast.error("Could not create the category. Please try again.");
      }
    });
  };

  const handleCategoryEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    startTransition(async () => {
      try {
        const res = await updateCategory(selectedId, {
          name,
          description,
          slug,
          displayOrder,
          isRequired,
          allowMultiple,
          blueprintId: selectedBlueprintId,
          parentId: parentId || null,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
          seoKeywords: seoKeywords.trim() || null,
          seoImage: seoImage.trim() || null,
          translations: localizedPayload(),
        });

        if (res.success) {
          toast.success(res.message);
          setIsEditOpen(false);
          if (res.category) {
            setCategories((current) => current.map((category) => (
              category.id === selectedId
                ? withProductCount(res.category, category._count.products)
                : category
            )));
          }
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Failed to update category:", error);
        toast.error("Could not update the category. Please try again.");
      }
    });
  };

  const handleCategoryDelete = () => {
    if (!selectedId) return;
    startTransition(async () => {
      try {
        const res = await deleteCategory(selectedId);
        if (res.success) {
          toast.success(res.message);
          setIsDeleteOpen(false);
          setCategories((current) => current.filter((category) => category.id !== selectedId));
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Failed to delete category:", error);
        toast.error("Could not delete the category. Please try again.");
      }
    });
  };

  const handleBlueprintAdd = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await createBlueprint({
          name: bpName,
          slug: bpSlug,
          description: bpDescription
        });

        if (res.success && res.data) {
          toast.success(res.message);
          setIsBpAddOpen(false);
          setBpName("");
          setBpSlug("");
          setBpDescription("");
          setSelectedBlueprintId(res.data.id);
          setBlueprints((current) => [...current, res.data]);
          router.push(`/admin/build/${res.data.id}`);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Failed to create blueprint:", error);
        toast.error("Could not create the blueprint. Please try again.");
      }
    });
  };

  const handleBlueprintDelete = () => {
    if (!selectedBlueprintId) return;
    if (activeCategories.length > 0) {
      toast.error("Cannot delete a blueprint that contains step categories. Delete categories first!");
      setIsBpDeleteOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        const res = await deleteBlueprint(selectedBlueprintId);
        if (res.success) {
          toast.success(res.message);
          setIsBpDeleteOpen(false);

          // Find next active blueprint
          const remaining = blueprints.filter(bp => bp.id !== selectedBlueprintId);
          if (remaining.length > 0) {
            setSelectedBlueprintId(remaining[0].id);
            router.push(`/admin/build/${remaining[0].id}`);
          } else {
            setSelectedBlueprintId("");
            router.push("/admin/build");
          }
          setBlueprints(remaining);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Failed to delete blueprint:", error);
        toast.error("Could not delete the blueprint. Please try again.");
      }
    });
  };

  // Recursive Tree Node component
  const renderTreeNode = (cat: CategoryWithProducts, depth: number = 0) => {
    const children = parentToChildrenMap[cat.id] || [];
    const isCollapsed = collapsedNodes[cat.id];
    const hasChildren = children.length > 0;

    return (
      <div key={cat.id} className="relative space-y-3">
        {/* Node Box */}
        <div className="group flex items-center justify-between gap-4 bg-[#0F172A] hover:bg-[#0B1121] border border-[#1E293B] hover:border-[#1E293B] px-5 py-4 rounded-2xl transition-all duration-300 shadow-none relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-[#B7D1EA]/10 group-hover:bg-[#B7D1EA]/30 transition-colors pointer-events-none" />

          {/* Left Details */}
          <div className="flex items-center gap-3 min-w-0 z-10">
            {/* Collapse toggle */}
            {hasChildren ? (
              <button 
                onClick={() => toggleCollapse(cat.id)}
                className="p-1 text-gray-500 hover:text-gray-300 rounded-lg hover:bg-[#0B1121] transition-colors shrink-0 cursor-pointer"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-[#B7D1EA]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#B7D1EA]" />
                )}
              </button>
            ) : (
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </div>
            )}

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-gray-100 truncate uppercase tracking-wider">
                  {cat.name}
                </span>
                
                {/* Badges */}
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border shrink-0",
                  cat.isRequired
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                )}>
                  {cat.isRequired ? t("badges.required") : t("badges.optional")}
                </span>

                {cat.allowMultiple && (
                  <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">
                    {t("badges.multiSelect")}
                  </span>
                )}
              </div>

              {cat.description && (
                <p className="text-[10px] text-gray-400 truncate max-w-[200px] sm:max-w-xs md:max-w-md font-semibold">
                  {cat.description}
                </p>
              )}
            </div>
          </div>

          {/* Actions & Components Indicator */}
          <div className="flex items-center gap-3 shrink-0 z-10">
            <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest text-[#B7D1EA]">
              <span className="font-mono text-xs font-black mr-1">{cat._count.products}</span> {t("components")}
            </span>

            <div className="flex items-center gap-1.5">
              {/* Add Child Trigger */}
              <button
                onClick={() => openAddModal(cat.id)}
                className="p-2 bg-[#0B1121] border border-[#1E293B] hover:bg-[#0B1121] text-[#B7D1EA] rounded-xl transition-all cursor-pointer"
                title={t("actions.addChildStep")}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              
              <button
                onClick={() => openEditModal(cat)}
                className="p-2 bg-[#0B1121] border border-[#1E293B] hover:bg-[#0B1121] text-gray-400 hover:text-gray-100 rounded-xl transition-all cursor-pointer"
                title={t("actions.editStep")}
              >
                <Edit className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDeleteModal(cat);
                }}
                className="p-2 bg-rose-500/10 border border-rose-200 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl transition-all cursor-pointer"
                title={t("actions.deleteStep")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Recursive Children display with visual line indentation */}
        {hasChildren && !isCollapsed && (
          <div className="relative pl-6 md:pl-10 space-y-3">
            {/* Visual tree vertical connection line */}
            <div className="absolute left-3 top-0 bottom-6 w-0.5 bg-[#1E293B] border-l border-dashed border-[#1E293B] pointer-events-none" />
            
            {children
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map(child => renderTreeNode(child, depth + 1))
            }
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* 1. BLUEPRINT SELECTOR TOOLBAR */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2.5rem] p-6 shadow-none flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA]">
            <Folder className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-[#B7D1EA]">{t("blueprint.activeConfigurator")}</label>
            <div className="flex items-center gap-2">
              <select
                value={selectedBlueprintId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedBlueprintId(newId);
                  router.push(`/admin/build/${newId}`);
                }}
                className="bg-[#0F172A] border border-[#1E293B] text-gray-100 font-black text-xs rounded-xl py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] tracking-wide font-sans cursor-pointer"
              >
                {blueprints.map(bp => (
                  <option key={bp.id} value={bp.id} className="font-bold">
                    {bp.name}
                  </option>
                ))}
              </select>

              <Link
                href="/admin/build"
                className="px-4 py-2.5 bg-[#0B1121] hover:bg-[#0B1121] border border-[#1E293B] text-gray-400 hover:text-slate-850 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer font-sans"
              >
                {t("blueprint.allBuilds")}
              </Link>

              <button
                onClick={() => setIsBpAddOpen(true)}
                className="p-2.5 bg-[#0B1121] hover:bg-[#0B1121] border border-[#1E293B] text-[#B7D1EA] rounded-xl transition-all cursor-pointer"
                title={t("blueprint.createNew")}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {blueprints.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsBpDeleteOpen(true);
                  }}
                  className="p-2.5 bg-rose-500/10 border border-rose-200 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl transition-all cursor-pointer"
                  title={t("blueprint.deleteActive")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Blueprint description card */}
        {activeBlueprint && (
          <div className="flex-1 max-w-md bg-[#0B1121] border border-[#1E293B] p-4 rounded-2xl">
            <span className="text-[9px] uppercase tracking-widest font-black text-[#B7D1EA]">{t("blueprint.description")}</span>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed font-semibold">
              {activeBlueprint.description || t("blueprint.noDescription")}
            </p>
          </div>
        )}
      </div>

      {/* 2. CATEGORIES TREE VIEW CANVAS */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2.5rem] p-6 md:p-8 shadow-none space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#1E293B]">
          <div>
            <h2 className="text-base font-black text-gray-100 uppercase tracking-wide">{t("tree.title")}</h2>
            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{t("tree.description")}</p>
          </div>
          
          <button
            onClick={() => openAddModal(null)}
            className="px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-none shadow-[#B7D1EA]/10 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t("actions.addRootStep")}
          </button>
        </div>

        {rootCategories.length > 0 ? (
          <div className="space-y-4 pt-2">
            {rootCategories
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map(rootCat => renderTreeNode(rootCat, 0))
            }
          </div>
        ) : (
          <div className="bg-[#0B1121]/70 rounded-[2.5rem] p-16 text-center border border-[#1E293B] max-w-xl mx-auto space-y-6 relative overflow-hidden">
            {/* Soft decorative background dot grid inside the card */}
            <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-70 pointer-events-none" />
            
            <div className="relative space-y-4">
              <GsapPulse className="w-20 h-20 rounded-full bg-[#0F172A] border border-[#1E293B] flex items-center justify-center text-[#B7D1EA] mx-auto shadow-none relative z-10">
                <Layers className="w-10 h-10" />
              </GsapPulse>
              <div className="space-y-2">
                <h3 className="text-base font-black text-gray-100 uppercase tracking-widest">{t("empty.title")}</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto font-semibold leading-relaxed">
                  {t("empty.description")}
                </p>
              </div>
              <button 
                onClick={() => openAddModal(null)}
                className="mt-4 px-6 py-3.5 bg-[#B7D1EA] text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-[#99BFE3] transition-all hover:scale-105 duration-200 shadow-none shadow-[#B7D1EA]/15 hover:shadow-[#B7D1EA]/30 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {t("actions.addFirstStep")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- */}
      {/* DIALOG 1: ADD CATEGORY STEP                               */}
      {/* --------------------------------------------------------- */}
      {isAddOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]" onClick={() => setIsAddOpen(false)} />
          
          <GsapReveal className="relative z-[100] flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-[#1E293B] bg-[#0F172A] p-5 shadow-none sm:rounded-[2.5rem] sm:p-8">
            <button 
              onClick={() => setIsAddOpen(false)}
              className="absolute right-6 top-6 p-2 hover:bg-[#0B1121] rounded-xl border border-[#1E293B] text-gray-500 hover:text-slate-650 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-black text-gray-100 uppercase tracking-widest flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#B7D1EA]" />
              {t("form.addCategoryStep")}
            </h3>
            <p className="text-[10px] text-gray-400 mt-1 uppercase font-black tracking-wider">{t("form.defineNode", { blueprint: activeBlueprint?.name ?? "" })}</p>

            <form onSubmit={handleCategoryAdd} className="flex flex-col flex-1 min-h-0 overflow-hidden mt-6">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                
                {/* Section 1: Basic Information */}
                <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest pb-2 border-b border-[#1E293B]">
                    {t("form.basicInformation")}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2">{t("form.stepName")}</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder={t("form.stepNamePlaceholder")}
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2">{t("form.urlSlug")}</label>
                      <input
                        type="text"
                        required
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="e.g. panels"
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2">{t("form.description")}</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("form.descriptionPlaceholder")}
                      rows={2}
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                    />
                  </div>

                  <div className="rounded-xl border border-[#1E293B] bg-[#0F172A] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs font-bold text-gray-100">{t("form.localizedContent")}</span>
                      <ContentLocaleTabs locale={contentLocale} onChange={changeContentLocale} />
                    </div>
                    <label className="block text-xs font-semibold text-gray-200">{t("form.localizedName")}
                      <input value={localizedName} onChange={(event) => setLocalizedName(event.target.value)} className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2 text-gray-100" />
                    </label>
                    <label className="block text-xs font-semibold text-gray-200">{t("form.localizedDescription")}
                      <textarea value={localizedDescription} onChange={(event) => setLocalizedDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2 text-gray-100" />
                    </label>
                  </div>
                </div>

                {/* Section 2: Configuration Rules */}
                <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest pb-2 border-b border-[#1E293B]">
                    {t("form.configurationRules")}
                  </h4>
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-100 mb-2">{t("form.parentCategory")}</label>
                    <select
                      value={parentId || ""}
                      onChange={(e) => setParentId(e.target.value || null)}
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-3 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold cursor-pointer"
                    >
                      <option value="" className="text-gray-500">{t("form.rootNode")}</option>
                      {activeCategories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
                      <div className="space-y-0.5 flex flex-col">
                        <span className="text-xs font-bold text-gray-100">{t("badges.required")}</span>
                        <p className="text-[10px] text-gray-400 font-semibold">{t("form.userMustSelect")}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsRequired(!isRequired)}
                        className={cn(
                          "w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer border border-[#1E293B]",
                          isRequired ? "bg-[#B7D1EA]" : "bg-slate-300"
                        )}
                      >
                        <div className={cn("w-4.5 h-4.5 rounded-full bg-[#0F172A] transition-all transform", isRequired ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
                      <div className="space-y-0.5 flex flex-col">
                        <span className="text-xs font-bold text-gray-100">{t("badges.multiSelect")}</span>
                        <p className="text-[10px] text-gray-400 font-semibold">{t("form.allowMultiple")}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllowMultiple(!allowMultiple)}
                        className={cn(
                          "w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer border border-[#1E293B]",
                          allowMultiple ? "bg-[#B7D1EA]" : "bg-slate-300"
                        )}
                      >
                        <div className={cn("w-4.5 h-4.5 rounded-full bg-[#0F172A] transition-all transform", allowMultiple ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 3: SEO Search Config */}
                <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest pb-2 border-b border-[#1E293B] flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-[#B7D1EA]" />
                    {t("form.seoConfig")}
                  </h4>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2 flex justify-between font-sans">
                        <span>{t("form.seoTitle")}</span>
                        <span className={seoTitle.length > 60 ? "text-rose-500 font-bold" : "text-gray-500"}>
                          {seoTitle.length} / 60
                        </span>
                      </label>
                      <input
                        type="text"
                        value={seoTitle}
                        onChange={(e) => setSeoTitle(e.target.value)}
                        placeholder={t("form.seoTitlePlaceholder")}
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-2.5 px-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2 flex justify-between font-sans">
                        <span>{t("form.seoDescription")}</span>
                        <span className={seoDescription.length > 155 ? "text-rose-500 font-bold" : "text-gray-500"}>
                          {seoDescription.length} / 155
                        </span>
                      </label>
                      <textarea
                        value={seoDescription}
                        onChange={(e) => setSeoDescription(e.target.value)}
                        placeholder={t("form.seoDescriptionPlaceholder")}
                        rows={2}
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-2.5 px-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold resize-none"
                      />
                    </div>

                    <LiveSerpPreview
                      title={seoTitle || name}
                      description={seoDescription || description}
                      url={`https://solar.crafted.com/catalog/category/${slug || "new-category"}`}
                    />
                  </div>
                </div>

              </div>

              {/* Sticky Footer */}
              <div className="sticky bottom-0 bg-[#0F172A] pt-6 border-t border-[#1E293B] flex justify-end gap-3 z-10 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-6 py-3.5 border border-slate-355 text-gray-400 hover:text-slate-805 rounded-xl text-xs font-black hover:bg-[#0B1121] cursor-pointer uppercase tracking-widest"
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-6 py-3.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40 shadow-none shadow-[#B7D1EA]/10"
                >
                  {isPending ? t("actions.adding") : t("actions.addStepNode")}
                </button>
              </div>
            </form>
          </GsapReveal>
        </div>,
        document.body
      )}

      {/* --------------------------------------------------------- */}
      {/* DIALOG 2: EDIT CATEGORY STEP                              */}
      {/* --------------------------------------------------------- */}
      {isEditOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]" onClick={() => setIsEditOpen(false)} />
          
          <GsapReveal className="relative z-[100] flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-[#1E293B] bg-[#0F172A] p-5 shadow-none sm:rounded-[2.5rem] sm:p-8">
            <button 
              onClick={() => setIsEditOpen(false)}
              className="absolute right-6 top-6 p-2 hover:bg-[#0B1121] rounded-xl border border-[#1E293B] text-gray-500 hover:text-slate-650 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-black text-gray-100 uppercase tracking-widest flex items-center gap-2">
              <Edit className="w-5 h-5 text-[#B7D1EA]" />
              Modify Category Step
            </h3>
            <p className="text-[10px] text-gray-400 mt-1 uppercase font-black tracking-wider">Update node constraints inside {activeBlueprint?.name}.</p>

            <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#0B1121] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-gray-100">Localized display content</span>
                <ContentLocaleTabs locale={contentLocale} onChange={changeContentLocale} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-gray-200">Localized name
                  <input value={localizedName} onChange={(event) => setLocalizedName(event.target.value)} className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-gray-100" />
                </label>
                <label className="text-xs font-semibold text-gray-200">Localized description
                  <textarea value={localizedDescription} onChange={(event) => setLocalizedDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-gray-100" />
                </label>
              </div>
            </div>

            <form onSubmit={handleCategoryEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden mt-6">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                
                {/* Section 1: Basic Information */}
                <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest pb-2 border-b border-[#1E293B]">
                    Section 1: Basic Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2">Step Name</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="e.g. Solar Panels, Battery Pack"
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2">URL Slug</label>
                      <input
                        type="text"
                        required
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="e.g. panels"
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-100 mb-2">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Instructions for this visual segment..."
                      rows={2}
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                    />
                  </div>
                </div>

                {/* Section 2: Configuration Rules */}
                <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest pb-2 border-b border-[#1E293B]">
                    Section 2: Configuration Rules
                  </h4>
                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-100 mb-2">Parent Category (Tree Linkage)</label>
                    <select
                      value={parentId || ""}
                      onChange={(e) => setParentId(e.target.value || null)}
                      className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-3 px-3 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold cursor-pointer"
                    >
                      <option value="" className="text-gray-500">None (Create as Root Node)</option>
                      {activeCategories
                        .filter(c => c.id !== selectedId) // Prevent circular reference
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
                      <div className="space-y-0.5 flex flex-col">
                        <span className="text-xs font-bold text-gray-100">Required</span>
                        <p className="text-[10px] text-gray-400 font-semibold">User must select</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsRequired(!isRequired)}
                        className={cn(
                          "w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer border border-[#1E293B]",
                          isRequired ? "bg-[#B7D1EA]" : "bg-slate-300"
                        )}
                      >
                        <div className={cn("w-4.5 h-4.5 rounded-full bg-[#0F172A] transition-all transform", isRequired ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl bg-[#0F172A] border border-[#1E293B]">
                      <div className="space-y-0.5 flex flex-col">
                        <span className="text-xs font-bold text-gray-100">Multi-Select</span>
                        <p className="text-[10px] text-gray-400 font-semibold">Allow multiple items</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllowMultiple(!allowMultiple)}
                        className={cn(
                          "w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer border border-[#1E293B]",
                          allowMultiple ? "bg-[#B7D1EA]" : "bg-slate-300"
                        )}
                      >
                        <div className={cn("w-4.5 h-4.5 rounded-full bg-[#0F172A] transition-all transform", allowMultiple ? "translate-x-4" : "translate-x-0")} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 3: SEO Search Config */}
                <div className="border border-[#1E293B] bg-[#0B1121]/70 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest pb-2 border-b border-[#1E293B] flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-[#B7D1EA]" />
                    Section 3: SEO Search Config
                  </h4>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2 flex justify-between font-sans">
                        <span>SEO Custom Title</span>
                        <span className={seoTitle.length > 60 ? "text-rose-500 font-bold" : "text-gray-500"}>
                          {seoTitle.length} / 60
                        </span>
                      </label>
                      <input
                        type="text"
                        value={seoTitle}
                        onChange={(e) => setSeoTitle(e.target.value)}
                        placeholder="If left blank, category name is used"
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-2.5 px-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-gray-100 mb-2 flex justify-between font-sans">
                        <span>SEO Custom Description</span>
                        <span className={seoDescription.length > 155 ? "text-rose-500 font-bold" : "text-gray-500"}>
                          {seoDescription.length} / 155
                        </span>
                      </label>
                      <textarea
                        value={seoDescription}
                        onChange={(e) => setSeoDescription(e.target.value)}
                        placeholder="Custom search results meta description"
                        rows={2}
                        className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-2.5 px-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold resize-none"
                      />
                    </div>

                    <LiveSerpPreview
                      title={seoTitle || name}
                      description={seoDescription || description}
                      url={`https://solar.crafted.com/catalog/category/${slug || "category"}`}
                    />
                  </div>
                </div>

              </div>

              {/* Sticky Footer */}
              <div className="sticky bottom-0 bg-[#0F172A] pt-6 border-t border-[#1E293B] flex justify-end gap-3 z-10 mt-6">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-6 py-3.5 border border-slate-355 text-gray-400 hover:text-slate-805 rounded-xl text-xs font-black hover:bg-[#0B1121] cursor-pointer uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-6 py-3.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40 shadow-none shadow-[#B7D1EA]/10"
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </GsapReveal>
        </div>,
        document.body
      )}

      {/* --------------------------------------------------------- */}
      {/* DIALOG 3: DELETE CONFIRMATION                              */}
      {/* --------------------------------------------------------- */}
      {isDeleteOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]" onClick={() => setIsDeleteOpen(false)} />
          
          <GsapReveal className="bg-[#0F172A] border border-[#1E293B] rounded-[2.5rem] p-6 max-w-sm w-full relative z-[100] shadow-none text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-black text-gray-100 uppercase tracking-wider">Delete Step Category?</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed font-semibold">
              Delete the step category <strong>&quot;{name}&quot;</strong>? This will cascade-delete all child steps recursively, and all linked components. This cannot be undone!
            </p>

            <div className="flex gap-3 mt-8 pt-4 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="flex-1 py-3.5 border border-[#1E293B] text-gray-400 hover:text-slate-850 rounded-xl text-xs font-black hover:bg-[#0B1121] cursor-pointer uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCategoryDelete();
                }}
                disabled={isPending}
                className="flex-1 py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-black transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40"
              >
                {isPending ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </GsapReveal>
        </div>,
        document.body
      )}

      {/* --------------------------------------------------------- */}
      {/* DIALOG 4: CREATE BLUEPRINT                                */}
      {/* --------------------------------------------------------- */}
      {isBpAddOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]" onClick={() => setIsBpAddOpen(false)} />
          
          <GsapReveal className="bg-[#0F172A] border border-[#1E293B] rounded-[2.5rem] p-6 max-w-md w-full relative z-[100] shadow-none">
            <button 
              onClick={() => setIsBpAddOpen(false)}
              className="absolute right-6 top-6 p-2 hover:bg-[#0B1121] rounded-xl border border-[#1E293B] text-gray-500 hover:text-slate-650 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-gray-100 uppercase tracking-widest flex items-center gap-2">
              <Folder className="w-5 h-5 text-[#B7D1EA]" />
              Create Configurator Blueprint
            </h3>
            <p className="text-[10px] text-gray-400 mt-1 uppercase font-black tracking-wider">Initialize a completely separate product line builder.</p>

            <form onSubmit={handleBlueprintAdd} className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">Blueprint Name</label>
                <input
                  type="text"
                  required
                  value={bpName}
                  onChange={(e) => handleBpNameChange(e.target.value)}
                  placeholder="e.g. Custom Solar Inverters Pack"
                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">Blueprint Slug</label>
                <input
                  type="text"
                  required
                  value={bpSlug}
                  onChange={(e) => setBpSlug(e.target.value)}
                  placeholder="e.g. solar-inverters"
                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">Description</label>
                <textarea
                  value={bpDescription}
                  onChange={(e) => setBpDescription(e.target.value)}
                  placeholder="Summarize components or targeted audience for this blueprint line..."
                  rows={2}
                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl py-3 px-4 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#1E293B]">
                <button
                  type="button"
                  onClick={() => setIsBpAddOpen(false)}
                  className="px-5 py-3 border border-[#1E293B] text-gray-400 hover:text-slate-850 rounded-xl text-xs font-black hover:bg-[#0B1121] cursor-pointer uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40 shadow-none shadow-[#B7D1EA]/10"
                >
                  {isPending ? "Creating..." : "Create Blueprint"}
                </button>
              </div>
            </form>
          </GsapReveal>
        </div>,
        document.body
      )}

      {/* --------------------------------------------------------- */}
      {/* DIALOG 5: DELETE BLUEPRINT CONFIRMATION                   */}
      {/* --------------------------------------------------------- */}
      {isBpDeleteOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]" onClick={() => setIsBpDeleteOpen(false)} />
          
          <GsapReveal className="bg-[#0F172A] border border-[#1E293B] rounded-[2.5rem] p-6 max-w-sm w-full relative z-[100] shadow-none text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-black text-gray-100 uppercase tracking-wider">Delete Configurator Blueprint?</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed font-semibold">
              Delete the blueprint <strong>&quot;{activeBlueprint?.name}&quot;</strong>? This will permanently wipe this configurator blueprint! Steps and products will NOT be deleted, but this is a final action.
            </p>

            <div className="flex gap-3 mt-8 pt-4 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={() => setIsBpDeleteOpen(false)}
                className="flex-1 py-3.5 border border-[#1E293B] text-slate-650 hover:text-slate-850 rounded-xl text-xs font-black hover:bg-[#0B1121] cursor-pointer uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleBlueprintDelete();
                }}
                disabled={isPending}
                className="flex-1 py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-black transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40"
              >
                {isPending ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </GsapReveal>
        </div>,
        document.body
      )}

    </div>
  );
}
