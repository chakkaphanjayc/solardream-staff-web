"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Loader2, Star } from "@/components/ui/icons";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CustomerFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRating: number;
  referenceId: string;
  locale?: string;
}

export default function CustomerFeedbackModal({
  isOpen,
  onClose,
  initialRating,
  referenceId,
  locale = "en",
}: CustomerFeedbackModalProps) {
  const [rating, setRating] = useState(initialRating);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setRating(initialRating);
        setComments("");
        setSuccess(false);
        setError("");
      }, 0);
    }
  }, [isOpen, initialRating]);

  useEffect(() => {
    if (!isOpen || !success) return;

    const closeTimer = window.setTimeout(onClose, 2500);
    return () => window.clearTimeout(closeTimer);
  }, [isOpen, onClose, success]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/method/create_feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceId,
          rating,
          comments,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback.");
      }

      setSuccess(true);
    } catch {
      setError(
        locale === "th"
          ? "เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่อีกครั้ง"
          : "Could not submit your feedback. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      tone="light"
      ariaLabel={locale === "th" ? "ส่งข้อเสนอแนะ" : "Submit feedback"}
      closeLabel={locale === "th" ? "ปิดหน้าต่าง" : "Close feedback dialog"}
      dismissible={!busy && !success}
      className="rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] shadow-2xl"
    >
      <DialogContent>
        {success ? (
          <DialogHeader showClose={false} className="justify-center py-10 text-center">
            <div className="mx-auto flex max-w-xs flex-col items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-9 w-9 motion-safe:animate-bounce" aria-hidden="true" />
              </div>
              <DialogTitle className="text-xl font-bold text-[#2E2C27]">
                {locale === "th" ? "ส่งข้อเสนอแนะเรียบร้อยแล้ว" : "Thank you"}
              </DialogTitle>
              <DialogDescription className="mt-0 text-sm text-[#4E4B44]">
                {locale === "th"
                  ? "เราได้รับข้อเสนอแนะของท่านแล้ว ขอบคุณที่ร่วมแบ่งปันประสบการณ์กับ SolarDream"
                  : "Your feedback has been captured. Thank you for helping us improve SolarDream."}
              </DialogDescription>
            </div>
          </DialogHeader>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader showClose={!busy} className="border-b border-[#F7F6F3] bg-[#E6E3DC]">
              <div>
                <DialogTitle className="text-lg font-bold text-[#2E2C27]">
                  {locale === "th" ? "บอกเล่าประสบการณ์ของท่าน" : "Rate your experience"}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#4E4B44]">
                  {locale === "th"
                    ? `อ้างอิงคำขอหมายเลข: ${referenceId}`
                    : `For reference number: ${referenceId}`}
                </DialogDescription>
              </div>
            </DialogHeader>

            <DialogBody className="space-y-6 bg-[#F0EEE9] p-6">
              <fieldset className="flex flex-col items-center gap-3">
                <legend className="sr-only">
                  {locale === "th" ? "ให้คะแนนประสบการณ์" : "Experience rating"}
                </legend>
                <div className="flex items-center gap-1" role="group">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isActive = hoveredRating !== null ? star <= hoveredRating : star <= rating;
                    return (
                      <button
                        key={star}
                        type="button"
                        aria-label={locale === "th" ? `${star} ดาว` : `${star} stars`}
                        aria-pressed={rating === star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(null)}
                        className="inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-[#E6E3DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
                      >
                        <Star
                          aria-hidden="true"
                          className={cn(
                            "h-8 w-8 transition-colors",
                            isActive
                              ? "fill-amber-400 text-amber-400"
                              : "fill-transparent text-[#CBC7BE]",
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#4F7FA8]" aria-live="polite">
                  {rating === 5 && (locale === "th" ? "ดีเยี่ยม" : "Excellent")}
                  {rating === 4 && (locale === "th" ? "ดีมาก" : "Very Good")}
                  {rating === 3 && (locale === "th" ? "ดี" : "Good")}
                  {rating === 2 && (locale === "th" ? "พอใช้" : "Fair")}
                  {rating === 1 && (locale === "th" ? "ควรปรับปรุง" : "Poor")}
                </span>
              </fieldset>

              <label className="grid gap-2 text-sm font-semibold text-[#2E2C27]">
                {locale === "th" ? "ความคิดเห็นเพิ่มเติม (ถ้ามี)" : "Comments (optional)"}
                <textarea
                  rows={4}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  placeholder={
                    locale === "th"
                      ? "กรุณาระบุความคิดเห็นเพื่อปรับปรุงการบริการ..."
                      : "Tell us more about your experience..."
                  }
                  className="min-h-28 resize-y rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] p-3 text-sm font-normal text-[#2E2C27] outline-none transition-colors placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
                />
              </label>

              {error ? (
                <p role="alert" className="rounded-xl border border-[#B3261E]/20 bg-[#F9DEDC] p-3 text-xs font-medium leading-5 text-[#B3261E]">
                  {error}
                </p>
              ) : null}
            </DialogBody>

            <DialogFooter className="border-t border-[#F7F6F3] bg-[#E6E3DC]">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#A5C2DE] hover:shadow active:scale-95 disabled:cursor-wait disabled:bg-[#F7F6F3] disabled:text-[#4E4B44]"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {locale === "th" ? "ส่งความคิดเห็น" : "Submit feedback"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
