export type AuthMode = "login" | "register";

export interface AuthClaimPrefill {
  fullName: string;
  email: string;
  phone: string;
  serviceAddress: string;
}

export interface AuthModalState {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}
