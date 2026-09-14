"use client";

import { useEffect } from "react";

export type AdminTheme = "dark" | "light";

export const ADMIN_THEME_STORAGE_KEY = "solardream-admin-theme";
export const ADMIN_THEME_EVENT = "solardream-admin-theme-change";

export function isAdminTheme(value: string | null): value is AdminTheme {
  return value === "dark" || value === "light";
}

export function subscribeAdminTheme(onStoreChange: () => void) {
  const handleThemeChange = () => onStoreChange();
  window.addEventListener(ADMIN_THEME_EVENT, handleThemeChange);
  return () => window.removeEventListener(ADMIN_THEME_EVENT, handleThemeChange);
}

export function getAdminThemeSnapshot(): AdminTheme {
  const shell = document.querySelector<HTMLElement>('[data-bagui="operations-shell"]');
  return shell?.dataset.adminTheme === "light" ? "light" : "dark";
}

export function getAdminThemeServerSnapshot(): AdminTheme {
  return "dark";
}

function applyAdminTheme(theme: AdminTheme) {
  const shell = document.querySelector<HTMLElement>('[data-bagui="operations-shell"]');
  if (shell) shell.dataset.adminTheme = theme;
  document.body.dataset.adminTheme = theme;
}

/** Applies Solar-Ops styling to body-level portals while an admin route is mounted. */
export default function AdminThemeScope() {
  useEffect(() => {
    document.body.classList.add("solar-ops-portal");

    const storedTheme = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    applyAdminTheme(isAdminTheme(storedTheme) ? storedTheme : "dark");

    const handleThemeChange = (event: Event) => {
      const theme = (event as CustomEvent<AdminTheme>).detail;
      if (isAdminTheme(theme)) applyAdminTheme(theme);
    };

    window.addEventListener(ADMIN_THEME_EVENT, handleThemeChange);
    const initialThemeNotification = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent<AdminTheme>(ADMIN_THEME_EVENT, { detail: getAdminThemeSnapshot() }));
    }, 0);

    return () => {
      window.clearTimeout(initialThemeNotification);
      window.removeEventListener(ADMIN_THEME_EVENT, handleThemeChange);
      document.body.classList.remove("solar-ops-portal");
      delete document.body.dataset.adminTheme;
    };
  }, []);

  return null;
}
