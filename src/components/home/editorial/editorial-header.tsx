"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowUpRight, FiChevronDown, FiMenu, FiX } from "react-icons/fi";
import { gsap } from "gsap";

import AuthButton from "@/components/layout/AuthButton";
import { resolveHeaderNavigationUrl, type HeaderNavigationItem } from "@/lib/header-navigation";

import styles from "./solar-editorial-home.module.css";

type EditorialHeaderProps = Readonly<{
  locale: string;
  companyName: string;
  navigationItems: readonly HeaderNavigationItem[];
  forumUrl: string;
  hasProjects: boolean;
  labels: Readonly<{
    menu: string;
    openMenuAria: string;
    closeMenuAria: string;
    primaryCta: string;
    secondaryCta: string;
    navigation: string;
    concept?: string;
    projects: string;
    solutions: string;
    calculator: string;
    about: string;
    track: string;
    language: string;
    ecoBadge: string;
  }>;
}>;

type HeaderLink = Readonly<{ id: string; label: string; href: string }>;

function isExternalUrl(value: string) {
  return /^(https?:|mailto:|tel:)/i.test(value);
}

function groupId(value: string) {
  return `editorial-nav-group-${value.replace(/[^a-z0-9_-]/gi, "-")}`;
}

export default function EditorialHeader({
  locale,
  companyName,
  navigationItems,
  forumUrl,
  hasProjects,
  labels,
}: EditorialHeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Readonly<Record<string, boolean>>>({});
  const reduceMotion = useReducedMotion() ?? false;
  const isThai = locale === "th";

  const coreLinks = useMemo<readonly HeaderLink[]>(
    () => [
      { id: "solutions", label: labels.solutions, href: "#solutions" },
      { id: "calculator", label: labels.calculator, href: "#calculator" },
      ...(hasProjects ? [{ id: "projects", label: labels.projects, href: "#projects" }] : []),
      { id: "about", label: labels.about, href: "#about" },
    ],
    [hasProjects, labels.about, labels.calculator, labels.projects, labels.solutions],
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = window.scrollY > 50;
      setIsScrolled((current) => (current === next ? current : next));
    };
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || prefersReducedMotion) {
      gsap.set(header, { clearProps: "paddingTop,paddingBottom,backdropFilter,boxShadow" });
      return;
    }

    gsap.to(header, {
      paddingTop: isScrolled ? 8 : 16,
      paddingBottom: isScrolled ? 8 : 16,
      backdropFilter: isScrolled ? "blur(24px) saturate(1.35)" : "blur(16px) saturate(1.1)",
      boxShadow: isScrolled ? "0 10px 28px rgb(24 24 20 / 0.08)" : "0 0 0 rgb(24 24 20 / 0)",
      duration: 0.36,
      ease: "power3.out",
      overwrite: "auto",
    });

    return () => {
      gsap.killTweensOf(header);
    };
  }, [isScrolled, reduceMotion]);

  const renderLink = (link: HeaderLink, className?: string) => {
    const external = isExternalUrl(link.href);
    return (
      <Dialog.Close asChild key={link.id}>
        <Link
          className={className}
          href={link.href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          <span>{link.label}</span>
          <FiArrowUpRight aria-hidden="true" />
        </Link>
      </Dialog.Close>
    );
  };

  return (
    <header
      ref={headerRef}
      className={`${styles.header} ${isScrolled ? styles.headerScrolled : ""}`}
    >
      <div className={styles.headerBrand}>
        <Link className={styles.wordmark} href={`/${locale}`}>
          {companyName}
        </Link>
        <span className={styles.ecoBadge}>
          <span aria-hidden="true" />
          {labels.ecoBadge}
        </span>
      </div>

      <nav className={styles.desktopNavigation} aria-label={labels.navigation}>
        {coreLinks.map((link) => <Link href={link.href} key={link.id}>{link.label}</Link>)}
      </nav>

      <div className={styles.headerActions}>
        <div className={styles.languageSwitch} aria-label={labels.language}>
          <Link className={!isThai ? styles.languageActive : ""} href="/en">EN</Link>
          <span aria-hidden="true">|</span>
          <Link className={isThai ? styles.languageActive : ""} href="/th">TH</Link>
        </div>
        <Link className={styles.headerPrimary} href={`/${locale}/wizard`}>{labels.primaryCta}</Link>
        <Link className={styles.headerSecondary} href={`/${locale}/build`}>{labels.secondaryCta}</Link>

        <Dialog.Root
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setExpandedGroups({});
          }}
        >
          <Dialog.Trigger asChild>
            <button className={styles.menuButton} type="button" aria-label={labels.openMenuAria}>
              <span>{labels.menu}</span>
              <FiMenu aria-hidden="true" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.navOverlay} />
            <Dialog.Content className={styles.navPanel} aria-describedby={undefined}>
              <div className={styles.navTop}>
                <Dialog.Title>{companyName}</Dialog.Title>
                <Dialog.Close className={styles.closeButton} aria-label={labels.closeMenuAria}>
                  <FiX aria-hidden="true" />
                </Dialog.Close>
              </div>

              <div className={styles.navBody}>
                <div className={styles.mobilePrimaryActions}>
                  <Dialog.Close asChild><Link href={`/${locale}/wizard`}>{labels.primaryCta}</Link></Dialog.Close>
                  <Dialog.Close asChild><Link href={`/${locale}/build`}>{labels.secondaryCta}</Link></Dialog.Close>
                </div>

                <nav className={styles.drawerCoreLinks} aria-label={labels.navigation}>
                  {coreLinks.map((link) => renderLink(link, styles.drawerCoreLink))}
                </nav>

                {navigationItems.length > 0 ? (
                  <nav className={styles.drawerConfiguredLinks} aria-label={labels.navigation}>
                    {navigationItems.map((item, index) => {
                      const children = item.children ?? [];
                      const href = item.id === "forum"
                        ? forumUrl || resolveHeaderNavigationUrl(item.url, locale, forumUrl)
                        : resolveHeaderNavigationUrl(item.url, locale, forumUrl);
                      if (!children.length) {
                        return renderLink(
                          { id: item.id, label: item.label, href },
                          styles.drawerConfiguredLink,
                        );
                      }

                      const id = groupId(item.id);
                      const expanded = Boolean(expandedGroups[item.id]);
                      return (
                        <div className={styles.drawerGroup} key={item.id}>
                          <button
                            className={styles.drawerGroupTrigger}
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={id}
                            onClick={() => setExpandedGroups((current) => ({ ...current, [item.id]: !expanded }))}
                          >
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <strong>{item.label}</strong>
                            <FiChevronDown aria-hidden="true" className={expanded ? styles.chevronExpanded : ""} />
                          </button>
                          <AnimatePresence initial={false}>
                            {expanded ? (
                              <motion.div
                                id={id}
                                className={styles.drawerGroupChildren}
                                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                                transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
                              >
                                {children.map((child) => renderLink({
                                  id: child.id,
                                  label: child.label,
                                  href: child.id === "forum"
                                    ? forumUrl || resolveHeaderNavigationUrl(child.url, locale, forumUrl)
                                    : resolveHeaderNavigationUrl(child.url, locale, forumUrl),
                                }, styles.drawerChildLink))}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </nav>
                ) : null}

                <div className={styles.navActions}>
                  <div className={styles.drawerLanguage}>
                    <span>{labels.language}</span>
                    <div className={styles.drawerLanguageLinks}>
                      <Dialog.Close asChild><Link className={!isThai ? styles.languageActive : ""} href="/en">EN</Link></Dialog.Close>
                      <Dialog.Close asChild><Link className={isThai ? styles.languageActive : ""} href="/th">TH</Link></Dialog.Close>
                    </div>
                  </div>
                  <Dialog.Close asChild><Link href={`/${locale}/track`}>{labels.track}</Link></Dialog.Close>
                  <AuthButton presentation="inline" wrapperClassName={styles.authBlock} />
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
