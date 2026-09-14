"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Home } from "@/components/ui/icons";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { getBrowserPublicOrigin } from "@/lib/siteUrl";
import { ADMIN_NAV_SECTIONS, type AdminNavItem } from "@/components/admin/adminNavigation";

export type AdminSidebarUser = {
  role?: string | null;
  email?: string | null;
  name?: string | null;
};

type AdminSidebarProps = {
  currentUser: AdminSidebarUser;
  mobile?: boolean;
  onNavigate?: () => void;
};

function getLocalePrefix(pathname: string) {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return firstSegment && firstSegment !== "admin" ? `/${firstSegment}` : "";
}

function getAdminPath(pathname: string, localePrefix: string) {
  if (!localePrefix) return pathname;
  return pathname.slice(localePrefix.length) || "/";
}

function isAdminRole(role: string | null | undefined) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export default function AdminSidebar({ currentUser, mobile = false, onNavigate }: AdminSidebarProps) {
  const t = useTranslations("AdminSidebar");
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const localePrefix = useMemo(() => getLocalePrefix(pathname), [pathname]);
  const adminPath = useMemo(() => getAdminPath(pathname, localePrefix), [pathname, localePrefix]);
  const isAdmin = isAdminRole(currentUser.role);
  const publicSiteHref = `${getBrowserPublicOrigin()}${localePrefix || "/"}`;
  const visibleSections = useMemo(
    () => ADMIN_NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => !item.adminOnly || isAdmin) })).filter((section) => section.items.length > 0),
    [isAdmin],
  );
  const activeItemId = useMemo(() => {
    const matches = visibleSections.flatMap((section) => section.items).filter((item) => item.href === adminPath || (item.href !== "/admin" && adminPath.startsWith(`${item.href}/`)));
    return matches.sort((left, right) => right.href.length - left.href.length)[0]?.id ?? "overview";
  }, [adminPath, visibleSections]);

  const localizeHref = (href: string) => `${localePrefix}${href}`;
  const isItemActive = (item: AdminNavItem) => item.id === activeItemId;

  const renderNavItem = (item: AdminNavItem) => {
    const Icon = item.icon;
    const isActive = isItemActive(item);
    return (
      <Link
        key={item.id}
        href={localizeHref(item.href)}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          buttonVariants({ variant: "quiet", size: "sm" }),
          "group min-h-10 w-full justify-start gap-3 rounded-md px-3 text-[13px] font-medium focus-visible:ring-[#58a6ff] focus-visible:ring-inset",
          isActive ? "bg-[#21262d] font-semibold text-[#f0f6fc]" : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-[#58a6ff]" : "text-[#8b949e] group-hover:text-[#c9d1d9]")} aria-hidden="true" />
        <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
        {isActive ? <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#58a6ff]" aria-hidden="true" /> : null}
      </Link>
    );
  };

  return (
    <aside suppressHydrationWarning className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-[#161b22] text-[#c9d1d9]", mobile && "pt-1")}>
      <div className="flex h-16 shrink-0 items-center border-b border-[#30363d] px-4 pr-14">
        <Link href={localizeHref("/admin")} onClick={onNavigate} className="flex min-w-0 items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#238636] text-xs font-bold text-white">S</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-[#f0f6fc]">SolarDream</span>
            <span className="block text-[10px] font-medium tracking-[0.04em] text-[#8b949e]">{t("operations")}</span>
          </span>
        </Link>
      </div>

      <div data-lenis-prevent suppressHydrationWarning className="custom-scrollbar flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <nav aria-label={t("navigationLabel")} suppressHydrationWarning>
          <p className="px-3 pb-2 text-xs font-semibold text-[#8b949e]">{t("navigationLabel")}</p>
          <div className="space-y-3">
            {visibleSections.map((section) => {
              const isExpanded = expandedSections[section.id] ?? section.items.some(isItemActive);
              return (
                <section key={section.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedSections((current) => ({ ...current, [section.id]: !isExpanded }))}
                    className="flex min-h-9 w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs font-semibold text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
                    aria-expanded={isExpanded}
                  >
                    {t(`sections.${section.labelKey}`)}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                  </button>
                  <div className={cn("mt-1 space-y-1 overflow-hidden transition-[max-height,opacity] duration-200", isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0")}>
                    {section.items.map(renderNavItem)}
                  </div>
                </section>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="shrink-0 space-y-2 border-t border-[#30363d] bg-[#0d1117] p-3">
        <div className="flex items-center gap-3 rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#21262d] text-xs font-bold text-[#f0f6fc]">{(currentUser.name || currentUser.email || "S").slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-[#f0f6fc]">{currentUser.name || t("operationsWorkspace")}</span>
            <span className="block truncate text-[10px] text-[#8b949e]">{currentUser.role || t("loadingAccess")}</span>
          </span>
        </div>
        <Link href={publicSiteHref} onClick={onNavigate} className="group flex min-h-9 items-center gap-2.5 rounded-md px-3 text-[12px] font-medium text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] focus-visible:ring-inset">
          <Home className="h-4 w-4 shrink-0 text-[#8b949e] group-hover:text-[#f0f6fc]" aria-hidden="true" />
          <span>{t("backToSite")}</span>
        </Link>
      </div>
    </aside>
  );
}
