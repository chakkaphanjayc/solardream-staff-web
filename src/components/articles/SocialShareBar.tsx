"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Share2, Copy, Check, MessageCircle, ExternalLink } from "@/components/ui/icons";

interface SocialShareBarProps {
  title: string;
  articleId: string;
  locale: string;
}

export default function SocialShareBar({ title, locale }: SocialShareBarProps) {
  const t = useTranslations("SocialShareBar");
  const [copied, setCopied] = useState(false);

  const getArticleUrl = () => {
    if (typeof window !== "undefined") {
      return window.location.href;
    }
    return `https://solardream.com/${locale}/news`;
  };

  const handleCopyLink = async () => {
    try {
      const url = getArticleUrl();
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("copiedSuccess"));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const shareToFacebook = () => {
    const url = encodeURIComponent(getArticleUrl());
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "width=600,height=400");
  };

  const shareToTwitter = () => {
    const url = encodeURIComponent(getArticleUrl());
    const text = encodeURIComponent(title);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank", "width=600,height=400");
  };

  const shareToLine = () => {
    const url = encodeURIComponent(getArticleUrl());
    window.open(`https://social-plugins.line.me/lineit/share?url=${url}`, "_blank", "width=600,height=500");
  };

  const shareToLinkedIn = () => {
    const url = encodeURIComponent(getArticleUrl());
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank", "width=600,height=500");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mr-2">
        <Share2 className="w-4 h-4 text-[#0369a1]" />
        <span>{t("shareArticle")}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* LINE */}
        <button
          type="button"
          onClick={shareToLine}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#06C755]/10 border border-[#06C755]/30 text-[#06C755] hover:bg-[#06C755]/20 text-xs font-bold transition-all cursor-pointer"
          title={t("shareTo", { network: "LINE" })}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>LINE</span>
        </button>

        {/* Facebook */}
        <button
          type="button"
          onClick={shareToFacebook}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#1877F2] hover:bg-[#1877F2]/20 text-xs font-bold transition-all cursor-pointer"
          title={t("shareTo", { network: "Facebook" })}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Facebook</span>
        </button>

        {/* X / Twitter */}
        <button
          type="button"
          onClick={shareToTwitter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/10 border border-slate-900/20 text-slate-900 hover:bg-slate-900/20 text-xs font-bold transition-all cursor-pointer"
          title={t("shareTo", { network: "X" })}
        >
          <span className="font-black text-xs">𝕏</span>
          <span>Twitter</span>
        </button>

        {/* LinkedIn */}
        <button
          type="button"
          onClick={shareToLinkedIn}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0A66C2]/10 border border-[#0A66C2]/30 text-[#0A66C2] hover:bg-[#0A66C2]/20 text-xs font-bold transition-all cursor-pointer"
          title={t("shareTo", { network: "LinkedIn" })}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>LinkedIn</span>
        </button>

        {/* Copy Link */}
        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all cursor-pointer"
          title={t("copyLink")}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in" />
              <span className="text-emerald-700">{t("copied")}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>{t("copyLink")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
