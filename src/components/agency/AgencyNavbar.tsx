"use client";

import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "@/components/ui/icons";
import { gsap } from "gsap";
import { usePathname } from "next/navigation";
import AuthButton from "@/components/layout/AuthButton";
import CurrencySwitcher from "@/components/CurrencySwitcher";
import { cn } from "@/lib/utils";
import { isLocale, locales } from "@/i18n/locales";
import { useSupportedLocales } from "@/components/providers/SupportedLocalesProvider";

type NavItem = Readonly<{
  label: string;
  href: string;
  featured: boolean;
}>;

function useWeatherTheme() {
  const [weather, setWeather] = useState<string>("sunny");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const current = document.documentElement.getAttribute("data-weather") || "sunny";
    const initialFrame = window.requestAnimationFrame(() => setWeather(current));

    const observer = new MutationObserver(() => {
      const val = document.documentElement.getAttribute("data-weather") || "sunny";
      setWeather(val);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-weather"],
    });

    return () => {
      window.cancelAnimationFrame(initialFrame);
      observer.disconnect();
    };
  }, []);

  const isDark = weather === "night" || weather === "rainy";
  return { weather, isDark };
}

export default function AgencyNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuBackdropRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const locale = useLocale();
  const t = useTranslations("AgencyNavbar");
  const pathname = usePathname();
  const supportedLocales = useSupportedLocales();
  const basePath = `/${locale}`;
  const availableLocales = supportedLocales.length > 0 ? supportedLocales : locales;
  const currentLocaleIndex = availableLocales.indexOf(isLocale(locale) ? locale : "th");
  const nextLocale = availableLocales[(currentLocaleIndex + 1) % availableLocales.length];
  const pathParts = pathname.split("/").filter(Boolean);
  const pathWithoutLocale = isLocale(pathParts[0])
    ? pathParts.slice(1).join("/")
    : pathParts.join("/");
  const languageHref = `/${nextLocale}${pathWithoutLocale ? `/${pathWithoutLocale}` : ""}`;

  const { isDark: isDarkTheme } = useWeatherTheme();

  const navItems: readonly NavItem[] = [
    { label: t("home"), href: basePath, featured: false },
    { label: t("services"), href: `${basePath}/services`, featured: true },
    { label: t("build"), href: `${basePath}/build`, featured: true },
    { label: t("wizard"), href: `${basePath}/wizard`, featured: true },
    { label: t("news"), href: `${basePath}/news`, featured: false },
    { label: t("forum"), href: `${basePath}/forum`, featured: false },
  ];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMenuOpen(false);
      setIsScrolled(false);
      if (headerRef.current) {
        gsap.to(headerRef.current, {
          yPercent: 0,
          duration: 0.3,
          ease: "expo.out",
          overwrite: "auto",
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const cinematicRoot = document.querySelector<HTMLElement>("[data-cinematic-scroll-root]");
    const previousCinematicOverflow = cinematicRoot?.style.overflow;
    document.body.style.overflow = "hidden";
    if (cinematicRoot) cinematicRoot.style.overflow = "hidden";

    const panel = menuPanelRef.current;
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    window.requestAnimationFrame(() => {
      panel?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && panel) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!first || !last) {
          event.preventDefault();
          panel.focus();
          return;
        }

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (event.key !== "Escape") return;

      event.preventDefault();
      setMenuOpen(false);
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      if (cinematicRoot) cinematicRoot.style.overflow = previousCinematicOverflow ?? "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerFine = window.matchMedia("(pointer: fine)").matches;
    const navTargets = Array.from(header.querySelectorAll<HTMLElement>("[data-anime-nav-item]"));
    const hoverTargets = Array.from(header.querySelectorAll<HTMLElement>("[data-anime-hover]"));

    const context = gsap.context(() => {
      if (prefersReducedMotion) {
        gsap.set([header, ...navTargets], { clearProps: "all" });
        return;
      }

      gsap.timeline()
        .fromTo(header, { y: -100 }, { y: 0, duration: 0.7, ease: "expo.out" })
        .fromTo(
          navTargets,
          { opacity: 0, scale: 0.96 },
          { opacity: 1, scale: 1, duration: 0.5, stagger: 0.05, ease: "expo.out" },
          "-=0.38",
        );
    }, header);

    const hoverCleanups = pointerFine && !prefersReducedMotion
      ? hoverTargets.map((target) => {
          const handleEnter = () => {
            gsap.to(target, {
              scale: 1.05,
              borderColor: isDarkTheme ? "rgba(255, 255, 255, 0.45)" : "rgba(15, 23, 42, 0.28)",
              duration: 0.3,
              ease: "expo.out",
              overwrite: "auto",
            });
          };
          const handleLeave = () => {
            gsap.to(target, {
              scale: 1,
              borderColor: isDarkTheme ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.1)",
              duration: 0.3,
              ease: "expo.out",
              overwrite: "auto",
            });
          };

          target.addEventListener("pointerenter", handleEnter);
          target.addEventListener("pointerleave", handleLeave);
          return () => {
            target.removeEventListener("pointerenter", handleEnter);
            target.removeEventListener("pointerleave", handleLeave);
            gsap.killTweensOf(target);
            gsap.set(target, { clearProps: "transform,borderColor" });
          };
        })
      : [];

    return () => {
      hoverCleanups.forEach((cleanup) => cleanup());
      context.revert();
    };
  }, [isDarkTheme]);

  useEffect(() => {
    const cinematicRoot = document.querySelector<HTMLElement>("[data-cinematic-scroll-root]");
    const scrollTarget = cinematicRoot ?? window;

    let lastScrollTop = 0;
    let isHidden = false;

    const handleScroll = () => {
      const offset = scrollTarget instanceof HTMLElement ? scrollTarget.scrollTop : window.scrollY;

      const scrolled = offset > 80;
      setIsScrolled(scrolled);

      if (scrolled) {
        if (offset > lastScrollTop && !isHidden) {
          isHidden = true;
          gsap.to(headerRef.current, {
            yPercent: -100,
            duration: 0.5,
            ease: "expo.inOut",
            overwrite: "auto",
          });
        } else if (offset < lastScrollTop && isHidden) {
          isHidden = false;
          gsap.to(headerRef.current, {
            yPercent: 0,
            duration: 0.5,
            ease: "expo.out",
            overwrite: "auto",
          });
        }
      } else {
        if (isHidden) {
          isHidden = false;
          gsap.to(headerRef.current, {
            yPercent: 0,
            duration: 0.5,
            ease: "expo.out",
            overwrite: "auto",
          });
        }
      }

      lastScrollTop = Math.max(0, offset);
    };

    handleScroll();

    if (scrollTarget === window) {
      window.addEventListener("scroll", handleScroll, { passive: true });
    } else {
      scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    }

    return () => {
      if (scrollTarget === window) {
        window.removeEventListener("scroll", handleScroll);
      } else {
        scrollTarget.removeEventListener("scroll", handleScroll);
      }
    };
  }, [pathname]);

  useEffect(() => {
    const backdrop = menuBackdropRef.current;
    const panel = menuPanelRef.current;
    if (!menuOpen || !backdrop || !panel) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.fromTo(
        backdrop,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: prefersReducedMotion ? 0.08 : 0.5,
          ease: prefersReducedMotion ? "none" : "expo.out",
        },
      );
      gsap.fromTo(
        panel,
        {
          autoAlpha: 0,
          y: prefersReducedMotion ? 0 : -10,
          scale: prefersReducedMotion ? 1 : 0.985,
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: prefersReducedMotion ? 0.08 : 0.5,
          ease: prefersReducedMotion ? "none" : "expo.out",
        },
      );
    }, backdrop);

    return () => context.revert();
  }, [menuOpen]);

  return (
    <header
      ref={headerRef}
      className={cn(
        "premium-glass-header sticky inset-x-0 top-0 h-[72px] w-full",
        menuOpen ? "z-[80]" : "z-50",
        isScrolled && "premium-glass-header--scrolled",
      )}
    >
      <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link
          href={basePath}
          className="flex items-center gap-2.5 active:scale-[0.98]"
          aria-label={t("logoAriaLabel")}
          data-anime-nav-item
          data-anime-hover
        >
          <NextImage
            src="/asset/sd-text.png"
            alt="SolarDream logo"
            width={3919}
            height={1253}
            priority
            sizes="(min-width: 640px) 138px, 114px"
            className="h-9 w-auto object-contain sm:h-11"
          />
          <span className={cn(
            "font-sans font-black tracking-tight text-2xl transition-colors duration-300 ease-expo-out",
            isDarkTheme ? "text-white" : "text-slate-900"
          )}>
            SolarDream
          </span>
        </Link>

        <div className="hidden items-center gap-6 xl:flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== basePath && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                data-anime-nav-item
                data-anime-hover
                className={cn(
                  "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#B7D1EA] transition-all duration-300 ease-expo-out text-sm px-1 pt-3 pb-2.5",
                  isDarkTheme ? "text-white" : "text-slate-900",
                  isActive
                    ? "font-extrabold opacity-100"
                    : "font-medium opacity-100 hover:opacity-70"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          <Link
            href={languageHref}
            className={cn(
              "premium-glass-interactive inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold uppercase transition-colors duration-300 ease-expo-out",
              isDarkTheme ? "text-slate-100 hover:text-white" : "text-slate-700 hover:text-slate-950"
            )}
            aria-label={t("switchLanguageAriaLabel", { locale: nextLocale.toUpperCase() })}
            data-anime-nav-item
            data-anime-hover
          >
            <Globe className="h-4 w-4 text-[#B7D1EA]" />
            {nextLocale.toUpperCase()}
          </Link>
          <CurrencySwitcher />
          <div data-anime-nav-item data-anime-hover>
            <AuthButton className="premium-glass-dark px-6 py-2 text-sm font-medium normal-case tracking-normal text-white hover:text-white" />
          </div>
        </div>

        <button
          ref={menuTriggerRef}
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className={cn(
            "premium-glass-interactive inline-flex h-11 w-11 items-center justify-center rounded-xl active:scale-95 xl:hidden transition-colors duration-300 ease-expo-out",
            isDarkTheme ? "text-white" : "text-slate-900"
          )}
          aria-label={menuOpen ? t("closeMenuAriaLabel") : t("openMenuAriaLabel")}
          aria-expanded={menuOpen}
          aria-controls="agency-mobile-menu"
          data-anime-nav-item
        >
          <span className="relative h-3.5 w-4">
            <span
              className={[
                "absolute left-0 top-0 h-px w-4 bg-current transition-transform duration-300 ease-expo-out",
                menuOpen ? "translate-y-[6px] rotate-45" : "",
              ].join(" ")}
            />
            <span
              className={[
                "absolute bottom-0 left-0 h-px w-4 bg-current transition-transform duration-300 ease-expo-out",
                menuOpen ? "-translate-y-[7px] -rotate-45" : "",
              ].join(" ")}
            />
          </span>
        </button>
      </nav>

      {menuOpen ? (
          <div
            ref={menuBackdropRef}
            id="agency-mobile-menu"
            className="fixed inset-x-0 top-[72px] z-40 h-[calc(100dvh-72px)] bg-black/28 backdrop-blur-sm xl:hidden"
            onClick={() => {
              setMenuOpen(false);
              window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t("openMenuAriaLabel")}
          >
            <div
              ref={menuPanelRef}
              className={cn(
                "premium-glass manga-dots mx-3 mt-3 max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-2xl p-4",
                "sd-safe-pb-4-add",
                isDarkTheme ? "bg-slate-900/90 text-white border-white/10" : "bg-white/90 text-slate-900 border-slate-200/50"
              )}
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="grid gap-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href || (item.href !== basePath && pathname.startsWith(`${item.href}/`));
                  const mobileLinkClass = isDarkTheme
                    ? "text-slate-100 hover:bg-white/10 hover:text-white"
                    : "text-slate-950 hover:bg-slate-900/5 hover:text-slate-950";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-12 items-center rounded-xl px-4 py-3.5 text-[1.05rem] font-extrabold transition-colors active:scale-[0.99]",
                        item.featured
                          ? isDarkTheme
                            ? "bg-white/15 border border-white/20 text-white"
                            : "bg-slate-900/5 border border-slate-900/10 text-slate-800"
                          : isActive
                            ? isDarkTheme
                              ? "bg-white/10 text-white"
                              : "bg-[#B7D1EA]/24 text-slate-900"
                            : mobileLinkClass,
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3">
                <Link
                  href={languageHref}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "premium-glass-interactive inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black uppercase active:scale-[0.99] transition-colors duration-300 ease-expo-out",
                    isDarkTheme ? "text-slate-100 hover:text-white" : "text-slate-700 hover:text-slate-950"
                  )}
                >
                  <Globe className="h-4 w-4 text-[#B7D1EA]" />
                  {nextLocale.toUpperCase()}
                </Link>

                <AuthButton
                  presentation="inline"
                  wrapperClassName="w-full"
                  className="premium-glass-dark min-h-12 w-full justify-center py-3.5 text-white hover:text-white active:scale-[0.99]"
                />
              </div>
            </div>
          </div>
        ) : null}
    </header>
  );
}
