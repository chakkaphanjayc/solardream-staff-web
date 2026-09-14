"use client";

import { useReportStore } from "@/store/useReportStore";
import { ArrowDown, Flame, BarChart2 } from "@/components/ui/icons";
import { GsapPulse } from "@/components/ui/GsapMotion";
import VisxFunnelStep from "@/components/charts/VisxFunnelStep";

interface FunnelStep {
  stage: string;
  count: number;
  pctOfTotal: number; // Percentage of first step
  pctOfPrevious: number; // Step-over-step retention
  fill: string;
  stroke: string;
  glowColor: string;
  widthClass: string;
}

const BASE_STEPS: FunnelStep[] = [
  { stage: "Configurator Started", count: 1200, pctOfTotal: 100, pctOfPrevious: 100, fill: "#2563eb", stroke: "#60a5fa", glowColor: "shadow-blue-500/5", widthClass: "w-full" },
  { stage: "Component Selected", count: 900, pctOfTotal: 75, pctOfPrevious: 75, fill: "#4f46e5", stroke: "#818cf8", glowColor: "shadow-indigo-500/5", widthClass: "w-[85%]" },
  { stage: "Compatibility Cleared", count: 720, pctOfTotal: 60, pctOfPrevious: 80, fill: "#9333ea", stroke: "#c084fc", glowColor: "shadow-purple-500/5", widthClass: "w-[70%]" },
  { stage: "Configuration Saved", count: 540, pctOfTotal: 45, pctOfPrevious: 75, fill: "#db2777", stroke: "#f472b6", glowColor: "shadow-pink-500/5", widthClass: "w-[55%]" },
];

export default function FunnelChart() {
  const filteredConfigs = useReportStore((state) => state.filteredConfigs);
  const initialConfigs = useReportStore((state) => state.initialConfigs);

  // Dynamic scaling modifier based on current active filters
  const filterFactor = initialConfigs.length > 0 ? (filteredConfigs.length / initialConfigs.length) : 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground font-semibold flex items-center gap-1">
          <BarChart2 className="w-4 h-4 text-primary" />
          <span>User Conversion Funnel Journey</span>
        </span>
        <span className="text-emerald-400 font-bold font-mono">
          Final CR: 45.0%
        </span>
      </div>

      {/* Funnel Layout */}
      <div className="flex flex-col items-center space-y-2.5">
        {BASE_STEPS.map((step, idx) => {
          // Adjust count dynamically based on the active slicer filter factor
          const dynamicCount = Math.round(step.count * filterFactor);
          const isLast = idx === BASE_STEPS.length - 1;

          return (
            <div key={step.stage} className="w-full flex flex-col items-center">
              {/* Funnel Stage Bar */}
              <VisxFunnelStep
                widthClass={`${step.widthClass} ${step.glowColor} transition-all duration-300 hover:scale-[1.01] group`}
                fill={step.fill}
                stroke={step.stroke}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#0F172A]/5 border border-white/5 flex items-center justify-center font-mono font-bold text-xs text-white">
                    {idx + 1}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-wide group-hover:text-primary transition-colors">
                      {step.stage}
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      {dynamicCount.toLocaleString()} sessions
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="flex items-center gap-1.5 justify-end">
                    <GsapPulse scale={1.1}>
                      <Flame className="w-3.5 h-3.5 text-amber-500" />
                    </GsapPulse>
                    <span className="text-xs font-black text-white">{step.pctOfTotal}%</span>
                  </div>
                  {idx > 0 && (
                    <span className="text-[9px] text-muted-foreground block mt-0.5">
                      Retention: {step.pctOfPrevious}%
                    </span>
                  )}
                </div>

                {/* Subtle highlight overlay */}
                <div className="absolute inset-0 rounded-2xl bg-[#0F172A]/[0.01] opacity-0 transition-opacity pointer-events-none group-hover:opacity-100" />
              </VisxFunnelStep>

              {/* Connecting Arrow */}
              {!isLast && (
                <div className="flex flex-col items-center py-1 opacity-60">
                  <GsapPulse scale={1.12}>
                    <ArrowDown className="w-4 h-4 text-muted-foreground" />
                  </GsapPulse>
                  <span className="text-[9px] font-mono text-rose-400 font-bold">
                    Drop-off: {100 - BASE_STEPS[idx + 1].pctOfPrevious}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
