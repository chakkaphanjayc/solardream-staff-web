"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "@/components/ui/icons";

import AdminSidebar, { type AdminSidebarUser } from "@/components/admin/AdminSidebar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AdminMobileNav({ currentUser }: { currentUser: AdminSidebarUser }) {
  const t = useTranslations("AdminShell");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trigger = triggerRef.current;
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      (previouslyFocused ?? trigger)?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "fixed left-4 top-3 z-40 size-9 min-h-9 rounded-md border-[#30363d] bg-[#161b22] text-[#c9d1d9] shadow-sm hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:ring-[#58a6ff] lg:hidden")}
        aria-label={t("openNavigation")}
        aria-expanded={open}
        aria-controls="admin-mobile-navigation"
      >
        <Menu className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-label="Close admin navigation"
          />
          <div
            id="admin-mobile-navigation"
            ref={drawerRef}
            className="relative h-full w-[min(19rem,calc(100vw-2.5rem))] border-r border-[#30363d] bg-[#161b22] shadow-2xl shadow-black/40"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              ref={closeButtonRef}
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "absolute right-3 top-3 z-10 size-9 min-h-9 rounded-md border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:ring-[#58a6ff]")}
              aria-label={t("closeNavigation")}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <AdminSidebar currentUser={currentUser} mobile onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
