import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { generatePublicProductName } from "@/lib/productUtils";

export interface CartCategory {
  name: string;
}

export interface CartProduct {
  id: string;
  name?: string;
  brand?: string;
  model?: string;
  price: number;
  imageUrl: string;
  description: string | null;
  category: CartCategory;
  metadata?: unknown;
  isActive?: boolean;
  isBundle?: boolean;
  bundleItems?: { productId: string; name: string; quantity: number }[];
  erpnextItemCode?: string;
}

export interface CartItem {
  product: CartProduct & { name: string };
  quantity: number;
}

const normalizeCartProduct = (product: CartProduct): CartItem["product"] => {
  const name = generatePublicProductName({
    brand: product.brand,
    model: product.model,
    categoryName: product.category?.name,
    metadata: product.metadata,
  });

  return {
    ...product,
    name: name || product.name || "Untitled Product",
    isBundle: product.isBundle ?? false,
    bundleItems: product.bundleItems ?? [],
  };
};

const createNoopStorage = (): StateStorage => ({
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
});

interface CartState {
  items: CartItem[];
  hasHydrated: boolean;
  addItem: (product: CartItem["product"]) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getItemsCount: () => number;
  getItemQuantity: (productId: string) => number;
}

let useCartStoreRef: UseBoundStore<StoreApi<CartState>> | null = null;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      hasHydrated: false,
      addItem: (product) =>
        set((state) => {
          const normalizedProduct = normalizeCartProduct(product);
          const existing = state.items.find((item) => item.product.id === normalizedProduct.id);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.product.id === normalizedProduct.id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item
              ),
            };
          }

          return { items: [...state.items, { product: normalizedProduct, quantity: 1 }] };
        }),
      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
        })),
      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.product.id === productId
              ? { ...item, quantity: Math.max(1, quantity) }
              : item
          ),
        })),
      clearCart: () => set({ items: [] }),
      getTotalPrice: () => {
        return get().items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      },
      getItemsCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
      getItemQuantity: (productId) => {
        return get().items.find((item) => item.product.id === productId)?.quantity || 0;
      },
    }),
    {
      name: "solar-dream-cart",
      skipHydration: true,
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : createNoopStorage()
      ),
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        if (state && useCartStoreRef) {
          useCartStoreRef.setState({ hasHydrated: true });
        }
      },
    }
  )
);

useCartStoreRef = useCartStore;
