"use client";

import { useEffect, useRef, useState, useTransition, Fragment, useMemo, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import ProgressiveImage from "@/components/ui/progressive-image";
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  X, 
  Eye, 
  EyeOff, 
  Sliders,
  Sparkles,
  DollarSign,
  Download,
  FileSpreadsheet,
  Upload
} from "@/components/ui/icons";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductActive,
  importProducts,
  deleteProducts,
  bulkUpdateProductCategory,
  bulkUpdateProductStatus,
} from "@/app/actions/product";
import { toast } from "sonner";
import { gsap } from "gsap";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import LiveSerpPreview from "@/components/admin/LiveSerpPreview";
import { downloadCsv, readCsvRows } from "@/lib/clientCsv";
import { GsapReveal } from "@/components/ui/GsapMotion";
import { useTranslations } from "next-intl";

interface Category {
  id: string;
  name: string;
}

interface ProductWithCategory {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string;
  isActive: boolean;
  categoryId: string;
  category?: {
    id: string;
    name: string;
  } | null;
  metadata: unknown;
  useInRecommendation?: boolean;
  recommendTier?: string | null;
  recommendPriority?: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  seoImage?: string | null;
}

interface ProductsTableProps {
  products: ProductWithCategory[];
  categories: Category[];
}

export default function ProductsTable({ products, categories }: ProductsTableProps) {
  const t = useTranslations("AdminProductsTable");
  const [productList, setProductList] = useState<ProductWithCategory[]>(products);
  const [isPending, startTransition] = useTransition();
  const importInputRef = useRef<HTMLInputElement>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Odoo-style Search & Group state
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<{ field: string; operator: string; value: string }[]>([]);
  const [activeGroupBy, setActiveGroupBy] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [savedSearches, setSavedSearches] = useState<{ name: string; filters: string[]; groupBy: string | null; query: string }[]>([]);
  const [newSaveSearchName, setNewSaveSearchName] = useState("");

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [metaFields, setMetaFields] = useState<{ key: string; value: string }[]>([]);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [seoImage, setSeoImage] = useState("");
  const [useInRecommendation, setUseInRecommendation] = useState(true);
  const [recommendTier, setRecommendTier] = useState<string>("standard");
  const [recommendPriority, setRecommendPriority] = useState("0");

  const updateSearchQuery = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const updateSelectedFilters = (updater: SetStateAction<string[]>) => {
    setSelectedFilters(updater);
    setCurrentPage(1);
  };

  const updateCustomFilters = (
    updater: SetStateAction<{ field: string; operator: string; value: string }[]>,
  ) => {
    setCustomFilters(updater);
    setCurrentPage(1);
  };

  const updateActiveGroupBy = (value: string | null) => {
    setActiveGroupBy(value);
    setCurrentPage(1);
  };

  // Metadata handlers
  const addMetaField = () => {
    setMetaFields([...metaFields, { key: "", value: "" }]);
  };

  const removeMetaField = (index: number) => {
    setMetaFields(metaFields.filter((_, idx) => idx !== index));
  };

  const updateMetaField = (index: number, field: "key" | "value", val: string) => {
    const updated = [...metaFields];
    updated[index][field] = val;
    setMetaFields(updated);
  };

  // Open modal for Create
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName("");
    setDescription("");
    setPrice("");
    setImageUrl("");
    setCategoryId(categories[0]?.id || "");
    setIsActive(true);
    setMetaFields([]);
    setSeoTitle("");
    setSeoDescription("");
    setSeoKeywords("");
    setSeoImage("");
    setUseInRecommendation(true);
    setRecommendTier("standard");
    setRecommendPriority("0");
    setIsFormOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (product: ProductWithCategory) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || "");
    setPrice((product.price ?? 0).toString());
    setImageUrl(product.imageUrl);
    setCategoryId(product.categoryId);
    setIsActive(product.isActive);
    setSeoTitle(product.seoTitle || "");
    setSeoDescription(product.seoDescription || "");
    setSeoKeywords(product.seoKeywords || "");
    setSeoImage(product.seoImage || "");

    // Parse existing metadata object into array
    const fields: { key: string; value: string }[] = [];
    if (product.metadata && typeof product.metadata === "object") {
      Object.entries(product.metadata).forEach(([k, v]) => {
        fields.push({ key: k, value: String(v) });
      });
    }
    setMetaFields(fields);
    setUseInRecommendation(product.useInRecommendation !== false);
    setRecommendTier(product.recommendTier || "standard");
    setRecommendPriority(String(product.recommendPriority ?? 0));
    setIsFormOpen(true);
  };

  // Open delete confirmation
  const handleOpenDelete = (product: ProductWithCategory) => {
    setEditingProduct(product);
    setIsDeleteOpen(true);
  };

  // Form submit handler
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Convert metadata fields array back to single JSON object
    const metadataObj: Record<string, unknown> = {};
    metaFields.forEach(({ key, value }) => {
      if (key.trim()) {
        metadataObj[key.trim()] = value.trim();
      }
    });

    startTransition(async () => {
      try {
        const payload = {
          name,
          description,
          price: parseFloat(price) || 0,
          imageUrl,
          categoryId,
          isActive,
          metadata: metadataObj,
          useInRecommendation,
          recommendTier: recommendTier || null,
          recommendPriority: parseInt(recommendPriority, 10) || 0,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
          seoKeywords: seoKeywords.trim() || null,
          seoImage: seoImage.trim() || null,
        };

        const res = editingProduct
          ? await updateProduct(editingProduct.id, payload)
          : await createProduct(payload);

        if (res.success) {
          toast.success(res.message);
          if (res.product) {
            const savedProduct = res.product;
            setProductList((prev) => {
              if (editingProduct) {
                return prev.map((product) => product.id === savedProduct.id ? savedProduct : product);
              }
              return [savedProduct, ...prev];
            });
          }
          setIsFormOpen(false);
          setEditingProduct(null);
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Product save error:", error);
        toast.error("Could not save the product. Please try again.");
      }
    });
  };

  // Delete submit handler
  const handleDeleteConfirm = () => {
    if (!editingProduct) return;
    setIsDeleting(true);
    startTransition(async () => {
      try {
        const res = await deleteProduct(editingProduct.id);
        if (res.success) {
          toast.success(res.message);
          setIsDeleteOpen(false);
          setEditingProduct(null);
          setProductList((prev) => prev.filter((product) => product.id !== editingProduct.id));
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Product delete error:", error);
        toast.error("Could not delete the product. Please try again.");
      } finally {
        setIsDeleting(false);
      }
    });
  };

  // Status toggle handler
  const handleToggleStatus = (product: ProductWithCategory) => {
    startTransition(async () => {
      try {
        const res = await toggleProductActive(product.id, product.isActive);
        if (res.success) {
          toast.success(res.message);
          setProductList(prev =>
            prev.map(p => p.id === product.id ? { ...p, isActive: !p.isActive } : p)
          );
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Product status update error:", error);
        toast.error("Could not update product status. Please try again.");
      }
    });
  };

  // Helper to extract field value dynamically for custom filters
  const getFieldValue = (prod: ProductWithCategory, field: string): string | number => {
    if (field === "name") return prod.name;
    if (field === "price") return prod.price;
    if (field === "brand") return getProductBrand(prod) || "";
    if (field === "model") return getProductModel(prod) || "";
    if (field === "category") return prod.category?.name || "Uncategorized";
    return "";
  };

  // Search and advanced filtering computations
  const filteredProducts = useMemo(() => productList.filter((prod) => {
      const normalizedSearch = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery.trim() === "" ||
        prod.name.toLowerCase().includes(normalizedSearch) ||
        (prod.description || "").toLowerCase().includes(normalizedSearch) ||
        getProductBrand(prod).toLowerCase().includes(normalizedSearch) ||
        getProductModel(prod).toLowerCase().includes(normalizedSearch);

      let matchesPredefined = true;
      for (const filter of selectedFilters) {
        if (filter === "active" && !prod.isActive) matchesPredefined = false;
        if (filter === "draft" && prod.isActive) matchesPredefined = false;
        if (filter === "priceHigh" && prod.price <= 10000) matchesPredefined = false;
        if (filter === "priceLow" && prod.price >= 5000) matchesPredefined = false;
        if (filter.startsWith("cat_")) {
          const catId = filter.substring(4);
          if (prod.categoryId !== catId) matchesPredefined = false;
        }
      }

      let matchesCustom = true;
      for (const f of customFilters) {
        const val = getFieldValue(prod, f.field);
        const targetVal = f.value;
        if (f.operator === "equals" && String(val).toLowerCase() !== targetVal.toLowerCase()) matchesCustom = false;
        if (f.operator === "contains" && !String(val).toLowerCase().includes(targetVal.toLowerCase())) matchesCustom = false;
        if (f.operator === "greater" && Number(val) <= Number(targetVal)) matchesCustom = false;
        if (f.operator === "less" && Number(val) >= Number(targetVal)) matchesCustom = false;
      }

      return matchesSearch && matchesPredefined && matchesCustom;
    }), [customFilters, productList, searchQuery, selectedFilters]);

  // Slicing for Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const safeCurrentPage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = useMemo(
    () => filteredProducts.slice(startIndex, endIndex),
    [endIndex, filteredProducts, startIndex],
  );

  // Group products on current page if activeGroupBy is set
  const paginatedGroupedProducts = useMemo(() => {
    if (!activeGroupBy) return null;
    
    const groups: Record<string, ProductWithCategory[]> = {};
    for (const prod of paginatedProducts) {
      let key = "Other";
      if (activeGroupBy === "category") {
        key = prod.category?.name || "Uncategorized";
      } else if (activeGroupBy === "status") {
        key = prod.isActive ? "Active" : "Draft";
      } else if (activeGroupBy === "brand") {
        key = getProductBrand(prod) || "Unknown Brand";
      }
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(prod);
    }
    return groups;
  }, [paginatedProducts, activeGroupBy]);

  // Generate page numbers to show (e.g. current page +/- 2)
  const pageNumbers = [];
  const maxVisiblePages = 5;
  let startPage = Math.max(1, safeCurrentPage - 2);
  const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  const allFilteredSelected =
    paginatedProducts.length > 0 &&
    paginatedProducts.every((product) => selectedIds.includes(product.id));

  const allCatalogSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) => selectedIds.includes(product.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !paginatedProducts.some((product) => product.id === id))
      );
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...paginatedProducts.map((product) => product.id)])));
    }
  };

  const toggleGroupSelection = (groupItems: ProductWithCategory[]) => {
    const itemIds = groupItems.map(p => p.id);
    const allSelected = itemIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !itemIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...itemIds])));
    }
  };

  const isGroupAllSelected = (groupItems: ProductWithCategory[]) => {
    return groupItems.length > 0 && groupItems.map(p => p.id).every(id => selectedIds.includes(id));
  };

  const handleBulkStatusChange = (status: boolean) => {
    startTransition(async () => {
      try {
        const res = await bulkUpdateProductStatus(selectedIds, status);
        if (res.success) {
          toast.success(res.message);
          setProductList(prev =>
            prev.map(p => selectedIds.includes(p.id) ? { ...p, isActive: status } : p)
          );
          setSelectedIds([]);
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Bulk product status update error:", error);
        toast.error("Could not update the selected products. Please try again.");
      }
    });
  };

  const handleBulkCategoryChange = (catId: string) => {
    startTransition(async () => {
      try {
        const res = await bulkUpdateProductCategory(selectedIds, catId);
        if (res.success) {
          toast.success(res.message);
          const targetCat = categories.find(c => c.id === catId);
          setProductList(prev =>
            prev.map(p => selectedIds.includes(p.id) ? {
              ...p,
              categoryId: catId,
              category: targetCat ? { id: targetCat.id, name: targetCat.name } : p.category
            } : p)
          );
          setSelectedIds([]);
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        console.error("Bulk product category update error:", error);
        toast.error("Could not update the selected products. Please try again.");
      }
    });
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.length === 0) {
      toast.error("Select components to delete first.");
      return;
    }
    setIsBulkDeleteOpen(true);
  };

  const handleBulkDeleteConfirm = () => {
    setIsBulkDeleting(true);
    startTransition(async () => {
      try {
        const result = await deleteProducts(selectedIds);
        if (result.success) {
          toast.success(result.message);
          const deletedIds = new Set(selectedIds);
          setProductList((prev) => prev.filter((product) => !deletedIds.has(product.id)));
          setSelectedIds([]);
          setIsBulkDeleteOpen(false);
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Bulk product delete error:", error);
        toast.error("Could not delete the selected products. Please try again.");
      } finally {
        setIsBulkDeleting(false);
      }
    });
  };

  const exportRows = productList.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    price: product.price,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? "Uncategorized",
    isActive: product.isActive,
    metadata: JSON.stringify(product.metadata ?? {}),
    useInRecommendation: product.useInRecommendation !== false,
    recommendTier: product.recommendTier ?? "",
    recommendPriority: product.recommendPriority ?? 0,
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    seoKeywords: product.seoKeywords ?? "",
    seoImage: product.seoImage ?? "",
  }));

  const handleExport = (template = false) => {
    const rows = template
      ? [
          {
            id: "",
            name: "Sample Solar Panel",
            description: "Imported product description",
            price: 12500,
            imageUrl: "https://example.com/product.jpg",
            categoryId: categories[0]?.id ?? "",
            categoryName: categories[0]?.name ?? "",
            isActive: true,
            metadata: JSON.stringify({ powerRating: 550, efficiency: "21%" }),
            useInRecommendation: true,
            recommendTier: "standard",
            recommendPriority: 10,
            seoTitle: "",
            seoDescription: "",
            seoKeywords: "",
            seoImage: "",
          },
        ]
      : exportRows;
    downloadCsv(rows, `products-${template ? "template" : "export"}`);
  };

  const handleImportFile = async (file: File) => {
    try {
      const rows = await readCsvRows(file);
      startTransition(async () => {
        try {
          const result = await importProducts(rows);
          if (result.products?.length) {
            setProductList((prev) => {
              const importedById = new Map(result.products?.map((product) => [product.id, product]));
              const mergedExisting = prev.map((product) => importedById.get(product.id) ?? product);
              const existingIds = new Set(prev.map((product) => product.id));
              const newProducts = result.products?.filter((product) => !existingIds.has(product.id)) ?? [];
              return [...newProducts, ...mergedExisting];
            });
          }
          if (result.success) {
            toast.success(result.message);
          } else {
            toast.error(result.message);
            if (result.errors?.length) {
              console.error("Product import errors:", result.errors);
            }
          }
        } catch (error) {
          console.error("Product import error:", error);
          toast.error("Could not import products. Please try again.");
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read import file.");
    }
  };

  const handleBulkDelete = handleBulkDeleteClick;

  const renderProductRow = (prod: ProductWithCategory) => (
    <tr key={prod.id} className="hover:bg-[#0B1121] transition-colors group">
      <td className="py-4 px-6">
        <input
          type="checkbox"
          checked={selectedIds.includes(prod.id)}
          onChange={() => toggleSelected(prod.id)}
          className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
        />
      </td>
      {/* Thumbnail Image */}
      <td className="py-4 px-6">
        <div className="w-12 h-12 rounded-xl bg-[#0B1121] border border-[#1E293B] overflow-hidden relative shadow-none">
          <ProgressiveImage
            src={prod.imageUrl && prod.imageUrl.trim() !== "" ? prod.imageUrl : "/images/placeholder.png"}
            alt={prod.name}
            fill
            sizes="48px"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      </td>

      {/* Name & Description */}
      <td className="py-4 px-6 max-w-sm">
        <div className="font-bold text-gray-100 text-xs uppercase tracking-wide group-hover:text-[#B7D1EA] transition-colors">{prod.name}</div>
        <div className="text-[10px] text-gray-400 line-clamp-1 mt-0.5 font-semibold">{prod.description || "No description provided."}</div>
        {/* JSON Metadata Badges */}
        {getMetadataEntries(prod.metadata).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {getMetadataEntries(prod.metadata).slice(0, 3).map(([k, v]) => (
              <span key={k} className="text-[9px] font-mono px-1.5 py-0.5 bg-[#0B1121] border border-[#1E293B] text-gray-400 rounded">
                {k}: {String(v)}
              </span>
            ))}
            {getMetadataEntries(prod.metadata).length > 3 && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#B7D1EA]/10 text-[#B7D1EA] rounded">
                +{getMetadataEntries(prod.metadata).length - 3} more
              </span>
            )}
          </div>
        )}
      </td>

      {/* Category Slot */}
      <td className="py-4 px-6">
        <span className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 text-[#B7D1EA]">
          {prod.category?.name ?? "Uncategorized"}
        </span>
      </td>

      {/* Price */}
      <td className="py-4 px-6 font-mono font-black text-gray-100 text-xs">
        ${(prod.price ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </td>

      {/* Status Toggle Button */}
      <td className="py-4 px-6 text-center">
        <button
          onClick={() => handleToggleStatus(prod)}
          className={`mx-auto px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
            prod.isActive
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/15"
              : "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/15"
          }`}
          title={t("actions.toggleActiveStatus")}
        >
          {prod.isActive ? (
            <>
              <Eye className="w-3 h-3" />
              <span>{t("status.active")}</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3 h-3" />
              <span>{t("status.draft")}</span>
            </>
          )}
        </button>
      </td>

      {/* CRUD Actions */}
      <td className="py-4 px-6 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => handleOpenEdit(prod)}
            className="p-2.5 bg-[#0B1121] border border-[#1E293B] hover:bg-[#0B1121] text-gray-300 hover:text-gray-100 rounded-xl transition-all cursor-pointer"
            title={t("actions.editComponent")}
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleOpenDelete(prod);
            }}
            className="p-2.5 bg-rose-500/10 border border-rose-200 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl transition-all cursor-pointer"
            title={t("actions.deleteComponent")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportFile(file);
        }}
      />

      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 shadow-none flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-black text-gray-100 uppercase tracking-wider">
            {t("importExport.title")}
          </h2>
          <p className="text-xs text-gray-400 font-semibold mt-1">
            {t("importExport.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleExport(true)}
            className="px-3 py-2 rounded-xl border border-[#1E293B] text-gray-400 hover:text-[#B7D1EA] hover:border-[#B7D1EA]/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t("importExport.template")}
          </button>
          <button
            type="button"
            onClick={() => handleExport()}
            className="px-3 py-2 rounded-xl border border-[#1E293B] text-gray-400 hover:text-[#B7D1EA] hover:border-[#B7D1EA]/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t("importExport.csv")}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isPending}
            className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {t("importExport.import")}
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={selectedIds.length === 0 || isPending}
            className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            {t("importExport.deleteSelected", { count: selectedIds.length })}
          </button>
        </div>
      </div>

      {/* Odoo-style Search Container */}
      <div className="relative space-y-2">
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 flex flex-col md:flex-row gap-3 items-center shadow-none">
          {/* Search Box containing pills and input */}
          <div className="flex-1 w-full bg-[#0B1121] border border-[#1E293B] rounded-xl px-4 py-2 flex flex-wrap items-center gap-2 min-h-[48px] focus-within:ring-2 focus-within:ring-[#B7D1EA]/20 focus-within:border-[#B7D1EA] transition-all">
            <Search className="w-4 h-4 text-gray-500 shrink-0" />
            
            {/* Render selected filter tags/pills inside the search box */}
            {selectedFilters.map((filter) => {
              let label = filter;
              if (filter === "active") label = "Status: Active";
              if (filter === "draft") label = "Status: Draft";
              if (filter === "priceHigh") label = "Price > 10,000 USD";
              if (filter === "priceLow") label = "Price < 5,000 USD";
              if (filter.startsWith("cat_")) {
                const catId = filter.substring(4);
                const cat = categories.find(c => c.id === catId);
                label = `Category: ${cat ? cat.name : "Unknown"}`;
              }
              return (
                <span key={filter} className="bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 text-[#B7D1EA] text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1">
                  {label}
                  <button
                    type="button"
                    onClick={() => updateSelectedFilters(prev => prev.filter(f => f !== filter))}
                    className="hover:text-rose-500 font-bold shrink-0 ml-0.5"
                  >
                    ✕
                  </button>
                </span>
              );
            })}

            {/* Custom filters inside search box */}
            {customFilters.map((f, idx) => (
              <span key={idx} className="bg-[#0B1121] border border-[#1E293B] text-gray-400 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1">
                {`${f.field} ${f.operator} ${f.value}`}
                <button
                  type="button"
                  onClick={() => updateCustomFilters(prev => prev.filter((_, i) => i !== idx))}
                  className="hover:text-rose-500 font-bold shrink-0 ml-0.5"
                >
                  ✕
                </button>
              </span>
            ))}

            {/* Active Group By pill inside search box */}
            {activeGroupBy && (
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-600 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg flex items-center gap-1">
                Group By: {activeGroupBy}
                <button
                  type="button"
                  onClick={() => updateActiveGroupBy(null)}
                  className="hover:text-rose-500 font-bold shrink-0 ml-0.5"
                >
                  ✕
                </button>
              </span>
            )}

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => updateSearchQuery(e.target.value)}
              placeholder={selectedFilters.length > 0 || customFilters.length > 0 || activeGroupBy ? "" : "Search components by name, model, brand..."}
              className="flex-1 bg-transparent border-none outline-none text-xs text-gray-100 font-semibold min-w-[120px] focus:ring-0 p-0"
            />

            {/* Clear All search/filters button */}
            {(searchQuery.trim() !== "" || selectedFilters.length > 0 || customFilters.length > 0 || activeGroupBy) && (
              <button
                type="button"
                onClick={() => {
                  updateSearchQuery("");
                  updateSelectedFilters([]);
                  updateCustomFilters([]);
                  updateActiveGroupBy(null);
                }}
                className="text-[10px] font-black uppercase text-gray-500 hover:text-gray-400 tracking-wider"
              >
                {t("search.clear")}
              </button>
            )}
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            {/* Odoo dropdown panel toggle */}
            <button
              type="button"
              onClick={() => setSearchPanelOpen(!searchPanelOpen)}
              className={`px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer ${
                searchPanelOpen || selectedFilters.length > 0 || activeGroupBy
                  ? "bg-[#B7D1EA]/10 border-[#B7D1EA]/30 text-[#B7D1EA]"
                  : "bg-[#0B1121] border-[#1E293B] text-slate-605 hover:bg-[#0B1121]"
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>{t("search.filtersGrouping")}</span>
            </button>

            {/* Add Component Button */}
            <button
              onClick={handleOpenAdd}
              className="flex-1 md:flex-none px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white font-black rounded-xl text-[10px] flex items-center justify-center gap-1.5 transition-all shadow-none shadow-[#B7D1EA]/10 cursor-pointer uppercase tracking-widest shrink-0"
            >
              <Plus className="w-4.5 h-4.5" />
              {t("search.addComponent")}
            </button>
          </div>
        </div>

        {/* Floating Search/Filters Panel */}
        {searchPanelOpen && (
            <GsapDropdownPanel
              className="absolute z-30 top-full mt-2 w-full bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 shadow-none grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Filters Column */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#B7D1EA] rounded-full" />
                  {t("search.filters")}
                </h4>
                
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-xs text-gray-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFilters.includes("active")}
                      onChange={(e) => {
                        if (e.target.checked) updateSelectedFilters(prev => [...prev, "active"]);
                        else updateSelectedFilters(prev => prev.filter(f => f !== "active"));
                      }}
                      className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                    />
                    {t("status.active")}
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFilters.includes("draft")}
                      onChange={(e) => {
                        if (e.target.checked) updateSelectedFilters(prev => [...prev, "draft"]);
                        else updateSelectedFilters(prev => prev.filter(f => f !== "draft"));
                      }}
                      className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                    />
                    {t("status.draft")}
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFilters.includes("priceHigh")}
                      onChange={(e) => {
                        if (e.target.checked) updateSelectedFilters(prev => [...prev, "priceHigh"]);
                        else updateSelectedFilters(prev => prev.filter(f => f !== "priceHigh"));
                      }}
                      className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                    />
                    {t("search.priceHigh")}
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFilters.includes("priceLow")}
                      onChange={(e) => {
                        if (e.target.checked) updateSelectedFilters(prev => [...prev, "priceLow"]);
                        else updateSelectedFilters(prev => prev.filter(f => f !== "priceLow"));
                      }}
                      className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                    />
                    {t("search.priceLow")}
                  </label>
                </div>

                <div className="pt-2 border-t border-[#1E293B] space-y-2">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{t("search.categories")}</p>
                  <div className="max-h-[120px] overflow-y-auto space-y-1">
                    {categories.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2.5 text-[11px] text-slate-605 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFilters.includes(`cat_${cat.id}`)}
                          onChange={(e) => {
                            if (e.target.checked) updateSelectedFilters(prev => [...prev, `cat_${cat.id}`]);
                            else updateSelectedFilters(prev => prev.filter(f => f !== `cat_${cat.id}`));
                          }}
                          className="w-3.5 h-3.5 rounded text-[#B7D1EA]"
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Add Custom Filter section */}
                <div className="pt-2 border-t border-[#1E293B]">
                  <CustomFilterForm onAddFilter={(f) => updateCustomFilters(prev => [...prev, f])} />
                </div>
              </div>

              {/* Group By Column */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#B7D1EA] rounded-full" />
                  {t("search.groupBy")}
                </h4>
                
                <div className="space-y-2">
                  {[
                    { id: "category", label: t("table.category") },
                    { id: "status", label: t("table.status") },
                    { id: "brand", label: t("table.brand") },
                  ].map((group) => (
                    <label key={group.id} className="flex items-center gap-2.5 text-xs text-gray-300 font-bold cursor-pointer">
                      <input
                        type="radio"
                        name="groupBy"
                        checked={activeGroupBy === group.id}
                        onChange={() => {
                          updateActiveGroupBy(group.id);
                          setCollapsedGroups([]); // Reset collapsed states
                        }}
                        className="w-4 h-4 text-[#B7D1EA] focus:ring-[#B7D1EA]"
                      />
                      {group.label}
                    </label>
                  ))}
                  {activeGroupBy && (
                    <button
                      type="button"
                      onClick={() => updateActiveGroupBy(null)}
                      className="text-[10px] text-rose-500 hover:text-rose-600 font-black uppercase tracking-wider mt-2 block"
                    >
                      {t("search.clearGrouping")}
                    </button>
                  )}
                </div>
              </div>

              {/* Favorites Column */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#B7D1EA] rounded-full" />
                  {t("search.favorites")}
                </h4>
                
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder={t("search.saveCurrentPlaceholder")}
                      value={newSaveSearchName}
                      onChange={(e) => setNewSaveSearchName(e.target.value)}
                      className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-2.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newSaveSearchName.trim()) {
                          toast.error("Enter a favorite search name first.");
                          return;
                        }
                        setSavedSearches(prev => [
                          ...prev,
                          {
                            name: newSaveSearchName.trim(),
                            filters: [...selectedFilters],
                            groupBy: activeGroupBy,
                            query: searchQuery
                          }
                        ]);
                        setNewSaveSearchName("");
                        toast.success("Search saved to favorites!");
                      }}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-750 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                    >
                      {t("search.saveSearch")}
                    </button>
                  </div>

                  {savedSearches.length > 0 && (
                    <div className="pt-2 border-t border-[#1E293B] space-y-1.5">
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{t("search.savedSearches")}</p>
                      <div className="space-y-1 max-h-[120px] overflow-y-auto">
                        {savedSearches.map((s, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-xs py-1">
                            <button
                              type="button"
                              onClick={() => {
                                updateSelectedFilters(s.filters);
                                updateActiveGroupBy(s.groupBy);
                                updateSearchQuery(s.query);
                                toast.success(`Loaded search: ${s.name}`);
                              }}
                              className="text-gray-300 hover:text-[#B7D1EA] font-semibold text-left truncate flex-1"
                            >
                              ★ {s.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSavedSearches(prev => prev.filter((_, i) => i !== idx))}
                              className="text-rose-500 hover:text-rose-600 font-bold shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </GsapDropdownPanel>
          )}
      </div>

      {/* Gmail-style Selection Banner */}
      {selectedIds.length > 0 && allFilteredSelected && !allCatalogSelected && (
        <GsapReveal className="bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 px-6 py-3 rounded-xl flex items-center justify-between text-xs text-gray-100 font-semibold">
          <div>
            All <span className="font-bold">{paginatedProducts.length}</span> components on this page are selected.
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(filteredProducts.map(p => p.id))}
            className="text-[#B7D1EA] hover:text-[#99BFE3] font-black uppercase tracking-wider underline cursor-pointer"
          >
            Select all {filteredProducts.length} components in catalog
          </button>
        </GsapReveal>
      )}

      {selectedIds.length > 0 && allCatalogSelected && (
        <GsapReveal className="bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 px-6 py-3 rounded-xl flex items-center justify-between text-xs text-gray-100 font-semibold">
          <div>
            All <span className="font-bold">{filteredProducts.length}</span> components in the catalog are selected.
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-rose-605 hover:text-rose-700 font-black uppercase tracking-wider underline cursor-pointer"
          >
            Clear selection
          </button>
        </GsapReveal>
      )}

      {/* Pagination Controls at the Top */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-none">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs text-gray-400 font-semibold">
            Showing <span className="font-bold text-gray-100">{filteredProducts.length === 0 ? 0 : startIndex + 1}</span> to{" "}
            <span className="font-bold text-gray-100">{Math.min(endIndex, filteredProducts.length)}</span> of{" "}
            <span className="font-bold text-gray-100">{filteredProducts.length}</span> components
          </div>
          
          {/* Page Size Dropdown */}
          <div className="flex items-center gap-2 border-l border-[#1E293B] pl-3">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1); // Reset to page 1
              }}
              className="bg-[#0B1121] border border-[#1E293B] rounded-xl px-2 py-1 text-xs font-bold text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-3.5 py-2 rounded-xl border border-[#1E293B] text-slate-605 hover:text-[#B7D1EA] hover:border-[#B7D1EA]/30 disabled:opacity-40 disabled:hover:text-gray-300 disabled:hover:border-[#1E293B] text-xs font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {t("pagination.previous")}
            </button>
            {pageNumbers.map(pageNum => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`w-9 h-9 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  safeCurrentPage === pageNum
                    ? "bg-[#B7D1EA] text-white border border-[#B7D1EA] shadow-none shadow-[#B7D1EA]/20"
                    : "bg-[#0B1121] border border-[#1E293B] text-gray-300 hover:bg-[#0B1121]"
                }`}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-3.5 py-2 rounded-xl border border-[#1E293B] text-slate-605 hover:text-[#B7D1EA] hover:border-[#B7D1EA]/30 disabled:opacity-40 disabled:hover:text-gray-300 disabled:hover:border-[#1E293B] text-xs font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {t("pagination.next")}
            </button>
          </div>
        )}
      </div>

      {/* Product Catalog Data Table */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] bg-[#0B1121] text-[9px] uppercase tracking-widest text-gray-300 font-black">
                <th className="py-4 px-6 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                  />
                </th>
                <th className="py-4 px-6">{t("table.preview")}</th>
                <th className="py-4 px-6">{t("table.nameDescription")}</th>
                <th className="py-4 px-6">{t("table.categorySlot")}</th>
                <th className="py-4 px-6">{t("table.price")}</th>
                <th className="py-4 px-6 text-center">{t("table.status")}</th>
                <th className="py-4 px-6 text-right">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-gray-400 font-semibold space-y-2">
                    <Sliders className="w-8 h-8 text-slate-300 mx-auto" />
                    <div>{t("table.noMatches")}</div>
                  </td>
                </tr>
              ) : activeGroupBy ? (
                Object.entries(paginatedGroupedProducts || {}).map(([groupName, groupItems]) => {
                  const isCollapsed = collapsedGroups.includes(groupName);
                  const allGroupSelected = isGroupAllSelected(groupItems);
                  
                  return (
                    <Fragment key={groupName}>
                      {/* Collapsible Group Header Row */}
                      <tr className="border-b border-[#1E293B] bg-[#0B1121]">
                        <td className="py-3 px-6 w-10">
                          <input
                            type="checkbox"
                            checked={allGroupSelected}
                            onChange={() => toggleGroupSelection(groupItems)}
                            className="w-4 h-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                          />
                        </td>
                        <td colSpan={6} className="py-3 px-6">
                          <button
                            type="button"
                            onClick={() => {
                              if (isCollapsed) {
                                setCollapsedGroups(prev => prev.filter(g => g !== groupName));
                              } else {
                                setCollapsedGroups(prev => [...prev, groupName]);
                              }
                            }}
                            className="flex items-center gap-2 hover:text-[#B7D1EA] transition-colors cursor-pointer w-full text-left"
                          >
                            <span className="text-gray-500">
                              {isCollapsed ? "▶" : "▼"}
                            </span>
                            <span className="uppercase tracking-wider font-black text-[10px] text-gray-100">
                              {activeGroupBy}: {groupName}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">
                              ({groupItems.length} items on this page)
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Group Items */}
                      {!isCollapsed && groupItems.map(renderProductRow)}
                    </Fragment>
                  );
                })
              ) : (
                paginatedProducts.map(renderProductRow)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --------------------------------------------------------- */}
      {/* SLIDE-OVER DRAWER: ADD / EDIT PRODUCT                     */}
      {/* --------------------------------------------------------- */}
      {typeof document !== "undefined" && isFormOpen && createPortal(
            <GsapSlideOver
              onClose={() => setIsFormOpen(false)}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-xl md:max-w-2xl bg-[#0F172A] border-l border-[#1E293B] shadow-none flex flex-col justify-between"
            >
                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-6 min-h-0 relative">
                  <button 
                    onClick={() => setIsFormOpen(false)}
                    className="absolute right-6 top-6 p-2 hover:bg-[#0B1121] rounded-xl border border-transparent hover:border-[#1E293B] transition-all text-gray-500 hover:text-gray-300 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div>
                    <h3 className="text-base font-black text-gray-100 uppercase tracking-widest flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-[#B7D1EA]" />
                      {editingProduct ? t("editor.editComponent") : t("editor.addComponent")}
                    </h3>
                    <p className="text-[10px] text-gray-400 font-semibold mt-1">{t("editor.description")}</p>
                  </div>

                  <form id="productForm" onSubmit={handleFormSubmit} className="space-y-5">
                    {/* Product Name */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">{t("editor.componentName")}</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. 550W Tier-1 Mono Solar Panel"
                        className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-semibold"
                      />
                    </div>

                    {/* Category Selection */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">{t("editor.categorySlotAssignment")}</label>
                      <select
                        required
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-semibold cursor-pointer"
                      >
                        <option value="" disabled>{t("editor.chooseConfiguratorSlot")}</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Wizard summary recommendation */}
                    <div className="p-4 rounded-xl border border-[#B7D1EA]/20 bg-[#B7D1EA]/5 space-y-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#B7D1EA]">
                        {t("editor.wizardSummaryRecommendation")}
                      </p>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useInRecommendation}
                          onChange={(e) => setUseInRecommendation(e.target.checked)}
                          className="w-4 h-4 rounded text-[#B7D1EA]"
                        />
                        <span className="text-xs font-bold text-gray-300">
                          {t("editor.includeInRecommendedBom")}
                        </span>
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">
                            {t("editor.recommendTier")}
                          </label>
                          <select
                            value={recommendTier}
                            onChange={(e) => setRecommendTier(e.target.value)}
                            className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg p-3 text-xs font-semibold cursor-pointer"
                          >
                            <option value="value">{t("editor.tiers.value")}</option>
                            <option value="standard">{t("editor.tiers.standard")}</option>
                            <option value="premium">{t("editor.tiers.premium")}</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">
                            {t("editor.priority")}
                          </label>
                          <input
                            type="number"
                            value={recommendPriority}
                            onChange={(e) => setRecommendPriority(e.target.value)}
                            className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg p-3 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Grid for Price & Status */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-gray-500" />
                          {t("editor.priceUsd")}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          placeholder="e.g. 299.99"
                          className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">{t("table.status")}</label>
                        <select
                          value={isActive ? "true" : "false"}
                          onChange={(e) => setIsActive(e.target.value === "true")}
                          className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-semibold cursor-pointer"
                        >
                          <option value="true">{t("editor.activeVisible")}</option>
                          <option value="false">{t("editor.draftHidden")}</option>
                        </select>
                      </div>
                    </div>

                    {/* Image URL Input */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">{t("editor.imagePreviewUrl")}</label>
                      <input
                        type="text"
                        required
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/photo-..."
                        className="w-full bg-[#0B1121] border border-slate-205 rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">{t("editor.descriptionLabel")}</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Summarize product attributes or compatibility rules..."
                        rows={3}
                        className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-semibold"
                      />
                    </div>

                    {/* SEO Settings Partition */}
                    <div className="pt-5 border-t border-slate-105 space-y-4">
                      <div>
                        <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                          <Search className="w-4 h-4 text-[#B7D1EA]" />
                          {t("editor.seoMetadata")}
                        </h4>
                        <p className="text-[9px] text-gray-400 font-semibold leading-relaxed">Customize search result snippets and social media previews for this product.</p>
                      </div>

                      <div className="space-y-4">
                        {/* SEO Title */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black flex justify-between font-sans">
                            <span>SEO Custom Title</span>
                            <span className={seoTitle.length > 60 ? "text-rose-500 font-bold" : "text-gray-500"}>
                              {seoTitle.length} / 60
                            </span>
                          </label>
                          <input
                            type="text"
                            value={seoTitle}
                            onChange={(e) => setSeoTitle(e.target.value)}
                            placeholder="If left blank, product name will be used"
                            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-semibold"
                          />
                        </div>

                        {/* SEO Description */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black flex justify-between font-sans">
                            <span>SEO Custom Description</span>
                            <span className={seoDescription.length > 155 ? "text-rose-500 font-bold" : "text-gray-500"}>
                              {seoDescription.length} / 155
                            </span>
                          </label>
                          <textarea
                            value={seoDescription}
                            onChange={(e) => setSeoDescription(e.target.value)}
                            placeholder="If left blank, product description snippet will be used"
                            rows={3}
                            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-semibold resize-none"
                          />
                        </div>

                        {/* SEO Keywords */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black font-sans">SEO Keywords (Comma-separated)</label>
                          <input
                            type="text"
                            value={seoKeywords}
                            onChange={(e) => setSeoKeywords(e.target.value)}
                            placeholder="e.g. premium panel, monocrystalline, 550w"
                            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-semibold"
                          />
                        </div>

                        {/* SEO OG Image */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black font-sans">SEO Open Graph Image URL</label>
                          <input
                            type="text"
                            value={seoImage}
                            onChange={(e) => setSeoImage(e.target.value)}
                            placeholder="Leave blank to fallback to default product image"
                            className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg p-3.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                          />
                        </div>

                        {/* Google SERP Preview Box */}
                        <div className="pt-2">
                          <LiveSerpPreview
                            title={seoTitle || name}
                            description={seoDescription || description}
                            url={editingProduct ? `https://solar.crafted.com/catalog/${editingProduct.id}` : "https://solar.crafted.com/catalog/new-product"}
                          />
                        </div>
                      </div>
                    </div>

                    {/* --------------------------------------------------------- */}
                    {/* DYNAMIC METADATA JSON BUILDER                             */}
                    {/* --------------------------------------------------------- */}
                    <div className="pt-5 border-t border-[#1E293B] space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-[10px] font-black text-gray-100 uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-[#B7D1EA]" />
                            {t("editor.dynamicMetadata")}
                          </h4>
                          <p className="text-[9px] text-gray-400 font-semibold leading-relaxed">Add arbitrary custom parameters for the builder engine.</p>
                        </div>
                      </div>

                      {metaFields.length === 0 ? (
                        <div className="p-5 bg-[#0B1121] border border-dashed border-[#1E293B] rounded-xl text-center text-[10px] text-gray-400 font-semibold leading-relaxed uppercase tracking-wider">
                          No custom metadata attributes defined. Add attributes to support configurator checks.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {metaFields.map((field, idx) => (
                            <GsapReveal key={idx} className="relative rounded-xl border border-[#1E293B] bg-[#0B1121] p-4">
                              <button
                                type="button"
                                onClick={() => removeMetaField(idx)}
                                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]"
                                title="Delete metadata row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <div className="mb-3 pr-10 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Metadata row {idx + 1}
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Key</span>
                                <input
                                  type="text"
                                  value={field.key}
                                  onChange={(e) => updateMetaField(idx, "key", e.target.value)}
                                  placeholder="Key (e.g. power)"
                                  required
                                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg py-2.5 px-3.5 text-[11px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                                />
                              </label>
                              <label className="space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Value</span>
                                <input
                                  type="text"
                                  value={field.value}
                                  onChange={(e) => updateMetaField(idx, "value", e.target.value)}
                                  placeholder="Value (e.g. 350W)"
                                  required
                                  className="w-full bg-[#0B1121] border border-[#1E293B] rounded-lg py-2.5 px-3.5 text-[11px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
                                />
                              </label>
                              </div>
                            </GsapReveal>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={addMetaField}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:border-[#B7D1EA] hover:bg-[#B7D1EA]/5 hover:text-[#B7D1EA] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]"
                      >
                        <Plus className="h-4 w-4" />
                        {t("editor.addMetadataRow")}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Sticky Submit Footer */}
                <div className="sticky bottom-0 bg-[#0F172A] border-t border-slate-150 p-6 flex justify-end gap-3 shrink-0 z-20">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-5 py-3 border border-[#1E293B] hover:bg-[#0B1121] text-gray-300 hover:text-gray-100 rounded-xl text-xs font-black transition-all cursor-pointer uppercase tracking-widest"
                  >
                    {t("editor.cancel")}
                  </button>
                  <button
                    type="submit"
                    form="productForm"
                    disabled={isPending}
                    className="px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40 shadow-none shadow-[#B7D1EA]/10"
                  >
                    {isPending
                      ? t("editor.saving")
                      : editingProduct
                        ? t("editor.saveChanges")
                        : t("editor.createComponent")}
                  </button>
                </div>
            </GsapSlideOver>,
        document.body
      )}

      <ConfirmDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setEditingProduct(null);
          setIsDeleting(false);
        }}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        title="Delete Component"
        message={`Are you sure you want to permanently delete the component "${editingProduct?.name || ''}"? This will remove it from all configurations and catalog slots. This action is irreversible.`}
      />

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
          <GsapBulkBar
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
          >
            <div className="bg-slate-900 text-white rounded-xl px-6 py-4 shadow-none border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md bg-opacity-95">
              <div className="flex items-center gap-3">
                <span className="bg-[#B7D1EA] text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg">
                  {selectedIds.length} Selected
                </span>
                <p className="text-xs font-semibold text-slate-300">
                  Bulk operations for selected components
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Change Status Dropdown */}
                <div className="relative">
                  <select
                    onChange={(e) => {
                      if (e.target.value === "") return;
                      handleBulkStatusChange(e.target.value === "true");
                      e.target.value = "";
                    }}
                    className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 font-bold cursor-pointer"
                    defaultValue=""
                  >
                    <option value="" disabled>Change Status</option>
                    <option value="true">Make Active</option>
                    <option value="false">Make Draft</option>
                  </select>
                </div>

                {/* Change Category Dropdown */}
                <div className="relative">
                  <select
                    onChange={(e) => {
                      if (e.target.value === "") return;
                      handleBulkCategoryChange(e.target.value);
                      e.target.value = "";
                    }}
                    className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/40 font-bold cursor-pointer max-w-[150px] truncate"
                    defaultValue=""
                  >
                    <option value="" disabled>Change Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Delete Selected Button */}
                <button
                  type="button"
                  onClick={handleBulkDeleteClick}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border border-transparent"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>

                {/* Clear Selection */}
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="p-2 text-gray-500 hover:text-white transition-colors rounded-xl hover:bg-slate-800"
                  title="Clear Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </GsapBulkBar>
        )}

      <ConfirmDeleteModal
        isOpen={isBulkDeleteOpen}
        onClose={() => {
          setIsBulkDeleteOpen(false);
          setIsBulkDeleting(false);
        }}
        onConfirm={handleBulkDeleteConfirm}
        isDeleting={isBulkDeleting}
        title="Delete Selected Components"
        message={`Are you sure you want to permanently delete the ${selectedIds.length} selected component(s)? This will remove them from all configurations and catalog slots. This action is irreversible.`}
      />
    </div>
  );
}

