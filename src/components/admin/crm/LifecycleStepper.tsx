"use client";

import { CheckCircle2 } from "@/components/ui/icons";

import { cn } from "@/lib/utils";

export type LifecyclePhase = 1 | 2 | 3 | 4 | 5 | 6;

const lifecycleSteps = [
  "1. ดึงข้อมูลเทคนิคเรียบร้อย",
  "2. รอเจ้าหน้าที่ลงนามอนุมัติ",
  "3. ลูกค้าพิจารณาเอกสารและลงนาม",
  "4. โครงการผ่านการอนุมัติสมบูรณ์",
];

function getStepperIndex(phase: LifecyclePhase) {
  if (phase <= 1) return 0;
  if (phase === 2) return 1;
  if (phase <= 5) return 2;
  return 3;
}

export function LifecycleStepper({ phase }: { phase: LifecyclePhase }) {
  const activeIndex = getStepperIndex(phase);

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-3 shadow-xs">
      <div className="grid gap-2.5 md:grid-cols-4">
        {lifecycleSteps.map((label, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;
          return (
            <div key={label} className={cn("rounded-xl border px-3.5 py-3 transition-all", complete ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 font-bold" : active ? "border-[#B7D1EA] bg-[#B7D1EA] shadow-md" : "border-slate-700/80 bg-slate-900/90 font-bold")}>
              <div className="flex items-center gap-2.5">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black transition-colors", complete ? "bg-emerald-500 text-slate-950" : active ? "bg-[#0F172A] text-white" : "bg-slate-800 text-slate-200 border border-slate-600")}>
                  {complete ? <CheckCircle2 className="h-3.5 w-3.5 stroke-[3]" /> : index + 1}
                </span>
                <p className={cn("text-[12px] font-black leading-tight", active ? "text-[#0F172A]" : complete ? "text-emerald-300" : "text-slate-100")}>{label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
