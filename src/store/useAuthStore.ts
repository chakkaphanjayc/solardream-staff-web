import { create } from "zustand";
import type { AuthModalState } from "@/types/auth";

export const useAuthStore = create<AuthModalState>((set) => ({
  isModalOpen: false,
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));
