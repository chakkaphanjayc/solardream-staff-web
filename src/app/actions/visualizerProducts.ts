"use server";

import { unstable_cache } from "next/cache";
import { listCatalogProducts } from "@/lib/erpnextCatalog";
import {
  fallbackVisualizerPanels,
  isPanelProduct,
  mapProductToVisualizerPanel,
  type VisualizerPanelProduct,
} from "@/lib/visualizerProducts";

const getCachedVisualizerPanelProducts = unstable_cache(
  async (): Promise<VisualizerPanelProduct[]> => {
    try {
      const { products } = await listCatalogProducts({ take: 80, sort: "newest" });

      const panelProducts = products.filter(isPanelProduct).map(mapProductToVisualizerPanel);
      return panelProducts;
    } catch (error) {
      console.error("[visualizer-products] Failed to load product catalog", error);
      return [];
    }
  },
  ["visualizer-panel-products-v1"],
  { revalidate: 300, tags: ["visualizer-products"] },
);

export async function getVisualizerPanelProducts(): Promise<VisualizerPanelProduct[]> {
  return getCachedVisualizerPanelProducts();
}