function getMetadataEntries(metadata: unknown): [string, unknown][] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  return Object.entries(metadata);
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Helpers to extract brand and model dynamically from a product
function getProductBrand(prod: ProductWithCategory): string {
  if (isMetadataRecord(prod.metadata)) {
    const meta = prod.metadata;
    if (meta.brand) return String(meta.brand);
    if (meta.brandName) return String(meta.brandName);
    if (meta.manufacturer) return String(meta.manufacturer);
    if (meta.panelBrand) return String(meta.panelBrand);
  }
  // Fallback to name's first word
  return prod.name.split(" ")[0] || "";
}

function getProductModel(prod: ProductWithCategory): string {
  if (isMetadataRecord(prod.metadata)) {
    const meta = prod.metadata;
    if (meta.model) return String(meta.model);
    if (meta.modelName) return String(meta.modelName);
  }
  // Fallback to name's remaining words
  const parts = prod.name.split(" ");
  if (parts.length > 1) {
    return parts.slice(1).join(" ");
  }
  return prod.name;
}

// Custom Filter Form Subcomponent
interface CustomFilterFormProps {
  onAddFilter: (filter: { field: string; operator: string; value: string }) => void;
}

function CustomFilterForm({ onAddFilter }: CustomFilterFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [field, setField] = useState("name");
  const [operator, setOperator] = useState("contains");
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      toast.error("Please enter a filter value");
      return;
    }
    onAddFilter({ field, operator, value: value.trim() });
    setValue("");
    toast.success("Custom filter added!");
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left text-[10px] font-black text-gray-400 hover:text-gray-100 uppercase tracking-wider flex items-center justify-between"
      >
        <span>+ Add Custom Filter</span>
        <span>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <GsapReveal className="p-3 bg-[#0B1121] border border-[#1E293B] rounded-xl space-y-2 mt-2">
          <form onSubmit={handleSubmit} className="space-y-2">
          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg p-1.5 text-xs text-slate-705 focus:outline-none focus:ring-1 focus:ring-[#B7D1EA] cursor-pointer font-semibold"
            >
              <option value="name">Name</option>
              <option value="price">Price</option>
              <option value="brand">Brand</option>
              <option value="model">Model</option>
              <option value="category">Category</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Operator</label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg p-1.5 text-xs text-slate-705 focus:outline-none focus:ring-1 focus:ring-[#B7D1EA] cursor-pointer font-semibold"
            >
              <option value="contains">Contains</option>
              <option value="equals">Equals</option>
              <option value="greater">Greater Than</option>
              <option value="less">Less Than</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Value</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Filter value..."
              className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg p-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-[#B7D1EA] font-semibold"
            />
          </div>

          <button
            type="submit"
            className="w-full py-1.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
          >
            Apply Filter
          </button>
          </form>
        </GsapReveal>
      )}
    </div>
  );
}

