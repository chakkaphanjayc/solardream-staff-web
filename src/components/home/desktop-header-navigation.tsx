"use client";

import Link from "next/link";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import {
  resolveHeaderNavigationUrl,
  type HeaderNavigationItem,
} from "@/lib/header-navigation";
import styles from "./solar-home.module.css";

type DesktopHeaderNavigationProps = Readonly<{
  items: readonly HeaderNavigationItem[];
  homeSectionLinks?: readonly (Readonly<{ id: string; label: string; href: string }>)[];
  locale: string;
  forumUrl: string;
  isThai: boolean;
  openMenuId: string | null;
  onOpenMenu: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  onScheduleMenuClose: () => void;
}>;

function navigationDomId(id: string) {
  return `solar-navigation-${id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export default function DesktopHeaderNavigation({
  items,
  homeSectionLinks = [],
  locale,
  forumUrl,
  isThai,
  openMenuId,
  onOpenMenu,
  onToggleMenu,
  onCloseMenu,
  onScheduleMenuClose,
}: DesktopHeaderNavigationProps) {
  const hasProductItem = items.some((item) => /product|ผลิตภัณฑ์|สินค้า/i.test(`${item.id} ${item.label} ${item.url}`));
  const visibleHomeSectionLinks = homeSectionLinks.filter(
    (item) => item.id !== "product" || !hasProductItem,
  );

  return (
    <nav
      className={styles.navLinks}
      aria-label={isThai ? "เมนูหลัก" : "Primary navigation"}
      onPointerLeave={(event) => {
        const relatedTarget = event.relatedTarget;
        if (
          relatedTarget instanceof Node &&
          event.currentTarget.contains(relatedTarget)
        ) {
          return;
        }
        onScheduleMenuClose();
      }}
      onBlur={(event) => {
        const relatedTarget = event.relatedTarget;
        if (
          !(relatedTarget instanceof Node) ||
          !event.currentTarget.contains(relatedTarget)
        ) {
          onCloseMenu();
        }
      }}
    >
      {visibleHomeSectionLinks.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={styles.navLink}
          data-header-link
          data-header-hover
        >
          {item.label}
        </Link>
      ))}
      {items.map((item) => {
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
              className={styles.navLink}
              data-header-link
              data-header-hover
            >
              {item.label}
            </Link>
          );
        }

        const isOpen = openMenuId === item.id;
        const panelId = navigationDomId(item.id);

        return (
          <div
            key={item.id}
            className={`${styles.navMenu} ${isOpen ? styles.navMenuOpen : ""}`}
            onPointerEnter={() => onOpenMenu(item.id)}
            onFocus={() => onOpenMenu(item.id)}
            onPointerLeave={(event) => {
              const relatedTarget = event.relatedTarget;
              if (
                relatedTarget instanceof Node &&
                event.currentTarget.contains(relatedTarget)
              ) {
                return;
              }
              onScheduleMenuClose();
            }}
          >
            {item.url !== "#" ? (
              <div className={styles.navMenuTriggerRow}>
                <Link
                  href={itemHref}
                  className={styles.navMenuLink}
                  data-header-link
                  data-header-hover
                >
                  {item.label}
                </Link>
                <button
                  type="button"
                  className={styles.navMenuToggle}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={
                    isThai
                      ? `เปิดเมนู ${item.label}`
                      : `Open ${item.label} menu`
                  }
                  data-header-action
                  data-header-hover
                  onFocus={() => onOpenMenu(item.id)}
                  onClick={() => onToggleMenu(item.id)}
                >
                  <FiChevronDown
                    className={styles.navMenuChevron}
                    aria-hidden="true"
                  />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.navMenuTrigger}
                aria-expanded={isOpen}
                aria-controls={panelId}
                data-header-link
                data-header-hover
                onFocus={() => onOpenMenu(item.id)}
                onClick={() => onToggleMenu(item.id)}
              >
                <span>{item.label}</span>
                <FiChevronDown
                  className={styles.navMenuChevron}
                  aria-hidden="true"
                />
              </button>
            )}

            <div
              id={panelId}
              className={styles.navSubmenu}
              data-nav-panel
              data-open={isOpen}
              aria-hidden={!isOpen}
              onPointerEnter={() => onOpenMenu(item.id)}
              onPointerMove={() => onOpenMenu(item.id)}
              onPointerLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (
                  relatedTarget instanceof Node &&
                  event.currentTarget.contains(relatedTarget)
                ) {
                  return;
                }
                onScheduleMenuClose();
              }}
            >
              <span className={styles.navSubmenuEyebrow}>
                {isThai ? "เลือกเส้นทาง" : "Choose a path"}
              </span>
              {children.map((child) => (
                <Link
                  key={child.id}
                  href={resolveHeaderNavigationUrl(
                    child.url,
                    locale,
                    child.id === "forum" ? forumUrl : undefined,
                  )}
                  className={styles.navSubmenuItem}
                  data-nav-subitem
                  data-header-hover
                  onClick={onCloseMenu}
                >
                  <span>{child.label}</span>
                  <FiChevronRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
