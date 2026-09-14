import { create } from "zustand";

export interface ChatStore {
  isMessengerOpen: boolean;
  activeThreadId: string | null;
  pendingReference: {
    type: "QUOTATION" | "PRODUCT" | "BUNDLE" | "SAVED_BUILD" | "NONE";
    id: string;
    title: string;
    subtitle?: string; // e.g., price or status
  } | null;
  openMessenger: () => void;
  closeMessenger: () => void;
  setActiveThreadId: (id: string | null) => void;
  setPendingReference: (ref: ChatStore["pendingReference"]) => void;
  clearPendingReference: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  isMessengerOpen: false,
  activeThreadId: null,
  pendingReference: null,
  openMessenger: () => set({ isMessengerOpen: false }),
  closeMessenger: () => set({ isMessengerOpen: false }),
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  setPendingReference: (ref) => set({ pendingReference: ref }),
  clearPendingReference: () => set({ pendingReference: null }),
}));
