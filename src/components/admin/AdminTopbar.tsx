"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, ChevronRight, Moon, ShieldCheck, Sun, UserRound } from "@/components/ui/icons";
import SearchTrigger from "@/components/admin/SearchTrigger";
import {
  ADMIN_THEME_EVENT,
  ADMIN_THEME_STORAGE_KEY,
  getAdminThemeServerSnapshot,
  getAdminThemeSnapshot,
  subscribeAdminTheme,
  type AdminTheme,
} from "@/components/admin/AdminThemeScope";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { localeLabels, locales, type Locale } from "@/i18n/locales";

const CRUMB_KEYS: Record<string, string> = {
  admin: "admin", sales: "sales", technical: "technical", marketing: "marketing", developer: "developer", "support-workspace": "supportWorkspace", settings: "settings", showcase: "showcase", analytics: "analytics", sandbox: "sandbox", "api-logs": "apiLogs", api: "api", "audit-logs": "auditLogs", crm: "crm", quotations: "quotations", dispatch: "dispatch", projects: "projects", "job-tickets": "jobTickets", users: "users", wizards: "wizards", build: "build", line: "line", content: "content", automation: "automation", "test-center": "testCenter", "rich-menu": "richMenu", connections: "connections", messages: "messages",
};

function toTitle(segment: string, t: ReturnType<typeof useTranslations>) {
  const key = CRUMB_KEYS[segment];
  return key ? t(`breadcrumbsLabels.${key}`) : segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AdminTopbar() {
  const t = useTranslations("AdminShell");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const theme = useSyncExternalStore(subscribeAdminTheme, getAdminThemeSnapshot, getAdminThemeServerSnapshot);
  const localePrefix = `/${locale}`;
  const breadcrumbs = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const adminIndex = segments.indexOf("admin");
    const adminSegments = adminIndex >= 0 ? segments.slice(adminIndex) : segments;

    return adminSegments.reduce<Array<{ label: string; href: string }>>((items, segment, index) => {
      const href = `/${locale}/${adminSegments.slice(0, index + 1).join("/")}`;
      if (!/^[0-9a-f-]{16,}$/i.test(segment)) {
        items.push({ label: toTitle(segment, t), href });
      }
      return items;
    }, []);
  }, [locale, pathname, t]);

  const toggleTheme = () => {
    const nextTheme: AdminTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextTheme);
    window.dispatchEvent(new CustomEvent<AdminTheme>(ADMIN_THEME_EVENT, { detail: nextTheme }));
  };

  const switchAdminLanguage = (nextLocale: Locale) => {
    const nextPath = pathname.replace(/^\/(en|th|ja|zh|ko|vi)(?=\/|$)/, `/${nextLocale}`);
    window.location.assign(nextPath);
  };

  return (
    <header className="sticky top-0 z-30 flex min-h-16 w-full shrink-0 items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] pl-16 pr-4 text-[#c9d1d9] sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-8 w-8 min-h-8 rounded-md border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]")}
          title={t("back")}
          aria-label={t("back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="block">
          <SearchTrigger />
        </div>
        <nav className="hidden min-w-0 items-center gap-1 text-xs font-medium text-[#8b949e] md:flex" aria-label={t("breadcrumbs")}>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.href} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#6e7681]" aria-hidden="true" /> : null}
              <Link
                href={crumb.href}
                aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}
                className={index === breadcrumbs.length - 1
                  ? "truncate font-semibold text-[#f0f6fc]"
                  : "truncate text-[#8b949e] transition-colors hover:text-[#f0f6fc] hover:underline hover:underline-offset-4"}
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-9 w-9 min-h-9 rounded-md border-[#30363d] bg-[#0d1117] p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]")}
          aria-label={theme === "dark" ? t("useLightTheme") : t("useDarkTheme")}
          title={theme === "dark" ? t("useLightTheme") : t("useDarkTheme")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>
        <label className="hidden min-h-9 items-center rounded-md border border-[#30363d] bg-[#0d1117] px-2 sm:flex">
          <span className="sr-only">{t("adminLanguage")}</span>
          <select value={locale} onChange={(event) => switchAdminLanguage(event.target.value as Locale)} className="h-8 bg-transparent text-xs font-medium text-[#c9d1d9] outline-none">
            {locales.map((item) => <option key={item} value={item} className="bg-[#161b22] text-[#f0f6fc]">{localeLabels[item]}</option>)}
          </select>
        </label>
        <div className="hidden items-center gap-2 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-[11px] font-mono text-[#c9d1d9] sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-[#3fb950] opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3fb950]" />
          </span>
          {t("workspaceConnected")}
        </div>
        <Link href={`${localePrefix}/admin/notifications`} className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-9 w-9 min-h-9 rounded-md border-[#30363d] bg-[#0d1117] p-2 text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]")} aria-label={t("openNotifications")}>
          <Bell className="h-4 w-4" />
        </Link>
        <div className="flex min-h-9 items-center gap-2 rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1" title={t("adminAccess")}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#21262d] text-[#f0f6fc]">
            <UserRound className="h-3.5 w-3.5" />
          </span>
          <ShieldCheck className="hidden h-4 w-4 text-[#3fb950] sm:block" />
        </div>
      </div>
    </header>
  );
}
