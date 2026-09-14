"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  User,
  LogOut,
  ChevronDown,
  FileText,
  LifeBuoy,
  LayoutDashboard,
} from "@/components/ui/icons";
import { createClient } from "@/utils/supabase/client";
import { getDbUser, signOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getBrowserAdminUrl } from "@/lib/siteUrl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type AuthUser = {
  id?: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type DbUserRole =
  "USER" | "ADMIN" | "SUPER_ADMIN" | "MANAGER" | "STAFF" | "INSTALLER";

export type AuthButtonPresentation = "popover" | "inline";
export type AuthButtonAppearance = "default" | "glass";

export type AuthButtonProps = {
  className?: string;
  wrapperClassName?: string;
  dropdownClassName?: string;
  presentation?: AuthButtonPresentation;
  appearance?: AuthButtonAppearance;
  isDarkTheme?: boolean;
  onNavigate?: () => void;
};

export default function AuthButton({
  className,
  wrapperClassName,
  dropdownClassName,
  presentation = "popover",
  appearance = "default",
  onNavigate,
}: AuthButtonProps) {
  const isGlassAppearance = appearance === "glass";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dbRole, setDbRole] = useState<DbUserRole | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const locale = useLocale();
  const t = useTranslations("AuthButton");
  const router = useRouter();

  useEffect(() => {
    let isSubscribed = true;
    let loadedRoleUserId: string | null | undefined;
    let roleRequestVersion = 0;

    const applyUser = (nextUser: AuthUser | null) => {
      if (!isSubscribed) return;

      setUser(nextUser);
      const nextUserId = nextUser?.id ?? null;
      if (nextUserId === loadedRoleUserId) return;

      loadedRoleUserId = nextUserId;
      const requestVersion = ++roleRequestVersion;
      if (!nextUser) {
        setDbRole(null);
        return;
      }

      void getDbUser()
        .then((dbUser) => {
          if (!isSubscribed || requestVersion !== roleRequestVersion) return;
          setDbRole((dbUser?.role as DbUserRole | undefined) ?? null);
        })
        .catch(() => {
          if (!isSubscribed || requestVersion !== roleRequestVersion) return;
          setDbRole(null);
        });
    };

    const refreshUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        applyUser(session?.user ?? null);
      } catch {
        applyUser(null);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    void refreshUser();

    const handleCustomAuthChange = () => {
      void refreshUser();
    };

    window.addEventListener("solardream:auth-changed", handleCustomAuthChange);

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
      window.removeEventListener(
        "solardream:auth-changed",
        handleCustomAuthChange,
      );
    };
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await signOut(); // Server action to clear cookies
    setIsDropdownOpen(false);
    setUser(null);
    setDbRole(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("solardream:auth-changed"));
    }
    router.refresh();
  };

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    t("accountFallback");
  const profileHref = `/${locale}/profile`;
  const proposalsHref = `/${locale}/proposals`;
  const supportHref = `/${locale}/support/dashboard`;
  const adminHref = getBrowserAdminUrl(`/${locale}/admin`);
  const dbRoleValue = dbRole;
  const isAdmin = dbRoleValue === "ADMIN";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((part: string) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const accountMenuItemClass =
    "group/item flex min-h-11 w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-medium text-[#2E2C27] transition-all duration-200 hover:bg-[#E6E3DC]";
  const accountMenuIconClass =
    "h-4 w-4 text-[#4F7FA8] transition-colors group-hover/item:text-[#A5C2DE]";

  if (user) {
    if (presentation === "inline") {
      return (
        <div
          className={cn(
            "w-full overflow-hidden rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] text-[#2E2C27] shadow-sm",
            wrapperClassName,
          )}
        >
          <div
            className={cn(
              "flex min-h-12 items-center gap-3 border-b border-[#F7F6F3] bg-[#E6E3DC] px-4 py-3",
              className,
            )}
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#CBC7BE] bg-[#DCE8F5] text-[#2E2C27]">
              {user.user_metadata?.avatar_url ? (
                <Image
                  src={user.user_metadata.avatar_url}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  width={36}
                  height={36}
                />
              ) : (
                <span className="text-[10px] font-black tracking-[0.18em]">
                  {initials || "U"}
                </span>
              )}
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-bold text-[#2E2C27]">{displayName}</p>
              <p className="truncate text-xs font-medium text-[#4E4B44]">
                {user.email}
              </p>
            </div>
          </div>

          <div className="p-2 space-y-0.5">
            {isAdmin ? (
              <a
                href={adminHref}
                className="flex min-h-11 w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[#2E2C27] transition-colors hover:bg-[#E6E3DC]"
              >
                <LayoutDashboard className="h-4 w-4 text-[#4F7FA8]" />
                {t("adminConsole")}
              </a>
            ) : null}
            <Link
              href={profileHref}
              className="flex min-h-11 w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[#2E2C27] transition-colors hover:bg-[#E6E3DC]"
            >
              <User className="h-4 w-4 text-[#4F7FA8]" />
              {t("profile")}
            </Link>
            <Link
              href={proposalsHref}
              className="flex min-h-11 w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[#2E2C27] transition-colors hover:bg-[#E6E3DC]"
            >
              <FileText className="h-4 w-4 text-[#4F7FA8]" />
              {t("proposals")}
            </Link>
            <Link
              href={supportHref}
              className="flex min-h-11 w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[#2E2C27] transition-colors hover:bg-[#E6E3DC]"
            >
              <LifeBuoy className="h-4 w-4 text-[#4F7FA8]" />
              {t("support")}
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-11 w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-medium text-[#B3261E] transition-colors hover:bg-[#F9DEDC]/50"
            >
              <LogOut className="h-4 w-4" />
              {t("signOut")}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={wrapperClassName}>
        <Popover open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("userMenuAriaLabel")}
              className={cn(
                "group inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9]/90 px-3.5 py-1.5 text-xs font-semibold text-[#2E2C27] shadow-xs backdrop-blur-xl transition-all duration-200 hover:bg-[#E6E3DC] hover:border-[#7CA8D0]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]",
                className,
              )}
            >
              <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[#CBC7BE] bg-[#DCE8F5] text-[#2E2C27]">
                {user?.user_metadata?.avatar_url ? (
                  <Image
                    src={user.user_metadata.avatar_url}
                    alt={displayName}
                    className="h-full w-full object-cover"
                    width={28}
                    height={28}
                  />
                ) : (
                  <span className="text-[10px] font-black tracking-[0.14em]">
                    {initials || "U"}
                  </span>
                )}
              </span>
              <span className="hidden text-xs font-semibold tracking-wide sm:block text-[#2E2C27]">
                {displayName}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-[#4E4B44] transition-transform duration-200",
                  isDropdownOpen && "rotate-180",
                )}
              />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            sideOffset={8}
            className={cn(
              "w-[19rem] overflow-hidden rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] p-0 text-[#2E2C27] shadow-xl backdrop-blur-2xl ring-1 ring-black/5",
              dropdownClassName,
            )}
          >
            <div className="border-b border-[#F7F6F3] bg-[#E6E3DC] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#4E4B44]">
                {t("signedInAs")}
              </p>
              <p className="mt-1.5 truncate text-sm font-bold text-[#2E2C27]">
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-xs font-medium text-[#4E4B44]">
                {user.email}
              </p>
            </div>

            <div className="p-2 space-y-0.5 border-b border-[#F7F6F3]">
              {isAdmin ? (
                <a
                  href={adminHref}
                  onClick={() => setIsDropdownOpen(false)}
                  className={accountMenuItemClass}
                >
                  <LayoutDashboard className={accountMenuIconClass} />
                  <span>{t("adminConsole")}</span>
                </a>
              ) : null}
              <Link
                href={profileHref}
                onClick={() => setIsDropdownOpen(false)}
                className={accountMenuItemClass}
              >
                <User className={accountMenuIconClass} />
                <span>{t("profile")}</span>
              </Link>
              <Link
                href={proposalsHref}
                onClick={() => setIsDropdownOpen(false)}
                className={accountMenuItemClass}
              >
                <FileText className={accountMenuIconClass} />
                <span>{t("proposals")}</span>
              </Link>
              <Link
                href={supportHref}
                onClick={() => setIsDropdownOpen(false)}
                className={accountMenuItemClass}
              >
                <LifeBuoy className={accountMenuIconClass} />
                <span>{t("support")}</span>
              </Link>
            </div>

            <div className="p-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="group/item flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-medium text-[#B3261E] transition-all duration-200 hover:bg-[#F9DEDC]/50"
              >
                <LogOut className="h-4 w-4 text-[#B3261E]" />
                <span>{t("signOut")}</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  const loginHref = `/${locale}/login`;

  if (presentation === "inline") {
    return (
      <Link
        href={loginHref}
        onClick={onNavigate}
        className={cn(
          "flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#A5C2DE] hover:shadow active:scale-95 cursor-pointer",
          className,
        )}
      >
        <User className="h-4 w-4 text-white" />
        <span>{t("signIn")}</span>
      </Link>
    );
  }

  return (
    <Link
      href={loginHref}
      onClick={onNavigate}
      aria-label={isGlassAppearance ? t("signIn") : undefined}
      className={cn(
        isGlassAppearance
          ? "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#DCE8F5]/80 px-4 py-2 text-xs font-semibold text-[#2E2C27] shadow-sm backdrop-blur-xl transition-all duration-200 hover:bg-[#DCE8F5] hover:shadow"
          : "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-[#B7D1EA] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#A5C2DE] hover:shadow active:scale-95 cursor-pointer",
        className,
      )}
    >
      <User className="h-3.5 w-3.5 text-current" aria-hidden="true" />
      <span className={isGlassAppearance ? "authSignInLabel" : undefined}>
        {t("signIn")}
      </span>
    </Link>
  );
}
