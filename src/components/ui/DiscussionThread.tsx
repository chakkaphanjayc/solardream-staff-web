"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { MessageSquare, Send, Bot } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { isLocale, toIntlLocale } from "@/i18n/locales";
import {
  addQuotationComment,
  type QuotationComment,
} from "@/app/actions/quotationComments";

// ── Relative timestamp helper ─────────────────────────────────────────────────

interface RelativeTimeLabels {
  justNow: string;
  minutesAgo: (count: number) => string;
  hoursAgo: (count: number) => string;
  daysAgo: (count: number) => string;
}

function relativeTime(
  iso: string,
  locale: string,
  labels: RelativeTimeLabels
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return labels.justNow;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return labels.minutesAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return labels.hoursAgo(diffHr);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return labels.daysAgo(diffDay);
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Avatar sub-component ──────────────────────────────────────────────────────

function CommentAvatar({
  name,
  avatarUrl,
  isAdmin,
  isSystem,
  defaultNames,
}: {
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isSystem: boolean;
  defaultNames: {
    staff: string;
    customer: string;
    avatar: string;
  };
}) {
  const [broken, setBroken] = useState(false);
  const initials = (name ?? (isAdmin ? defaultNames.staff : defaultNames.customer))
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (isSystem) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#B7D1EA]/40 bg-[#B7D1EA]/10">
        <Bot className="h-4 w-4 text-[#2C486A]" />
      </div>
    );
  }

  if (avatarUrl && !broken) {
    return (
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200">
        <Image
          src={avatarUrl}
          alt={name ?? defaultNames.avatar}
          fill
          unoptimized
          className="object-cover"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-black",
        isAdmin
          ? "border-slate-200 bg-slate-100 text-slate-700"
          : "border-[#B7D1EA]/40 bg-[#B7D1EA]/20 text-[#2C486A]"
      )}
    >
      {initials}
    </div>
  );
}

// ── Single comment bubble ─────────────────────────────────────────────────────

const SYSTEM_USER_PREFIX_FALLBACK = "\u26a1 \u0e23\u0e30\u0e1a\u0e1a:";

