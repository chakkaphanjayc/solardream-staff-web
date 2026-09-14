import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FeatureFlagItem } from "@/app/actions/featureFlags";

interface FeatureFlagState {
  flags: Record<string, boolean>;
  flagItems: FeatureFlagItem[];
  isLoading: boolean;
  loaded: boolean;
  fetchFlags: () => Promise<void>;
  setFlag: (key: string, isActive: boolean) => Promise<void>;
  isEnabled: (key: string) => boolean;
  setInitialFlags: (items: FeatureFlagItem[]) => void;
}

export const useFeatureFlagStore = create<FeatureFlagState>()(
  persist(
    (set, get) => ({
      flags: {
        wizard_module: true,
        build_configurator: true,
        services_module: true,
        quotation_dispatch: true,
        store_commerce: true,
        OPS_V2_PROJECTS: false,
        OPS_V2_PROJECT_WORKSPACE: false,
        OPS_V2_SCHEDULING: false,
        OPS_V2_FIELD: false,
        OPS_V2_ASSETS: false,
        OPS_V2_WARRANTY: false,
        OPS_V2_AFTER_SALES: false,
        OPS_V2_CUSTOMER_PORTAL: false,
      },
      flagItems: [],
      isLoading: false,
      loaded: false,

      setInitialFlags: (items: FeatureFlagItem[]) => {
        const flagsMap = items.reduce<Record<string, boolean>>((acc, item) => {
          acc[item.key] = item.isActive;
          return acc;
        }, {});

        set({
          flags: flagsMap,
          flagItems: items,
          loaded: true,
        });
      },

      fetchFlags: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch("/api/system/feature-flags", { cache: "no-store" });
          if (res.ok) {
            const data: unknown = await res.json();
            if (
              data &&
              typeof data === "object" &&
              "success" in data &&
              data.success === true &&
              "flags" in data &&
              data.flags &&
              typeof data.flags === "object"
            ) {
              set({
                flags: data.flags as Record<string, boolean>,
                flagItems: "items" in data && Array.isArray(data.items) ? data.items as FeatureFlagItem[] : [],
                loaded: true,
                isLoading: false,
              });
              return;
            }
          }
        } catch (error) {
          console.error("Failed to fetch feature flags from API:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      setFlag: async (key: string, isActive: boolean) => {
        const previousFlag = get().flags[key];
        const previousItem = get().flagItems.find((item) => item.key === key);

        set((state) => ({
          flags: {
            ...state.flags,
            [key]: isActive,
          },
          flagItems: state.flagItems.map((item) =>
            item.key === key ? { ...item, isActive } : item
          ),
        }));

        try {
          const res = await fetch("/api/system/feature-flags", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, is_active: isActive }),
          });

          if (!res.ok) {
            throw new Error(`Failed to sync feature flag ${key}.`);
          }

          const data: unknown = await res.json();
          if (
            !data ||
            typeof data !== "object" ||
            !("success" in data) ||
            data.success !== true
          ) {
            throw new Error(`Failed to sync feature flag ${key}.`);
          }
        } catch (error: unknown) {
          set((state) => ({
            flags: {
              ...state.flags,
              [key]: previousFlag ?? !isActive,
            },
            flagItems: previousItem
              ? state.flagItems.map((item) => item.key === key ? previousItem : item)
              : state.flagItems,
          }));
          console.error(`Error toggling flag ${key}:`, error);
          throw error;
        }
      },

      isEnabled: (key: string) => {
        const state = get();
        // Default to true if key is not defined in flags yet
        return state.flags[key] !== undefined ? state.flags[key] : !key.startsWith("OPS_V2_");
      },
    }),
    {
      name: "solardream-feature-flags",
      partialize: (state) => ({
        flags: state.flags,
      }),
    }
  )
);
