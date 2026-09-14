import { create } from "zustand";

interface SourceTrackingState {
  source: string;
  setSource: (source: string) => void;
}

const STORAGE_KEY = "solardream_lead_source";

function getInitialSource(): string {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  }
  return "direct";
}

export const useSourceTrackingStore = create<SourceTrackingState>((set) => ({
  source: getInitialSource(),
  setSource: (source: string) => {
    const cleanSource = source.trim().toLowerCase() || "direct";
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, cleanSource);
    }
    set({ source: cleanSource });
  },
}));
