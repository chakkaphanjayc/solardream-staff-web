"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { gsap } from "gsap";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  FiArrowUpRight,
  FiChevronDown,
  FiGlobe,
  FiMenu,
  FiSearch,
  FiX,
} from "react-icons/fi";
import AuthButton from "@/components/layout/AuthButton";
import { SolarDepth } from "@/components/ui/solar-depth";
import {
  resolveHeaderNavigationUrl,
  type HeaderNavigationItem,
} from "@/lib/header-navigation";
import DesktopHeaderNavigation from "./desktop-header-navigation";
import { useSolarHomeOptional } from "./solar-home-context";
import styles from "./solar-home.module.css";

type FloatingNavbarProps = Readonly<{
  locale: string;
  navigationItems: readonly HeaderNavigationItem[];
  forumUrl: string;
  homeSectionLinks?: readonly (Readonly<{ id: string; label: string; href: string }>)[];
  extraActions?: ReactNode;
  includeHomeSections?: boolean;
  languageHref?: string;
  showDesignCta?: boolean;
  showAuth?: boolean;
  showTrackRequest?: boolean;
}>;

function navigationDomId(id: string) {
  return `solar-navigation-${id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export default function FloatingNavbar({
  locale,
  navigationItems,
  forumUrl,
  homeSectionLinks = [],
  extraActions,
  includeHomeSections = true,
  languageHref: languageHrefProp,
  showDesignCta = true,
  showAuth = true,
  showTrackRequest = true,
}: FloatingNavbarProps) {
  const isThai = locale === "th";
  const t = useTranslations("Navbar");
  const solarHome = useSolarHomeOptional();
  const solarSizeKwp = solarHome?.solarSizeKwp ?? 5;
  const prefersReducedMotion = useReducedMotion();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openMobileGroupId, setOpenMobileGroupId] = useState<string | null>(
    null,
  );
  const headerRef = useRef<HTMLElement | null>(null);
  const menuCloseTimerRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);

  const clearMenuCloseTimer = useCallback(() => {
    if (menuCloseTimerRef.current === null) return;
    window.clearTimeout(menuCloseTimerRef.current);
    menuCloseTimerRef.current = null;
  }, []);

  const openMenu = useCallback(
    (id: string) => {
      clearMenuCloseTimer();
      setOpenMenuId(id);
    },
    [clearMenuCloseTimer],
  );

  const toggleMenu = useCallback(
    (id: string) => {
      clearMenuCloseTimer();
      setOpenMenuId((current) => (current === id ? null : id));
    },
    [clearMenuCloseTimer],
  );

  const closeMenu = useCallback(() => {
    clearMenuCloseTimer();
    setOpenMenuId(null);
  }, [clearMenuCloseTimer]);

  const scheduleMenuClose = useCallback(() => {
    clearMenuCloseTimer();
    menuCloseTimerRef.current = window.setTimeout(() => {
      setOpenMenuId(null);
      menuCloseTimerRef.current = null;
    }, 520);
  }, [clearMenuCloseTimer]);

  useEffect(() => {
    return () => clearMenuCloseTimer();
  }, [clearMenuCloseTimer]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const previousScrollTop = lastScrollTopRef.current;
      const scrollingDown = scrollTop > previousScrollTop + 2;
      const scrollingUp = scrollTop < previousScrollTop - 2;

      if (scrollTop <= 24) {
        setIsScrolled(false);
        setIsCompact(false);
      } else {
        setIsScrolled(true);
        if (scrollingDown) setIsCompact(true);
        if (scrollingUp) setIsCompact(false);
      }

      lastScrollTopRef.current = scrollTop;
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const context = gsap.context(() => {
      const brand = header.querySelector<HTMLElement>("[data-header-brand]");
      const links = Array.from(
        header.querySelectorAll<HTMLElement>("[data-header-link]"),
      );
      const actions = Array.from(
        new Set([
          ...Array.from(
            header.querySelectorAll<HTMLElement>("[data-header-action]"),
          ),
          ...Array.from(
            header.querySelectorAll<HTMLElement>(`.${styles.navAuth}`),
          ),
        ]),
      );
      const targets = [brand, ...links, ...actions].filter(
        (target): target is HTMLElement => Boolean(target),
      );

      if (prefersReducedMotion !== false) {
        gsap.set(targets, { autoAlpha: 1, clearProps: "transform,filter" });
        return;
      }

      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
      });

      if (brand) {
        timeline.fromTo(
          brand,
          { autoAlpha: 0, y: -10, filter: "blur(8px)" },
          { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.55 },
        );
      }
      if (links.length > 0) {
        timeline.fromTo(
          links,
          { autoAlpha: 0, y: -7 },
          { autoAlpha: 1, y: 0, duration: 0.34, stagger: 0.045 },
          "-=0.28",
        );
      }
      if (actions.length > 0) {
        timeline.fromTo(
          actions,
          { autoAlpha: 0, y: -6 },
          { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.04 },
          "-=0.22",
        );
      }
    }, header);

    return () => context.revert();
  }, [prefersReducedMotion]);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const context = gsap.context(() => {
      const panels = gsap.utils.toArray<HTMLElement>("[data-nav-panel]");

      panels.forEach((panel) => {
        const isOpen = panel.dataset.open === "true";
        const panelItems = Array.from(
          panel.querySelectorAll<HTMLElement>("[data-nav-subitem]"),
        );

        gsap.killTweensOf([panel, ...panelItems]);
        if (!isOpen) {
          gsap.set([panel, ...panelItems], {
            clearProps: "opacity,visibility,transform",
          });
          return;
        }

        if (prefersReducedMotion !== false) {
          gsap.set([panel, ...panelItems], {
            autoAlpha: 1,
            clearProps: "transform",
          });
          return;
        }

        gsap.fromTo(
          panel,
          { autoAlpha: 0, y: -8, scale: 0.92, transformOrigin: "top center" },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.35,
            ease: "back.out(1.35)",
            overwrite: "auto",
          },
        );
        if (panelItems.length > 0) {
          gsap.fromTo(
            panelItems,
            { autoAlpha: 0, y: -4 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.22,
              stagger: 0.035,
              delay: 0.04,
              ease: "power2.out",
              overwrite: "auto",
            },
          );
        }
      });
    }, header);

    return () => context.revert();
  }, [openMenuId, prefersReducedMotion]);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || prefersReducedMotion !== false) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const targets = Array.from(
      header.querySelectorAll<HTMLElement>("[data-header-hover]"),
    );
    const cleanups = targets.map((target) => {
      const handleEnter = () => {
        gsap.to(target, {
          y: -2,
          duration: 0.2,
          ease: "power2.out",
          overwrite: "auto",
        });
      };
      const handleLeave = () => {
        gsap.to(target, {
          y: 0,
          duration: 0.24,
          ease: "power2.out",
          overwrite: "auto",
        });
      };

      target.addEventListener("pointerenter", handleEnter);
      target.addEventListener("pointerleave", handleLeave);
      return () => {
        target.removeEventListener("pointerenter", handleEnter);
        target.removeEventListener("pointerleave", handleLeave);
        gsap.killTweensOf(target);
        gsap.set(target, { clearProps: "transform" });
      };
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!openMenuId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMenu, openMenuId]);

  // Keep the header hierarchy owned by the navigation builder. The home page
  // used to append a synthetic in-page "Explore" menu, which made the header
  // look like it had two competing product paths.
  const headerNavigationItems: readonly HeaderNavigationItem[] =
    navigationItems;
  const hasProductItem = headerNavigationItems.some((item) =>
    /product|ผลิตภัณฑ์|สินค้า/i.test(`${item.id} ${item.label} ${item.url}`),
  );
  const visibleHomeSectionLinks = homeSectionLinks.filter(
    (item) => item.id !== "product" || !hasProductItem,
  );

  const renderMobileNavigation = () => (
    <>
      {visibleHomeSectionLinks.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={styles.mobileNavLink}
          data-header-link
          onClick={() => setMobileOpen(false)}
        >
          <span>{item.label}</span>
          <FiArrowUpRight aria-hidden="true" />
        </Link>
      ))}
      {showTrackRequest &&
      !headerNavigationItems.some((item) =>
        /track|ติดตาม/i.test(`${item.id} ${item.url} ${item.label}`),
      ) ? (
        <Link
          href={`/${locale}/track`}
          className={`${styles.mobileNavLink} ${styles.mobileNavTrackLink}`}
          data-header-link
          onClick={() => setMobileOpen(false)}
        >
          <span>{t("tracking.label")}</span>
          <FiArrowUpRight aria-hidden="true" />
        </Link>
      ) : null}
      {headerNavigationItems.map((item) => {
        const children = item.children ?? [];
        const itemHref = resolveHeaderNavigationUrl(
          item.url,
          locale,
          item.id === "forum" ? forumUrl : undefined,
        );

        if (children.length === 0) {
          return (
            <Link
              key={item.id}
              href={itemHref}
              className={styles.mobileNavLink}
              data-header-link
              onClick={() => setMobileOpen(false)}
            >
              <span>{item.label}</span>
              <FiArrowUpRight aria-hidden="true" />
            </Link>
          );
        }

        const isOpen = openMobileGroupId === item.id;
        const panelId = navigationDomId(`mobile-${item.id}`);

        return (
          <div key={item.id} className={styles.mobileNavGroup}>
            <button
              type="button"
              className={`${styles.mobileNavGroupTrigger} ${isOpen ? styles.mobileNavGroupTriggerOpen : ""}`}
              aria-expanded={isOpen}
              aria-controls={panelId}
              data-header-link
              onClick={() =>
                setOpenMobileGroupId((current) =>
                  current === item.id ? null : item.id,
                )
              }
            >
              <span>{item.label}</span>
              <FiChevronDown aria-hidden="true" />
            </button>
            {isOpen ? (
              <div id={panelId} className={styles.mobileNavChildren}>
                {children.map((child) => (
                  <Link
                    key={child.id}
                    href={resolveHeaderNavigationUrl(
                      child.url,
                      locale,
                      child.id === "forum" ? forumUrl : undefined,
                    )}
                    className={styles.mobileNavChild}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span>{child.label}</span>
                    <FiArrowUpRight aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );

  const ctaHref = `/${locale}/build?kw=${solarSizeKwp}`;
  const languageHref = languageHrefProp ?? (locale === "th" ? "/en" : "/th");

  return (
    <>
      <span
        data-solar-nav-sentinel
        aria-hidden="true"
        className={styles.navSentinel}
      />
      <header
        ref={headerRef}
      data-navbar-height="64"
        data-bagui="premium-glass-navbar"
        data-navigation-source="header-navigation-hierarchy-builder"
        className={`${styles.nav} backdrop-blur-2xl ${!includeHomeSections ? styles.navRoute : ""} ${isScrolled ? styles.navScrolled : ""} ${isCompact ? styles.navCompact : ""} ${mobileOpen ? styles.navOpen : ""}`}
      >
        <SolarDepth className={styles.navDepth} maxTilt={1.1} lift={0}>
          <div className={styles.navInner}>
            <Link
              href={`/${locale}`}
              className={styles.wordmark}
              aria-label="SolarDream home"
              data-header-brand
            >
              <span className={styles.wordmarkMark}>
                <Image
                  src="/asset/sd-logo.png"
                  alt=""
                  width={56}
                  height={56}
                  priority
                  className={styles.wordmarkLogo}
                />
              </span>
              <span className={styles.wordmarkText}>
                <Image
                  src="/asset/sd-text.png"
                  alt=""
                  width={880}
                  height={281}
                  priority
                  sizes="132px"
                  className={styles.wordmarkTextImage}
                />
              </span>
            </Link>

            <DesktopHeaderNavigation
              items={headerNavigationItems}
              homeSectionLinks={homeSectionLinks}
              locale={locale}
              forumUrl={forumUrl}
              isThai={isThai}
              openMenuId={openMenuId}
              onOpenMenu={openMenu}
              onToggleMenu={toggleMenu}
              onCloseMenu={closeMenu}
              onScheduleMenuClose={scheduleMenuClose}
            />

            <div className={styles.navActions}>
              <Link
                href={languageHref}
                className={styles.languageLink}
                aria-label={isThai ? "เปลี่ยนเป็นภาษาอังกฤษ" : "Switch to Thai"}
                data-header-action
                data-header-hover
              >
                <FiGlobe aria-hidden="true" />
                <span>{isThai ? "EN" : "TH"}</span>
              </Link>
              {showTrackRequest ? (
                <Link
                  href={`/${locale}/track`}
                  className={styles.navTrackButton}
                  aria-label={t("tracking.openAriaLabel")}
                  data-header-action
                  data-header-hover
                >
                  <FiSearch aria-hidden="true" />
                  <span>{t("tracking.label")}</span>
                </Link>
              ) : null}
              {extraActions ? (
                <div className={styles.navExtras}>{extraActions}</div>
              ) : null}
              {showDesignCta ? (
                <Link
                  href={ctaHref}
                  className={styles.navCta}
                  data-header-action
                  data-header-hover
                >
                  <span>{isThai ? "ออกแบบของฉัน" : "Design mine"}</span>
                  <FiArrowUpRight aria-hidden="true" />
                </Link>
              ) : null}
              {showAuth ? (
                <AuthButton
                  appearance="glass"
                  wrapperClassName={styles.navAuth}
                  className={styles.navAuthButton}
                  dropdownClassName={styles.authDropdown}
                />
              ) : null}
              <button
                type="button"
                className={styles.mobileMenuButton}
                data-header-action
                data-header-hover
                aria-expanded={mobileOpen}
                aria-controls="solar-mobile-navigation"
                aria-label={
                  mobileOpen
                    ? isThai
                      ? "ปิดเมนู"
                      : "Close menu"
                    : isThai
                      ? "เปิดเมนู"
                      : "Open menu"
                }
                onClick={() => {
                  setMobileOpen((current) => !current);
                  setOpenMenuId(null);
                }}
              >
                {mobileOpen ? (
                  <FiX aria-hidden="true" />
                ) : (
                  <FiMenu aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </SolarDepth>

        <AnimatePresence initial={false}>
          {mobileOpen ? (
            <motion.nav
              id="solar-mobile-navigation"
              initial={
                prefersReducedMotion !== false
                  ? false
                  : { opacity: 0, height: 0, y: -6 }
              }
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={
                prefersReducedMotion
                  ? undefined
                  : { opacity: 0, height: 0, y: -6 }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
              }
              className={styles.mobileMenu}
              aria-label={isThai ? "เมนูหลัก" : "Primary navigation"}
            >
              {renderMobileNavigation()}
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>
    </>
  );
}
