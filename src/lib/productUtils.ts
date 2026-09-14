/**
 * Generates an SEO-friendly public product display name based on its attributes.
 * Formula: [Sub-Category Name] [Brand] [Model Code] [Key Specification]
 */
export function generatePublicProductName(product: {
  modelCode?: string | null;
  model?: string | null;
  brand?: string | null;
  subCategoryName?: string | null;
  categoryName?: string | null;
  category?: { name?: string | null } | null;
  keySpecification?: string | null;
  specifications?: unknown;
  metadata?: unknown;
}): string {
  // 1. Sub-Category Name (with sanitization)
  let subCat = product.subCategoryName || product.categoryName || product.category?.name || "";
  if (subCat) {
    // Replace forward slashes (/), backslashes (\) or underscores (_) with single spaces
    subCat = subCat.replace(/[\/\\_]/g, " ");
  }

  // 2. Brand
  const brand = product.brand || "";

  // 3. Model Code
  const modelCode = product.modelCode || product.model || "";

  // 4. Key Specification (optional)
  let keySpec = product.keySpecification || "";
  if (!keySpec) {
    keySpec = getRecordText(product.specifications, "keySpecification") ||
      getRecordText(product.specifications, "key_specification");
  }
  if (!keySpec) {
    keySpec = getRecordText(product.metadata, "keySpecification") ||
      getRecordText(product.metadata, "key_specification");
  }

  // Combine components into formula
  const parts = [subCat, brand, modelCode, keySpec]
    .map((p) => String(p || "").trim())
    .filter(Boolean);

  // Join and clean up accidental double spacing
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function getRecordText(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate === "string") return candidate.trim();
  if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  return "";
}