function GsapDropdownPanel({ children, className }: { children: ReactNode; className?: string }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      gsap.set(panel, { autoAlpha: 1, y: 0 });
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        panel,
        { autoAlpha: 0, y: -10 },
        { autoAlpha: 1, y: 0, duration: 0.22, ease: "power2.out" },
      );
    }, panel);

    return () => context.revert();
  }, []);

  return (
    <div ref={panelRef} className={className}>
      {children}
    </div>
  );
}

function GsapSlideOver({
  children,
  className,
  onClose,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      gsap.set(backdrop, { autoAlpha: 0.4 });
      gsap.set(panel, { x: 0 });
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 0.4, duration: 0.2, ease: "power2.out" });
      gsap.fromTo(panel, { x: "100%" }, { x: 0, duration: 0.28, ease: "power2.out" });
    }, panel);

    return () => context.revert();
  }, []);

  return (
    <>
      <div
        ref={backdropRef}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
      />
      <div ref={panelRef} className={className}>
        {children}
      </div>
    </>
  );
}

function GsapBulkBar({ children, className }: { children: ReactNode; className?: string }) {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      gsap.set(bar, { autoAlpha: 1, y: 0 });
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        bar,
        { autoAlpha: 0, y: 50 },
        { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out" },
      );
    }, bar);

    return () => context.revert();
  }, []);

  return (
    <div ref={barRef} className={className}>
      {children}
    </div>
  );
}
