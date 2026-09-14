"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldCheck, Sparkles, Tag, X, Zap } from "@/components/ui/icons";
import { useLocale, useTranslations } from "next-intl";
import TextLoop from "@/components/ui/TextLoop";
import type { GlobalBannerTranslations } from "@/types/globalBanner";

export type GlobalBannerItem = {
  id: string;
  message: string;
  type?: string;
  linkUrl?: string | null;
  isActive?: boolean;
  badge?: string;
  translations?: GlobalBannerTranslations;
  sortOrder?: number;
};

export type GlobalBannerData = GlobalBannerItem | GlobalBannerItem[] | null;

type GlobalBannerProps = {
  initialData: GlobalBannerData;
};

const BANNER_DISMISSED_EVENT = "solardream:announcement-dismissed";

function subscribeToBannerDismissal(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(BANNER_DISMISSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(BANNER_DISMISSED_EVENT, onChange);
  };
}

function getBannerDismissedSnapshot() {
  try {
    return sessionStorage.getItem("solardream_announcement_dismissed") === "true";
  } catch {
    return false;
  }
}

function getServerBannerDismissedSnapshot() {
  return false;
}

const DEFAULT_ANNOUNCEMENTS: GlobalBannerItem[] = [
  {
    id: "default-1",
    message: "Special Offer: Save up to 20% on Residential Solar Rooftop Packages!",
    type: "PROMO",
    badge: "PROMO",
    linkUrl: "/build",
    isActive: true,
  },
  {
    id: "default-2",
    message: "Free Energy Audit & Engineering Site Survey available for all installations.",
    type: "INFO",
    badge: "FREE AUDIT",
    linkUrl: "/wizard",
    isActive: true,
  },
  {
    id: "default-3",
    message: "Clean Energy Financing options with 0% interest installment plans.",
    type: "NEW",
    badge: "FINANCING",
    linkUrl: "/proposals",
    isActive: true,
  },
  {
    id: "default-4",
    message: "Tier-1 N-Type Solar Panels backed by 25-year performance warranty.",
    type: "ALERT",
    badge: "25Y WARRANTY",
    linkUrl: "/products",
    isActive: true,
  },
];

function getBadgeStyle(type?: string, customBadge?: string) {
  if (customBadge) {
    return "border-[#7CA8D0]/30 bg-[#DCE8F5] text-[#4F7FA8]";
  }
  switch (type?.toUpperCase()) {
    case "WARNING":
    case "ALERT":
      return "border-[#B3261E]/30 bg-[#F9DEDC] text-[#B3261E]";
    case "PROMO":
    case "NEW":
      return "border-[#7CA8D0]/30 bg-[#DCE8F5] text-[#4F7FA8]";
    case "INFO":
    default:
      return "border-[#CBC7BE] bg-[#F0EEE9] text-[#2E2C27]";
  }
}

function getIcon(type?: string) {
  switch (type?.toUpperCase()) {
    case "WARNING":
      return AlertTriangle;
    case "PROMO":
      return Tag;
    case "NEW":
      return Zap;
    case "ALERT":
      return Sparkles;
    case "INFO":
    default:
      return ShieldCheck;
  }
}

export default function GlobalBanner({ initialData }: GlobalBannerProps) {
  const t = useTranslations("GlobalBanner");
  const locale = useLocale();
  const dismissed = useSyncExternalStore(
    subscribeToBannerDismissal,
    getBannerDismissedSnapshot,
    getServerBannerDismissedSnapshot,
  );

  if (dismissed) return null;

  // Standardize items into an array
  let rawItems: GlobalBannerItem[] = [];
  if (Array.isArray(initialData)) {
    rawItems = initialData.filter((item) => item.isActive !== false);
  } else if (initialData && typeof initialData === "object" && initialData.isActive !== false) {
    rawItems = [initialData];
  }

  const items = rawItems.length > 0 ? rawItems : DEFAULT_ANNOUNCEMENTS;

  const getLocalizedContent = (item: GlobalBannerItem) => {
    const localized = item.translations?.[locale]
      ?? item.translations?.[locale.split("-")[0]]
      ?? item.translations?.en;
    const message = localized?.message?.trim() || item.message;
    const linkUrl = localized?.linkUrl === undefined ? item.linkUrl : localized.linkUrl;

    return { message, linkUrl };
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem("solardream_announcement_dismissed", "true");
      window.dispatchEvent(new Event(BANNER_DISMISSED_EVENT));
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <div
      data-global-banner
      role="region"
      aria-label="Site announcement"
      className="relative z-40 h-10 w-full overflow-hidden border-b border-[#F7F6F3] bg-[#E6E3DC]/95 text-[#2E2C27] backdrop-blur-md"
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-3 text-xs sm:px-6">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden px-1 text-center sm:gap-3">
          {/* Animated TextLoop */}
          <TextLoop interval={4} pauseOnHover={true} className="min-w-0 max-w-full">
            {items.map((item) => {
              const Icon = getIcon(item.type);
              const badgeLabel = item.badge || item.type || "ANNOUNCEMENT";
              const badgeStyle = getBadgeStyle(item.type, item.badge);
              const localizedContent = getLocalizedContent(item);

              const content = (
                <span className="inline-flex max-w-full items-center gap-2 truncate py-0.5">
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${badgeStyle}`}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    {badgeLabel}
                  </span>

                  <span className="truncate font-medium tracking-[0.01em] text-[#2E2C27] transition-colors hover:text-[#3E6685]">
                    {localizedContent.message}
                  </span>

                  {localizedContent.linkUrl && (
                    <span className="ml-1 inline-flex shrink-0 items-center gap-1 font-semibold text-[#4F7FA8] underline decoration-[#B7D1EA]/60 underline-offset-4 transition-colors hover:text-[#A5C2DE]">
                      <span>{t("learnMore")}</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </span>
              );

              if (localizedContent.linkUrl) {
                return (
                  <Link
                    key={item.id}
                    href={localizedContent.linkUrl}
                    className="inline-flex max-w-full truncate items-center group"
                  >
                    {content}
                  </Link>
                );
              }

              return <span key={item.id} className="inline-flex max-w-full truncate items-center">{content}</span>;
            })}
          </TextLoop>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          type="button"
          aria-label="Close announcement banner"
          className="ml-2 inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-[#4E4B44] transition-colors hover:bg-[#A5C2DE]/10 hover:text-[#2E2C27] focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:ring-offset-1 focus:ring-offset-[#E6E3DC]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
