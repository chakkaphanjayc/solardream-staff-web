"use client";

import { Check, Cpu, UserCheck } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BuildStepperProps {
  currentStep: "design" | "contact";
  onStepClick: (step: "design" | "contact") => void;
  locale: string;
}

export default function BuildStepper({
  currentStep,
  onStepClick,
  locale,
}: BuildStepperProps) {
  const isTh = locale === "th";

  const steps = [
    {
      id: "design" as const,
      number: 1,
      title: isTh ? "เลือกระบบ & อุปกรณ์" : "System Design & Options",
      description: isTh
        ? "เลือกขนาดและสเปกที่ต้องการ"
        : "Configure capacity & tiers",
      icon: <Cpu className="h-4 w-4" />,
    },
    {
      id: "contact" as const,
      number: 2,
      title: isTh ? "ข้อมูลผู้ติดต่อ & นัดหมาย" : "Contact Details & Review",
      description: isTh
        ? "ส่งข้อมูลให้วิศวกรประเมินจริง"
        : "Submit for engineering review",
      icon: <UserCheck className="h-4 w-4" />,
    },
  ];

  return (
    <nav
      data-bagui="progress"
      aria-label={isTh ? "ขั้นตอนการสร้างระบบ" : "Build steps"}
      className="solar-build-stepper w-full"
    >
      <ol className="mx-auto grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
        {steps.map((step) => {
          const isActive = currentStep === step.id;
          const isCompleted = currentStep === "contact" && step.id === "design";
          const isLocked = step.id === "contact" && currentStep === "design";

          return (
            <li key={step.id} className="relative min-w-0">
              <Button
                type="button"
                variant="quiet"
                disabled={isLocked}
                data-step={step.id}
                data-active={isActive}
                data-complete={isCompleted}
                data-locked={isLocked}
                aria-current={isActive ? "step" : undefined}
                title={
                  isLocked
                    ? isTh
                      ? "เลือกการออกแบบให้ครบก่อน แล้วจึงไปขั้นตอนที่ 2"
                      : "Complete the design choices before opening Step 2"
                    : undefined
                }
                onClick={() => onStepClick(step.id)}
                className={cn(
                  "solar-build-step h-auto min-h-[76px] w-full justify-start rounded-[24px] border border-[#8E8B83]/20 bg-[#E6E3DC] px-4 py-3 text-left text-[#1C1C1A] shadow-sm transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                  "focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2",
                  isLocked
                    ? "cursor-not-allowed text-[#8E8B83] opacity-60"
                    : "cursor-pointer hover:shadow-md active:scale-95",
                  isActive &&
                    "border-2 border-[#7CA8D0] bg-[#DCE8F5]/50 shadow-md",
                  isCompleted &&
                    "border-[#8E8B83]/30 bg-[#E6E3DC]",
                )}
              >
                <span
                  className={cn(
                    "solar-build-step-number flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    isLocked && "bg-[#F7F6F3] text-[#8E8B83]",
                    isActive && "bg-[#B7D1EA] text-white shadow-sm font-black",
                    isCompleted && "bg-[#C4EED0] text-[#07522C]",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 stroke-[3]" />
                  ) : (
                    step.number
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-sans text-sm font-bold text-[#1C1C1A] sm:text-base">
                      {step.title}
                    </span>
                    {isCompleted ? (
                      <span className="solar-build-step-status hidden shrink-0 rounded-full bg-[#C4EED0] px-2 py-0.5 text-[10px] font-bold text-[#07522C] sm:inline-flex">
                        {isTh ? "เสร็จแล้ว" : "Done"}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-xs font-medium leading-4 text-[#4E4B44]">
                    {step.description}
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className={cn(
                    "solar-build-step-icon ml-auto hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8] sm:flex",
                    isActive && "bg-[#B7D1EA] text-white",
                  )}
                >
                  {step.icon}
                </span>
              </Button>

              {step.id === "design" ? (
                <span
                  aria-hidden="true"
                  className="solar-build-step-connector pointer-events-none absolute -bottom-2 left-1/2 hidden h-3 w-px sm:block"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
