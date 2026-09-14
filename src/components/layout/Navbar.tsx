"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import FloatingNavbar from "@/components/home/floating-navbar";
import styles from "@/components/home/solar-home.module.css";
import { Bell, ShoppingCart } from "@/components/ui/icons";
import { useCartStore } from "@/store/useCartStore";
import { createClient } from "@/utils/supabase/client";
import {
  getUserNotifications,
  markNotificationAsRead,
} from "@/app/actions/userNotifications";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { isLocale } from "@/i18n/locales";
import type { HeaderNavigationItem } from "@/lib/header-navigation";

// The cart flow includes the lead form and its map picker. Keep it out of the
// shared navigation bundle until the cart is actually opened.
const CartDrawer = dynamic(() => import("./CartDrawer"), { ssr: false });

type UserNotificationItem = {
  id: string;
  title?: string | null;
  link?: string | null;
  message: string;
};

type NavbarProps = {
  forumUrl: string;
  navigationItems: readonly HeaderNavigationItem[];
};

function getAlternateLocalePath(
  pathname: string,
  currentLocale: string,
  nextLocale: string,
) {
  const segments = pathname.split("/");
  if (segments[1] === currentLocale || isLocale(segments[1])) {
    segments[1] = nextLocale;
    return segments.join("/") || `/${nextLocale}`;
  }

  return `/${nextLocale}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export default function Navbar({ forumUrl, navigationItems }: NavbarProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("Navbar");
  const cartItemCount = useCartStore((state) =>
    state.items.reduce((total, item) => total + item.quantity, 0),
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    undefined,
  );
  const [notifications, setNotifications] = useState<UserNotificationItem[]>(
    [],
  );
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  useEffect(() => {
    const secureAttribute =
      window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `solardream_forum_locale=${locale === "en" ? "en" : "th"}; Path=/; Max-Age=600; SameSite=Lax${secureAttribute}`;
  }, [locale]);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (mounted) setSessionUserId(session?.user?.id ?? null);
      } catch {
        if (mounted) setSessionUserId(null);
      }
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSessionUserId(session?.user?.id ?? null);
    });

    const handleCustomAuthChange = () => {
      void syncSession();
    };
    window.addEventListener("solardream:auth-changed", handleCustomAuthChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener(
        "solardream:auth-changed",
        handleCustomAuthChange,
      );
    };
  }, [supabase.auth]);

  useEffect(() => {
    let mounted = true;

    if (sessionUserId === undefined) {
      return () => {
        mounted = false;
      };
    }

    if (!sessionUserId) {
      const clearFrame = window.requestAnimationFrame(() => {
        if (!mounted) return;
        setNotifications([]);
        setNotificationsLoading(false);
      });
      return () => {
        mounted = false;
        window.cancelAnimationFrame(clearFrame);
      };
    }

    const loadingFrame = window.requestAnimationFrame(() => {
      if (mounted) setNotificationsLoading(true);
    });
    void getUserNotifications()
      .then((items) => {
        if (!mounted) return;
        setNotifications(
          Array.isArray(items) ? (items as UserNotificationItem[]) : [],
        );
      })
      .catch((error: unknown) => {
        if (mounted) {
          console.warn("Failed to load navigation notifications", error);
          setNotifications([]);
        }
      })
      .finally(() => {
        if (mounted) setNotificationsLoading(false);
      });

    return () => {
      mounted = false;
      window.cancelAnimationFrame(loadingFrame);
    };
  }, [sessionUserId]);

  const resolveNotificationHref = (link?: string | null) => {
    if (!link?.trim()) return null;
    const trimmed = link.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith(`/${locale}/`) || trimmed === `/${locale}`) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) return `/${locale}${trimmed}`;
    return `/${locale}/${trimmed.replace(/^\/+/, "")}`;
  };

  const markAsReadAndOpen = async (notification: UserNotificationItem) => {
    const previous = notifications;
    setNotifications((current) =>
      current.filter((item) => item.id !== notification.id),
    );

    const result = await markNotificationAsRead(notification.id);
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      result.error
    ) {
      setNotifications(previous);
      console.error(
        "Failed to mark navigation notification as read",
        result.error,
      );
      return;
    }

    setNotificationsOpen(false);
    const href = resolveNotificationHref(notification.link);
    if (href) router.push(href);
  };

  const languageHref = getAlternateLocalePath(
    pathname,
    locale,
    locale === "th" ? "en" : "th",
  );

  const extraActions = (
    <>
      <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={styles.navUtilityButton}
            data-header-action
            data-header-hover
            aria-label={t("notifications.openAriaLabel")}
          >
            <Bell aria-hidden="true" />
            {notifications.length > 0 ? (
              <span className={styles.navUtilityBadge}>
                {notifications.length}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className={styles.navUtilityPopover}
        >
          <div className={styles.navUtilityHeader}>
            <div>
              <p className={styles.navUtilityEyebrow}>
                {t("notifications.channel")}
              </p>
              <p className={styles.navUtilityTitle}>
                {t("notifications.title")}
              </p>
            </div>
            <span className={styles.navUtilityCount}>
              {notifications.length > 0
                ? t("notifications.unreadCount", {
                    count: notifications.length,
                  })
                : t("notifications.emptyStatus")}
            </span>
          </div>
          <div className={styles.navUtilityList}>
            {notificationsLoading ? (
              <p className={styles.navUtilityEmpty} role="status">
                {locale === "th" ? "กำลังโหลด..." : "Loading updates..."}
              </p>
            ) : notifications.length === 0 ? (
              <div className={styles.navUtilityEmpty}>
                <p>{t("notifications.emptyTitle")}</p>
                <span>{t("notifications.emptyDescription")}</span>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={styles.navUtilityItem}
                  onClick={() => void markAsReadAndOpen(notification)}
                >
                  <span>{notification.title || t("notifications.title")}</span>
                  <small>{notification.message}</small>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        className={styles.navUtilityButton}
        data-header-action
        data-header-hover
        aria-label={t("cart.openAriaLabel")}
        onClick={() => setCartOpen(true)}
      >
        <ShoppingCart aria-hidden="true" />
        {cartItemCount > 0 ? (
          <span className={styles.navUtilityBadge}>{cartItemCount}</span>
        ) : null}
      </button>
    </>
  );

  return (
    <>
      <FloatingNavbar
        locale={locale}
        navigationItems={navigationItems}
        forumUrl={forumUrl}
        extraActions={extraActions}
        includeHomeSections={false}
        languageHref={languageHref}
      />
      {cartOpen ? (
        <CartDrawer isOpen onClose={() => setCartOpen(false)} />
      ) : null}
    </>
  );
}
