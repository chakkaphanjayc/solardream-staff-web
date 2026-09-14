"use client";

import { GsapPulse } from "@/components/ui/GsapMotion";
import { useTranslations } from "next-intl";

interface LiveSerpPreviewProps {
  title: string;
  description: string;
  url: string;
}

export default function LiveSerpPreview({ title, description, url }: LiveSerpPreviewProps) {
  const t = useTranslations("LiveSerpPreview");
  // Truncation helper
  const truncate = (str: string, maxLength: number) => {
    if (!str) return "";
    return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
  };

  const displayUrl = url || t("exampleUrl");
  const displayTitle = (title || "").trim() || t("exampleTitle");
  const displayDescription = (description || "").trim() || t("exampleDescription");
  
  return (
    <div className="bg-[#0B1121] border border-[#1E293B] rounded-2xl p-5 shadow-none space-y-2 max-w-xl font-sans text-left">
      <div className="flex items-center justify-between border-b border-[#1E293B] pb-2 mb-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{t("title")}</span>
        <GsapPulse className="h-2.5 w-2.5 rounded-full bg-emerald-500" scale={1.2}>
          <span />
        </GsapPulse>
      </div>

      <div className="space-y-0.5">
        {/* Google Breadcrumb URL */}
        <div className="text-[13px] text-[#202124] truncate flex items-center gap-1 font-normal">
          <span>{displayUrl}</span>
          <span className="text-[9px] text-gray-500">▼</span>
        </div>

        {/* Google Title */}
        <h3 className="text-lg text-[#1a0dab] hover:underline cursor-pointer leading-tight font-medium">
          {truncate(displayTitle, 60)}
        </h3>

        {/* Google Description */}
        <p className="text-[14px] text-[#4d5156] leading-relaxed font-normal line-clamp-2">
          {truncate(displayDescription, 155)}
        </p>
      </div>

      <div className="flex items-center gap-4 pt-3 text-[10px] text-gray-500 font-semibold border-t border-[#1E293B]">
        <span>
          {t("titleLabel")}:{" "}
          <strong className={displayTitle.length > 60 ? "text-rose-500" : "text-emerald-600"}>
            {displayTitle.length}
          </strong>{" "}
          {t("characters", { count: 60 })}
        </span>
        <span>·</span>
        <span>
          {t("descriptionLabel")}:{" "}
          <strong className={displayDescription.length > 155 ? "text-rose-500" : "text-emerald-600"}>
            {displayDescription.length}
          </strong>{" "}
          {t("characters", { count: 155 })}
        </span>
      </div>
    </div>
  );
}
