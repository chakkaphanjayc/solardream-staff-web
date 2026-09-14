"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FolderPlus, Search, ShieldCheck, Trash2, Edit, X, FolderTree } from "@/components/ui/icons";
import { createCategory, updateCategory, deleteCategory, syncCategoriesFromErpnextAction } from "@/app/actions/categories";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface CategoryRecord {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  displayOrder: number;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  subCategories?: { id: string; name: string }[];
  children?: { id: string; name: string }[];
  _count: { products: number };
  createdAt: Date | string;
}

interface CategoriesClientProps {
  initialCategories: CategoryRecord[];
  initialError?: string;
}

export default function CategoriesClient({ initialCategories, initialError = "" }: CategoriesClientProps) {
  const t = useTranslations("AdminCategories");
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryRecord[]>(initialCategories);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(initialError);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");

  const handleSyncErpnext = async () => {
    setBusyAction("sync");
    setMessage("");
    try {
      const result = await syncCategoriesFromErpnextAction();
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else {
        setMessage(`Categories synchronized successfully! ${result.categoriesSynced || 0} categories synced, ${result.productsUpdated || 0} products updated.`);
        router.refresh();
      }
    } catch (err: unknown) {
      setMessage(`Error: ${err instanceof Error ? err.message : "An unexpected error occurred."}`);
    } finally {
      setBusyAction(null);
    }
  };


  // Search filtering
  const filteredCategories = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return categories;
    return categories.filter((cat) =>
      [cat.name, cat.description || "", cat.slug]
        .filter(Boolean)
        .some((val) => val.toLowerCase().includes(needle))
    );
  }, [categories, query]);
  const categorySelection = useAdminSelection(filteredCategories.map((category) => category.id));

  // Construct hierarchy lists
  const rootCategories = useMemo(() => {
    return filteredCategories.filter((cat) => !cat.parentId);
  }, [filteredCategories]);

  // Available parent options (to prevent circular nesting, exclude the category itself and categories that are already sub-categories)
  const parentOptions = useMemo(() => {
    return categories.filter((cat) => {
      // Exclude self
      if (editingId && cat.id === editingId) return false;
      // Exclude sub-categories (only 2 levels allowed: Category -> Sub-category)
      if (cat.parentId) return false;
      return true;
    });
  }, [categories, editingId]);

  const handleStartEdit = (cat: CategoryRecord) => {
    setEditingId(cat.id);
    setName(cat.name);
    setDescription(cat.description || "");
    setParentId(cat.parentId || "");
    setDisplayOrder(String(cat.displayOrder));
    setMessage("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setParentId("");
    setDisplayOrder("0");
    setMessage("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyAction("submit");
    setMessage("");

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      parentId: parentId || null,
      displayOrder: Number(displayOrder) || 0,
    };

    if (editingId) {
      // Edit mode
      const result = await updateCategory(editingId, payload);
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else if (result.category) {
        setCategories((prev) =>
          prev.map((c) =>
            c.id === editingId ? { ...c, ...result.category, _count: c._count, children: c.children } : c
          )
        );
        handleCancelEdit();
        setMessage("Category updated successfully.");
      }
    } else {
      // Create mode
      const result = await createCategory(payload);
      if (result.error) {
        setMessage(`Error: ${result.error}`);
      } else if (result.category) {
        const newCat: CategoryRecord = {
          id: result.category.id,
          name: result.category.name,
          description: result.category.description,
          slug: result.category.slug,
          displayOrder: result.category.displayOrder,
          parentId: result.category.parentId,
          parent: result.category.parent,
          subCategories: [],
          children: [],
          _count: { products: 0 },
          createdAt: new Date().toISOString(),
        };
        setCategories((prev) => [...prev, newCat]);
        handleCancelEdit();
        setMessage("Category created successfully.");
      }
    }
    setBusyAction(null);
  };

  const handleDelete = async (cat: CategoryRecord) => {
    if (cat._count.products > 0) {
      alert(`Cannot delete category "${cat.name}": it is currently assigned to ${cat._count.products} products.`);
      return;
    }
    if (!confirm(`Delete category "${cat.name}"? Sub-categories (if any) will become root categories.`)) return;

    setBusyAction(cat.id);
    const result = await deleteCategory(cat.id);
    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      setCategories((prev) =>
        prev
          .filter((c) => c.id !== cat.id)
          // Any subcategories of the deleted category will become root categories
          .map((c) => (c.parentId === cat.id ? { ...c, parentId: null, parent: null } : c))
      );
      categorySelection.remove([cat.id]);
      setMessage("Category deleted.");
      if (editingId === cat.id) {
        handleCancelEdit();
      }
    }
    setBusyAction(null);
  };

  const handleCopySelected = async () => {
    const selected = categories.filter((category) => categorySelection.selectedIds.includes(category.id));
    if (selected.length === 0) return;
    await navigator.clipboard.writeText(selected.map((category) => `${category.name}\t${category.slug}`).join("\n"));
    setMessage(`Copied ${selected.length} selected categor${selected.length === 1 ? "y" : "ies"}.`);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-100">Categories CRM</h1>
          <p className="mt-1 text-sm font-medium text-gray-400">
            Define product classifications and hierarchical sub-categories.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSyncErpnext}
          disabled={busyAction !== null}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 hover:bg-slate-800 text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {busyAction === "sync" ? (
            <GsapSpinner className="h-4 w-4" />
          ) : (
            <FolderTree className="h-4 w-4" />
          )}
          <span>Sync from ERPNext</span>
        </button>
      </div>

      {message && (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm font-bold",
            message.startsWith("Error")
              ? "border-rose-100 bg-rose-500/10 text-rose-600"
              : "border-emerald-100 bg-emerald-500/10 text-emerald-700"
          )}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
        {/* Hierarchical Management Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[#1E293B]/60 bg-[#0F172A]/70 backdrop-blur-md p-6 shadow-xs h-fit"
        >
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-gray-300" />
              <h2 className="text-sm font-black uppercase tracking-wider text-gray-100">
                {editingId ? "Edit Category" : "Create Category"}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1 hover:bg-[#0B1121] rounded-lg text-gray-400 hover:text-gray-100 cursor-pointer"
                title="Cancel Edit"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Category Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                placeholder="e.g. Solar Panels"
                className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0F172A] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100 placeholder:text-gray-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Optional description of this product line..."
                className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0F172A] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100 placeholder:text-gray-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                Parent Category (Optional)
              </span>
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0F172A] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
              >
                <option value="">-- None (Makes Root Category) --</option>
                {parentOptions.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <span className="text-[9px] text-gray-500 font-semibold leading-relaxed block">
                {t("form.parentHint")}
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Display Order</span>
              <input
                type="number"
                value={displayOrder}
                onChange={(event) => setDisplayOrder(event.target.value)}
                className="w-full rounded-xl border border-[#1E293B]/60 bg-[#0F172A] px-3 py-3 text-sm font-semibold outline-none focus:border-[#B7D1EA] text-gray-100"
              />
            </label>

            <button
              type="submit"
              disabled={busyAction === "submit"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-gray-100 transition-all hover:bg-[#B7D1EA]/80 shadow-none shadow-[#B7D1EA]/25 cursor-pointer disabled:opacity-60 font-bold"
            >
              {busyAction === "submit" ? (
                <GsapSpinner className="h-4 w-4 text-gray-100" />
              ) : (
                <ShieldCheck className="h-4.5 w-4.5 text-gray-100" />
              )}
              <span>{editingId ? "Update Category" : "Create Category"}</span>
            </button>
          </div>
        </form>

        {/* Interactive Data Tree Listing */}
        <div className="overflow-hidden rounded-3xl border border-[#1E293B]/60 bg-[#0F172A]/70 backdrop-blur-md shadow-xs flex flex-col">
          <div className="border-b border-[#1E293B] p-4 bg-[#0F172A]/30 flex items-center justify-between gap-4">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search category name, description, slug..."
                className="w-full rounded-full border border-[#1E293B]/60 bg-[#0B1121] py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-[#B7D1EA] text-gray-100 placeholder:text-gray-400"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0 text-gray-500 text-xs font-bold">
              <FolderTree className="h-4 w-4" />
              <span>{categories.length} Categories</span>
            </div>
          </div>
          <AdminBulkActionBar
            selectedCount={categorySelection.selectedCount}
            visibleCount={filteredCategories.length}
            allVisibleSelected={categorySelection.allVisibleSelected}
            someVisibleSelected={categorySelection.someVisibleSelected}
            onToggleVisible={categorySelection.toggleVisible}
            onClear={categorySelection.clear}
            actions={[
              { id: "copy", label: "Copy selected", icon: Copy, onClick: handleCopySelected },
            ]}
          />

          <div className="p-6 overflow-y-auto space-y-4">
            {rootCategories.map((parent) => {
              // Find children for this parent
              const subCategories = filteredCategories.filter((c) => c.parentId === parent.id);

              return (
                <div key={parent.id} className="space-y-2">
                  {/* Root Category Row */}
                  <div className="group flex items-center justify-between bg-[#0F172A] border border-[#1E293B]/60 rounded-2xl p-4 shadow-2xs hover:border-[#B7D1EA] hover:shadow-xs transition-all duration-300">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <AdminSelectionCheckbox
                        checked={categorySelection.isSelected(parent.id)}
                        onChange={() => categorySelection.toggle(parent.id)}
                        label={`Select ${parent.name}`}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-gray-100 uppercase">
                          {parent.name}
                        </span>
                        <span className="inline-flex rounded-full bg-[#B7D1EA]/25 border border-[#B7D1EA]/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-gray-100 shrink-0">
                          {parent._count.products} Products
                        </span>
                        {parent.displayOrder > 0 && (
                          <span className="text-[9px] font-bold text-gray-500">
                            (Order: {parent.displayOrder})
                          </span>
                        )}
                      </div>
                      {parent.description && (
                        <p className="text-xs text-gray-400 font-medium truncate max-w-xl">
                          {parent.description}
                        </p>
                      )}
                      <p className="text-[10px] font-mono text-gray-500">Slug: {parent.slug}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(parent)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#1E293B] bg-[#0F172A] text-gray-400 hover:text-gray-100 transition-colors hover:border-slate-350 cursor-pointer"
                        title="Edit Category"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(parent)}
                        disabled={busyAction === parent.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 bg-rose-500/10 text-rose-500 hover:text-rose-700 transition-colors hover:border-rose-200 cursor-pointer disabled:opacity-60"
                        title="Delete Category"
                      >
                        {busyAction === parent.id ? (
                          <GsapSpinner className="h-3.5 w-3.5" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Sub-categories tree list (indented with connecting line) */}
                  {subCategories.length > 0 && (
                    <div className="pl-6 space-y-2 relative border-l border-[#1E293B]/60 ml-6 pt-1 pb-1">
                      {subCategories.map((sub) => (
                        <div key={sub.id} className="relative pl-6 flex items-center">
                          {/* L-bracket elbow connecting line */}
                          <div className="absolute left-0 top-0 bottom-4 w-4 border-l border-b border-[#1E293B] rounded-bl-xl shrink-0 -mt-2.5 pointer-events-none" />

                          <div className="group flex-1 flex items-center justify-between bg-[#0F172A]/50 border border-[#1E293B]/40 rounded-xl p-3.5 hover:border-[#B7D1EA]/80 transition-all duration-300">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <AdminSelectionCheckbox
                                checked={categorySelection.isSelected(sub.id)}
                                onChange={() => categorySelection.toggle(sub.id)}
                                label={`Select ${sub.name}`}
                                className="mt-0.5 shrink-0"
                              />
                              <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-100">
                                  {sub.name}
                                </span>
                                <span className="inline-flex rounded-full bg-[#0B1121] border border-[#1E293B] px-2 py-0.5 text-[8px] font-bold text-gray-400 shrink-0">
                                  {sub._count.products} Products
                                </span>
                                {sub.displayOrder > 0 && (
                                  <span className="text-[8px] font-bold text-gray-500">
                                    (Order: {sub.displayOrder})
                                  </span>
                                )}
                              </div>
                              {sub.description && (
                                <p className="text-[11px] text-gray-400 font-semibold truncate max-w-lg">
                                  {sub.description}
                                </p>
                              )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(sub)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#1E293B] bg-[#0F172A] text-gray-400 hover:text-gray-100 transition-colors hover:border-slate-350 cursor-pointer"
                                title="Edit Sub-category"
                              >
                                <Edit className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(sub)}
                                disabled={busyAction === sub.id}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-100 bg-rose-500/10 text-rose-500 hover:text-rose-700 transition-colors hover:border-rose-200 cursor-pointer disabled:opacity-60"
                                title="Delete Sub-category"
                              >
                                {busyAction === sub.id ? (
                                  <GsapSpinner className="h-3.5 w-3.5" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredCategories.length === 0 && (
              <div className="py-12 text-center text-xs font-bold uppercase tracking-widest text-gray-500">
                No categories found matching query.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