function CommentBubble({
  comment,
  dateLocale,
  relativeLabels,
  defaultNames,
  systemPrefix,
}: {
  comment: QuotationComment;
  dateLocale: string;
  relativeLabels: RelativeTimeLabels;
  defaultNames: {
    staff: string;
    customer: string;
    avatar: string;
  };
  systemPrefix: string;
}) {
  const isSystem =
    comment.message.startsWith(systemPrefix) ||
    comment.message.startsWith(SYSTEM_USER_PREFIX_FALLBACK);
  const isRight = comment.isAdminReply; // admin aligns right

  if (isSystem) {
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <div className="flex items-center gap-2 rounded-2xl border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 px-4 py-2.5 text-xs font-semibold text-[#2C486A]">
          <Bot className="h-3.5 w-3.5 shrink-0" />
          <span>{comment.message}</span>
        </div>
        <span className="text-[10px] text-slate-400">
          {relativeTime(comment.createdAt, dateLocale, relativeLabels)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-2.5", isRight ? "flex-row-reverse" : "flex-row")}>
      <CommentAvatar
        name={comment.senderName}
        avatarUrl={comment.senderAvatar}
        isAdmin={comment.isAdminReply}
        isSystem={isSystem}
        defaultNames={defaultNames}
      />
      <div className={cn("flex max-w-[75%] flex-col gap-1", isRight ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {comment.senderName ?? (comment.isAdminReply ? defaultNames.staff : defaultNames.customer)}
          </span>
          <span className="text-[10px] text-slate-400">
            {relativeTime(comment.createdAt, dateLocale, relativeLabels)}
          </span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
            isRight
              ? "rounded-br-sm bg-slate-100 text-slate-900"
              : "rounded-bl-sm bg-[#B7D1EA]/20 text-slate-900"
          )}
        >
          {comment.message}
        </div>
      </div>
    </div>
  );
}

// ── Main DiscussionThread component ───────────────────────────────────────────

interface DiscussionThreadProps {
  quotationId: string;
  initialComments?: QuotationComment[];
  /** Pass the current viewer role so we can display appropriate placeholder text */
  viewerRole?: "admin" | "customer";
  className?: string;
  disabled?: boolean;
  /**
   * Optional ref for programmatic scroll/focus — e.g. the "Request Changes" button
   * can call discussionRef.current?.focus() to jump to the thread.
   */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /**
   * Called after a message is successfully sent.
   * Receives the new comment and optionally a newStatus if the action mutated the proposal.
   */
  onAfterSend?: (comment: QuotationComment, newStatus?: string) => void;
  /**
   * If provided, this function is called INSTEAD of the default addQuotationComment
   * for the send action. Useful for overriding the server action on a per-status basis.
   */
  overrideSendAction?: (
    quotationId: string,
    message: string
  ) => Promise<
    | { success: true; comment: QuotationComment; newStatus?: string }
    | { success: false; error: string }
  >;
}

export default function DiscussionThread({
  quotationId,
  initialComments = [],
  viewerRole = "customer",
  className,
  disabled = false,
  inputRef,
  onAfterSend,
  overrideSendAction,
}: DiscussionThreadProps) {
  const t = useTranslations("DiscussionThread");
  const currentLocale = useLocale();
  const dateLocale = toIntlLocale(isLocale(currentLocale) ? currentLocale : "th");
  const relativeLabels: RelativeTimeLabels = {
    justNow: t("time.justNow"),
    minutesAgo: (count) => t("time.minutesAgo", { count }),
    hoursAgo: (count) => t("time.hoursAgo", { count }),
    daysAgo: (count) => t("time.daysAgo", { count }),
  };
  const defaultNames = {
    staff: t("users.staff"),
    customer: t("users.customer"),
    avatar: t("users.avatarAlt"),
  };
  const systemPrefix = t("systemPrefix");
  const [comments, setComments] = useState<QuotationComment[]>(initialComments);
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLTextAreaElement>(null);

  // Resolve which textarea ref to use
  const resolvedInputRef = (inputRef as React.RefObject<HTMLTextAreaElement>) ?? internalInputRef;

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  // Optionally re-fetch when initial comments change (e.g. after router.refresh)
  useEffect(() => {
    const isDifferent =
      initialComments.length !== comments.length ||
      initialComments.some(
        (c, i) =>
          comments[i] === undefined ||
          c.id !== comments[i].id ||
          c.message !== comments[i].message ||
          (c.createdAt && comments[i].createdAt && new Date(c.createdAt).getTime() !== new Date(comments[i].createdAt).getTime())
    );
    if (isDifferent) {
      const frame = requestAnimationFrame(() => setComments(initialComments));
      return () => cancelAnimationFrame(frame);
    }
  }, [initialComments, comments]);

  const handleSend = () => {
    const message = inputValue.trim();
    if (!message || isPending || disabled) return;
    setError(null);

    startTransition(async () => {
      const sendFn = overrideSendAction ?? addQuotationComment;
      const result = await sendFn(quotationId, message);
      if (result.success) {
        setComments((prev) => [...prev, result.comment]);
        setInputValue("");
        const newStatus = "newStatus" in result ? (result as { newStatus?: string }).newStatus : undefined;
        onAfterSend?.(result.comment, newStatus);
      } else {
        setError(result.error ?? t("errors.sendFailed"));
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) {
        handleSend();
      }
    }
  };

  const placeholder = disabled
    ? t("input.disabledPlaceholder")
    : viewerRole === "admin"
      ? t("input.adminPlaceholder")
      : t("input.customerPlaceholder");

  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl border border-slate-200 bg-white/60 shadow-sm backdrop-blur-sm overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200/60 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#B7D1EA]/20 border border-[#B7D1EA]/30">
          <MessageSquare className="h-4 w-4 text-[#2C486A]" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
            {t("header.kicker")}
          </p>
          <p className="text-sm font-black tracking-tight text-slate-900">{t("header.title")}</p>
        </div>
        <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {t("header.messageCount", { count: comments.length })}
        </span>
      </div>

      {/* Chat scroll area */}
      <div
        ref={scrollRef}
        className="min-h-[220px] flex-1 space-y-4 overflow-y-auto px-4 py-4 scroll-smooth max-h-[min(480px,56dvh)] sm:px-6 sm:py-5"
        style={{ scrollbarWidth: "thin" }}
      >
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
              <MessageSquare className="h-5 w-5 text-slate-300" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t("empty.title")}
            </p>
            <p className="mt-1 text-[11px] text-slate-400 font-medium">
              {t("empty.description")}
            </p>
          </div>
        ) : (
          comments.map((c) => (
            <CommentBubble
              key={c.id}
              comment={c}
              dateLocale={dateLocale}
              relativeLabels={relativeLabels}
              defaultNames={defaultNames}
              systemPrefix={systemPrefix}
            />
          ))
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-slate-200/60 p-4">
        <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 focus-within:border-[#B7D1EA] focus-within:ring-4 focus-within:ring-[#B7D1EA]/10 transition-all">
          <textarea
            ref={resolvedInputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            disabled={isPending || disabled}
            className="flex-1 resize-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || !inputValue.trim() || disabled}
            aria-label={t("input.sendAriaLabel")}
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
              inputValue.trim() && !isPending && !disabled
                ? "bg-[#B7D1EA] text-[#2C486A] hover:bg-[#a6c3de] cursor-pointer shadow-sm"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            {isPending ? (
              <GsapSpinner className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-400 font-medium px-1">
          {t("input.keyboardHint")}
        </p>
      </div>
    </div>
  );
}
