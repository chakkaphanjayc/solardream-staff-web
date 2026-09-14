"use client";

import { useAuthStore } from "@/store/useAuthStore";
import AuthModal from "./AuthModal";

export default function AuthModalWrapper() {
  const { isModalOpen, closeModal } = useAuthStore();
  return <AuthModal isOpen={isModalOpen} onClose={closeModal} />;
}
