"use server";

import type { Component, Category as CategoryType } from "@/types";
import { listCatalogProducts } from "@/lib/erpnextCatalog";

export async function getComponents(): Promise<Component[]> {
  const result = await listCatalogProducts({ take: 100 });
  return result.products.map((product) => ({
    id: product.id,
    name: `${product.brand} ${product.model}`.trim(),
    category: product.category.name as CategoryType,
    price: product.price,
    imageUrl: product.imageUrl,
    description: product.description || "",
  }));
}

export async function addComponent(_component: Component) {
  return {
    success: false,
    error: "ERPNext owns the Item master. Create the Item in ERPNext instead.",
  };
}

export async function deleteComponent(_id: string) {
  return {
    success: false,
    error: "ERPNext owns the Item master. Disable the Item in ERPNext instead.",
  };
}

export async function updateComponent(_updatedComponent: Component) {
  return {
    success: false,
    error: "ERPNext owns the Item master. Update the Item in ERPNext instead.",
  };
}
