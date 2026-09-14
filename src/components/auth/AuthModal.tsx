"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { login, signup } from "@/app/actions/auth";
import { Lock, Mail, User } from "@/components/ui/icons";
import HypotrochoidLoader from "@/components/ui/HypotrochoidLoader";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const t = useTranslations("AuthModal");
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dialogTitle = isLogin ? t("welcome") : t("createAccount");
  const dialogDescription = isLogin
    ? t("loginDescription")
    : t("signupDescription");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      if (isLogin) {
        const result = await login(formData);
        if (result?.error) {
          setError(result.error);
        } else {
          onClose();
          router.refresh();
        }
      } else {
        const result = await signup(formData);
        if (result?.error) {
          setError(result.error);
        } else if (result?.success) {
          setMessage(result.message);
        }
      }
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      tone="light"
      ariaLabel={dialogTitle}
    >
      <DialogContent className="rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] shadow-2xl overflow-hidden">
        <DialogHeader className="border-b border-[#F7F6F3] bg-[#F0EEE9] px-6 py-6 sm:px-8">
          <div className="min-w-0">
            <DialogTitle className="break-words text-2xl font-bold text-[#2E2C27] [text-wrap:balance] sm:text-3xl">
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-[42ch] text-sm font-medium leading-6 text-[#4E4B44] [text-wrap:pretty]">
              {dialogDescription}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-6 bg-[#F0EEE9] px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin ? (
              <div className="space-y-2">
                <label
                  htmlFor="auth-name"
                  className="block text-xs font-bold text-[#4E4B44]"
                >
                  {t("fullName")}
                </label>
                <div className="relative">
                  <User
                    aria-hidden="true"
                    className="absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#8E8B83]"
                  />
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder={t("namePlaceholder")}
                    required
                    className="min-h-11 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] py-3 pe-4 ps-11 font-medium text-[#2E2C27] outline-none transition-colors duration-150 placeholder:text-[#8E8B83] focus:border-[#7CA8D0] focus:bg-[#F0EEE9] motion-reduce:transition-none"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                htmlFor="auth-email"
                className="block text-xs font-bold text-[#4E4B44]"
              >
                {t("email")}
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#8E8B83]"
                />
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  className="min-h-11 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] py-3 pe-4 ps-11 font-medium text-[#2E2C27] outline-none transition-colors duration-150 placeholder:text-[#8E8B83] focus:border-[#7CA8D0] focus:bg-[#F0EEE9] motion-reduce:transition-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="auth-password"
                className="block text-xs font-bold text-[#4E4B44]"
              >
                {t("password")}
              </label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#8E8B83]"
                />
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  required
                  className="min-h-11 w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] py-3 pe-4 ps-11 font-medium text-[#2E2C27] outline-none transition-colors duration-150 placeholder:text-[#8E8B83] focus:border-[#7CA8D0] focus:bg-[#F0EEE9] motion-reduce:transition-none"
                />
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="break-words rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm font-medium text-rose-800"
              >
                {error}
              </div>
            ) : null}

            {message ? (
              <div
                role="status"
                className="break-words rounded-xl border border-[#CBC7BE] bg-[#DCE8F5] p-3 text-center text-sm font-medium text-[#2E2C27]"
              >
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-3 text-sm font-bold text-white shadow-md transition-all duration-150 hover:bg-[#A5C2DE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none active:scale-95"
            >
              {loading ? (
                <HypotrochoidLoader
                  size={18}
                  color="#FFFFFF"
                  className="text-white"
                />
              ) : null}
              {isLogin ? t("signIn") : t("signUp")}
            </button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold text-[#4F7FA8] transition-colors duration-150 hover:bg-[#DCE8F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] motion-reduce:transition-none active:scale-95"
            >
              {isLogin ? t("switchToSignup") : t("switchToLogin")}
            </button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
