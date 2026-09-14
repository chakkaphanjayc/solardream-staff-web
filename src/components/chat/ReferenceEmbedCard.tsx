"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { FileText, Package, Layers, Wrench } from "@/components/ui/icons";

export interface ReferenceEmbedCardProps {
  referenceType: "QUOTATION" | "PRODUCT" | "BUNDLE" | "SAVED_BUILD" | "NONE";
  referenceId: string;
  title?: string;
  subtitle?: string;
}

export default function ReferenceEmbedCard({
  referenceType,
  referenceId,
  title,
  subtitle,
}: ReferenceEmbedCardProps) {
  const pathname = usePathname();
  const locale = useLocale();

  if (referenceType === "NONE" || !referenceId) {
    return null;
  }

  const isAdmin = pathname.includes("/admin");

  // Determine routing URL based on type and user role
  let href = "";
  if (referenceType === "QUOTATION") {
    href = isAdmin
      ? `/${locale}/admin/crm/${referenceId}`
      : `/${locale}/proposals?proposalId=${encodeURIComponent(referenceId)}`;
  } else if (referenceType === "PRODUCT") {
    href = `/${locale}/catalog/${referenceId}`;
  } else if (referenceType === "BUNDLE") {
    href = `/${locale}/catalog/bundles`;
  } else {
    href = `/${locale}/build`;
  }

  // Derive fallbacks for display
  const displayTitle =
    title ||
    (referenceType === "QUOTATION"
      ? "Quotation Document"
      : referenceType === "PRODUCT"
      ? "Product Specs"
      : referenceType === "BUNDLE"
      ? "Component Bundle"
      : "Saved Configuration");

  const displaySubtitle = subtitle || `ID: ${referenceId}`;

  // Soft icon wrapper mapping
  const renderIcon = () => {
    const iconClass = "w-5 h-5 text-[#4F7FA8]";
    switch (referenceType) {
      case "QUOTATION":
        return <FileText className={iconClass} />;
      case "PRODUCT":
        return <Package className={iconClass} />;
      case "BUNDLE":
        return <Layers className={iconClass} />;
      default:
        return <Wrench className={iconClass} />;
    }
  };

  return (
    <Link href={href} passHref>
      <div className="flex items-center gap-3 mt-2 p-2 rounded-xl border border-[#CBC7BE] bg-[#F7F6F3] text-[#1C1C1A] hover:shadow-md hover:border-[#7CA8D0] transition-all cursor-pointer w-[260px] text-left">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#DCE8F5] shrink-0">
          {renderIcon()}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-xs text-[#1C1C1A] truncate">
            {displayTitle}
          </span>
          <span className="text-[10px] text-[#4E4B44] truncate">
            {displaySubtitle}
          </span>
        </div>
      </div>
    </Link>
  );
}
