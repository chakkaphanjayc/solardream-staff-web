import { create } from "zustand";

export interface ReportFilters {
  dateRange: string;      // 'all' | '7d' | '30d'
  category: string;       // 'all' | 'CPUs' | 'GPUs' | 'Cases' | etc.
  marketingSource: string;// 'all' | 'Google Adwords' | 'Instagram Feed' | 'Newsletter/Email' | 'Direct/Organic'
  userSegment: string;    // 'all' | 'New' | 'Returning' | 'Active'
}

interface UserConfigData {
  id: string;
  userEmail: string;
  userName: string;
  totalPrice: number;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: Date;
  products: {
    id: string;
    name: string;
    price: number;
    category: string;
  }[];
}

interface ReportState {
  // Data State
  initialConfigs: UserConfigData[];
  filteredConfigs: UserConfigData[];
  
  // Interactive Filters (Slicers)
  filters: ReportFilters;
  
  // Interactive Selection Highlights
  activeMetricHighlight: string | null;   // 'users' | 'products' | 'builds' | 'value'
  activeSourceHighlight: string | null;   // 'Google Adwords' | 'Instagram Feed' | 'Newsletter/Email' | 'Direct/Organic'
  activeCategoryHighlight: string | null; // 'CPUs' | 'GPUs' | 'Cases'
  
  // Layout Customization
  visualOrder: string[]; // List of component IDs to support reorganization
  
  // Actions
  setInitialData: (configs: UserConfigData[]) => void;
  setFilter: (key: keyof ReportFilters, value: string) => void;
  resetFilters: () => void;
  setMetricHighlight: (metric: string | null) => void;
  setSourceHighlight: (source: string | null) => void;
  setCategoryHighlight: (category: string | null) => void;
  reorderVisuals: (order: string[]) => void;
}

const DEFAULT_FILTERS: ReportFilters = {
  dateRange: "all",
  category: "all",
  marketingSource: "all",
  userSegment: "all",
};

export const useReportStore = create<ReportState>((set, get) => ({
  initialConfigs: [],
  filteredConfigs: [],
  filters: DEFAULT_FILTERS,
  activeMetricHighlight: null,
  activeSourceHighlight: null,
  activeCategoryHighlight: null,
  visualOrder: ["marketing", "popularity", "funnel"],

  setInitialData: (configs) => {
    set({ initialConfigs: configs, filteredConfigs: configs });
  },

  setFilter: (key, value) => {
    set((state) => {
      const newFilters = { ...state.filters, [key]: value };
      
      // Perform cross-filtering logic
      let filtered = [...state.initialConfigs];

      // 1. Date Range Filter
      if (newFilters.dateRange !== "all") {
        const cutoff = new Date();
        const days = newFilters.dateRange === "7d" ? 7 : 30;
        cutoff.setDate(cutoff.getDate() - days);
        filtered = filtered.filter((c) => new Date(c.createdAt) >= cutoff);
      }

      // 2. Category Filter
      if (newFilters.category !== "all") {
        filtered = filtered.filter((c) => 
          c.products.some((p) => p.category.toLowerCase() === newFilters.category.toLowerCase())
        );
      }

      // 3. Marketing Source Filter
      if (newFilters.marketingSource !== "all") {
        filtered = filtered.filter((c) => {
          if (newFilters.marketingSource === "Direct/Organic") {
            return !c.utmSource;
          }
          return c.utmSource?.toLowerCase() === newFilters.marketingSource.toLowerCase();
        });
      }

      // 4. User Segment Filter (simulated logic for segment)
      if (newFilters.userSegment !== "all") {
        if (newFilters.userSegment === "New") {
          filtered = filtered.filter((c) => c.totalPrice < 1500); // Simulated: lower cost is new/entry segment
        } else if (newFilters.userSegment === "Returning") {
          filtered = filtered.filter((c) => c.totalPrice >= 1500); // Simulated: premium configuration
        }
      }

      return {
        filters: newFilters,
        filteredConfigs: filtered,
      };
    });
  },

  resetFilters: () => {
    set((state) => ({
      filters: DEFAULT_FILTERS,
      filteredConfigs: state.initialConfigs,
      activeMetricHighlight: null,
      activeSourceHighlight: null,
      activeCategoryHighlight: null,
    }));
  },

  setMetricHighlight: (metric) => {
    set({ activeMetricHighlight: metric });
  },

  setSourceHighlight: (source) => {
    set({ activeSourceHighlight: source });
  },

  setCategoryHighlight: (category) => {
    set({ activeCategoryHighlight: category });
  },

  reorderVisuals: (order) => {
    set({ visualOrder: order });
  },
}));
