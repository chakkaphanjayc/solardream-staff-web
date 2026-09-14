"use client";

import React, { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "gsap";
import { Check } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface StatusPipelineProps {
  currentStatus: string;
}

export default function StatusPipeline({ currentStatus }: StatusPipelineProps) {
  const t = useTranslations("StatusPipeline");
  const status = (currentStatus || "").toUpperCase();
  const progressRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Define steps mapping
  let activeStep = 1;
  if (["SENT", "ACTIVE", "CANCEL_REQUESTED", "EXPIRED", "PENDING_CUSTOMER_APPROVAL", "PENDING_CUSTOMER_SIGNATURE"].includes(status)) {
    activeStep = 2;
  } else if (["SIGNED", "SIGNED_WAITING_VERIFY", "CONFIRMED", "VERIFIED_IN_PROGRESS", "COMPLETED"].includes(status)) {
    activeStep = 3;
  }

  const steps = [
    {
      index: 1,
      title: t("steps.draft.title"),
      sub: t("steps.draft.sub"),
    },
    {
      index: 2,
      title: t("steps.pendingSignature.title"),
      sub: t("steps.pendingSignature.sub"),
    },
    {
      index: 3,
      title: t("steps.completed.title"),
      sub: t("steps.completed.sub"),
    },
  ];

  useEffect(() => {
    const progress = progressRef.current;
    const activeDot = stepRefs.current[activeStep - 1];
    if (!progress) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      gsap.to(progress, {
        width: `${activeStep === 1 ? 0 : activeStep === 2 ? 50 : 100}%`,
        duration: prefersReducedMotion ? 0.01 : 0.46,
        ease: "power3.out",
      });

      if (activeDot) {
        gsap.fromTo(
          activeDot,
          {
            boxShadow: "0 0 0 0 rgba(183, 209, 234, 0.45)",
          },
          {
            boxShadow: "0 0 0 6px rgba(183, 209, 234, 0)",
            duration: prefersReducedMotion ? 0.01 : 1.45,
            ease: "power2.out",
            repeat: prefersReducedMotion ? 0 : -1,
          },
        );
      }
    }, progress.parentElement ?? progress);

    return () => context.revert();
  }, [activeStep]);

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between w-full max-w-2xl mx-auto relative px-4">
        {/* Connection line */}
        <div className="absolute top-[20px] left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0 mx-10 md:mx-16" />
        <div 
          ref={progressRef}
          className="absolute top-[20px] left-0 h-0.5 bg-[#B7D1EA] -translate-y-1/2 z-0 mx-10 md:mx-16"
          style={{ width: `${activeStep === 1 ? 0 : activeStep === 2 ? 50 : 100}%` }}
        />

        {steps.map((step) => {
          const isCompleted = activeStep > step.index;
          const isActive = activeStep === step.index;

          return (
            <div key={step.index} className="flex flex-col items-center z-10 select-none">
              <div
                ref={(node) => {
                  stepRefs.current[step.index - 1] = node;
                }}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors duration-300",
                  isCompleted && "border-[#4F7FA8]/70 bg-[#B7D1EA] text-slate-950 shadow-[2px_2px_0_rgba(15,23,42,0.24)]",
                  isActive && "border-[#B7D1EA] bg-[#0F172A] text-[#B7D1EA] ring-2 ring-[#B7D1EA]/35",
                  !isCompleted && !isActive && "border-slate-700 bg-slate-900 text-slate-400"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5 stroke-[3]" />
                ) : (
                  <span>{step.index}</span>
                )}
              </div>
              <div className="mt-3 text-center">
                <p className={cn(
                  "text-[10px] font-bold tracking-tight",
                  isActive ? "text-[#B7D1EA] font-black" : isCompleted ? "text-slate-200" : "text-slate-400"
                )}>
                  {step.title}
                </p>
                <p className="text-[8px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
                  {step.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StatusBannerProps {
  currentStatus: string;
  isAdmin?: boolean;
}

export function StatusBanner({ currentStatus, isAdmin = false }: StatusBannerProps) {
  const t = useTranslations("StatusPipeline.banner");
  const status = (currentStatus || "").toUpperCase();

  let message = "";
  let type: "info" | "warning" | "success" | "danger" = "info";

  if (["DRAFT", "REVISION", "PENDING_EVALUATION"].includes(status)) {
    type = "info";
    message = isAdmin
      ? t("draft.admin")
      : t("draft.customer");
  } else if (["SENT", "ACTIVE", "CANCEL_REQUESTED", "EXPIRED", "PENDING_CUSTOMER_APPROVAL", "PENDING_CUSTOMER_SIGNATURE"].includes(status)) {
    type = "warning";
    if (status === "CANCEL_REQUESTED") {
      type = "danger";
      message = isAdmin
        ? t("cancelRequested.admin")
        : t("cancelRequested.customer");
    } else if (status === "EXPIRED") {
      type = "danger";
      message = isAdmin
        ? t("expired.admin")
        : t("expired.customer");
    } else {
      message = isAdmin
        ? t("sent.admin")
        : t("sent.customer");
    }
  } else if (["SIGNED", "SIGNED_WAITING_VERIFY", "CONFIRMED", "VERIFIED_IN_PROGRESS", "COMPLETED"].includes(status)) {
    type = "success";
    message = isAdmin
      ? t("signed.admin")
      : t("signed.customer");
  } else if (status === "CANCELLED") {
    type = "danger";
    message = t("cancelled");
  } else if (status === "DEACTIVATED") {
    type = "danger";
    message = t("deactivated");
  } else {
    message = isAdmin
      ? t("unknown.admin", { status })
      : t("unknown.customer", { status });
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-2xl rounded-xl border-2 px-4 py-3.5 text-center text-xs font-semibold leading-relaxed shadow-[2px_2px_0_rgba(15,23,42,0.14)]",
        type === "info" && "border-blue-700/35 bg-blue-50/70 text-blue-800",
        type === "warning" && "border-amber-700/35 bg-amber-50/70 text-amber-800",
        type === "success" && "border-emerald-700/35 bg-emerald-50/70 text-emerald-800",
        type === "danger" && "border-rose-700/35 bg-rose-50/70 text-rose-800"
      )}
    >
      {message}
    </div>
  );
}
