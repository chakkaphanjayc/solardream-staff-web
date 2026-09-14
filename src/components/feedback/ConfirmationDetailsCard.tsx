"use client";

import { useState } from "react";
import { Clipboard, Check, Star, Loader2, CheckCircle2 } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { isUuidLike, deriveQuotationTrackingReference } from "@/lib/trackingReference";

interface ConfirmationDetailsCardProps {
  referenceId: string;
  source: "wizard" | "build" | "services";
  locale?: string;
}

export default function ConfirmationDetailsCard({
  referenceId,
  source,
  locale = "en",
}: ConfirmationDetailsCardProps) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const displayedReference = isUuidLike(referenceId)
    ? deriveQuotationTrackingReference(referenceId)
    : referenceId;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayedReference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === null) return;
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/feedback/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference_id: referenceId,
          rating,
          comment,
          source,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit website feedback.");
      }

      setIsSubmitted(true);
    } catch {
      setError(
        locale === "th"
          ? "ไม่สามารถส่งคำติชมได้ในขณะนี้ กรุณาลองอีกครั้งภายหลัง"
          : "Could not submit feedback at this time. Please try again later."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getQuestionText = () => {
    if (source === "services") {
      return locale === "th"
        ? "ประสบการณ์การจองบริการของคุณในวันนี้เป็นอย่างไรบ้างคะ?"
        : "How was your experience booking our services today?";
    }
    return locale === "th"
      ? "ประสบการณ์การใช้งานระบบออกแบบโซลาร์เซลล์ของคุณในวันนี้เป็นอย่างไรบ้างคะ?"
      : "How was your experience building your solar system today?";
  };

  const getRatingLabel = (score: number) => {
    const labelsEn = ["Terrible", "Poor", "Average", "Good", "Excellent"];
    const labelsTh = ["ปรับปรุงอย่างยิ่ง", "ควรปรับปรุง", "ปานกลาง", "ดีมาก", "ยอดเยี่ยม"];
    const labels = locale === "th" ? labelsTh : labelsEn;
    return labels[score - 1];
  };

  return (
    <div className="space-y-6 w-full max-w-md mx-auto">
      {/* Reference Card with Material 3 Surface */}
      <div className="rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-6 shadow-sm transition-all duration-300">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#4E4B44]">
              {locale === "th" ? "หมายเลขอ้างอิงของคุณ" : "Your Reference Number"}
            </p>
            <p className="mt-1 font-mono text-lg sm:text-xl font-bold tracking-wider text-[#2E2C27]">
              {displayedReference}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            title={locale === "th" ? "คัดลอกไปยังคลิปบอร์ด" : "Copy to Clipboard"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F0EEE9] border border-[#CBC7BE] text-[#2E2C27] shadow-xs transition-all hover:bg-[#DCE8F5] active:scale-95"
          >
            {copied ? (
              <Check className="h-5 w-5 text-emerald-600 animate-in zoom-in" />
            ) : (
              <Clipboard className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Info Microcopy */}
        <p className="mt-4 border-t border-[#F7F6F3] pt-4 text-xs font-normal leading-relaxed text-[#4E4B44]">
          {locale === "th"
            ? "เราได้ส่งลิงก์เข้าสู่ระบบปลอดภัย (Magic Link) ไปยังอีเมลของคุณแล้ว คุณสามารถใช้เพื่อเข้าถึงเอกสารทั้งหมดได้ทุกเมื่อ"
            : "We've sent a secure Magic Link to your email. You can use it to access your full document anytime."}
        </p>
      </div>

      {/* Reusable CSAT Micro-Feedback Card */}
      <div className="rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] p-6 shadow-sm">
        {isSubmitted ? (
          <div className="flex flex-col items-center text-center py-4 space-y-3 animate-in fade-in duration-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h4 className="text-sm font-bold text-[#2E2C27]">
              {locale === "th" ? "ขอบคุณสำหรับข้อเสนอแนะค่ะ!" : "Thank you for your feedback!"}
            </h4>
            <p className="text-xs font-normal text-[#4E4B44] max-w-[280px]">
              {locale === "th"
                ? "ความคิดเห็นของคุณช่วยให้เราปรับปรุงบริการให้ดียิ่งขึ้น"
                : "Your suggestions help us deliver a better booking experience."}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmitFeedback} className="space-y-4 text-left">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#2E2C27] leading-snug">
                {getQuestionText()}
              </h4>
            </div>

            {/* Stars Selector Row - Min 44x44 Touch Target */}
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const isActive =
                    hoveredRating !== null ? star <= hoveredRating : rating !== null && star <= rating;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(null)}
                      style={{ width: "44px", height: "44px" }}
                      className="flex items-center justify-center rounded-full transition-transform active:scale-90 hover:scale-105"
                      aria-label={`Rate ${star} star`}
                    >
                      <Star
                        className={cn(
                          "h-7 w-7 transition-colors",
                          isActive
                            ? "fill-amber-400 text-amber-400"
                            : "text-[#CBC7BE] fill-transparent hover:text-amber-400/50"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
              
              <span className="text-[10px] font-bold text-[#4F7FA8] tracking-wider uppercase min-h-4">
                {(hoveredRating !== null || rating !== null) && (
                  getRatingLabel(hoveredRating ?? rating!)
                )}
              </span>
            </div>

            {/* Smoothly Expanding Suggestions Container */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-500 ease-in-out",
                rating !== null ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
              )}
            >
              <div className="space-y-3 pt-2">
                <label className="grid gap-1.5 text-xs font-semibold text-[#2E2C27]">
                  {locale === "th" ? "มีข้อเสนอแนะเพิ่มเติมเพื่อปรับปรุงเว็บไซต์ของเราไหมคะ?" : "Any suggestions to improve our website?"}
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={
                      locale === "th"
                        ? "บอกเล่าสิ่งที่คุณชอบหรือจุดที่ต้องการให้เราปรับปรุง..."
                        : "Tell us what you liked or how we can improve..."
                    }
                    className="rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] p-3 text-xs font-normal text-[#2E2C27] outline-none transition-all placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
                  />
                </label>

                {error && (
                  <p className="text-[11px] font-medium text-[#B3261E] bg-[#F9DEDC] border border-[#B3261E]/20 p-2.5 rounded-xl">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 text-xs font-semibold text-white hover:bg-[#A5C2DE] disabled:cursor-not-allowed disabled:bg-[#F7F6F3] disabled:text-[#4E4B44] shadow-sm transition-all active:scale-95"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    locale === "th" ? "ส่งความคิดเห็น" : "Submit Feedback"
                  )}
                </button>
              </div>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}
