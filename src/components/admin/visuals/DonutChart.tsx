"use client";

import { useReportStore } from "@/store/useReportStore";
import { formatPrice } from "@/lib/utils";
import { Target } from "@/components/ui/icons";
import VisxDonut from "@/components/charts/VisxDonut";

interface DonutSegment {
  name: string;
  percentage: number;
  color: string;
  strokeColor: string;
  spend: number;
  revenue: number;
}

const SEGMENTS: DonutSegment[] = [
  { name: "Google Adwords", percentage: 38, color: "text-blue-500", strokeColor: "#3b82f6", spend: 450, revenue: 1250 },
  { name: "Instagram Feed", percentage: 27, color: "text-pink-500", strokeColor: "#ec4899", spend: 320, revenue: 890 },
  { name: "Newsletter/Email", percentage: 15, color: "text-amber-500", strokeColor: "#f59e0b", spend: 80, revenue: 490 },
  { name: "Direct/Organic", percentage: 20, color: "text-emerald-500", strokeColor: "#10b981", spend: 0, revenue: 660 },
];

export default function DonutChart() {
  const activeSourceHighlight = useReportStore((state) => state.activeSourceHighlight);
  const setSourceHighlight = useReportStore((state) => state.setSourceHighlight);

  const handleSegmentClick = (name: string) => {
    if (activeSourceHighlight === name) {
      setSourceHighlight(null); // Deselect/Reset
    } else {
      setSourceHighlight(name);
    }
  };

  const highlightedSegment = SEGMENTS.find(s => s.name === activeSourceHighlight) || null;
  const donutData = SEGMENTS.map((segment) => ({
    id: segment.name,
    label: segment.name,
    value: segment.percentage,
    color: segment.strokeColor,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
        {/* Visx gallery donut */}
        <div className="relative w-48 h-48 flex items-center justify-center shrink-0">
          <VisxDonut
            data={donutData}
            selectedId={activeSourceHighlight}
            onSelect={handleSegmentClick}
            innerRadius={40}
            outerRadius={52}
            ariaLabel="Acquisition channel mix"
          />

          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              {highlightedSegment ? "Campaign" : "Acquisition"}
            </span>
            <span className="text-xl font-black text-white tracking-tight mt-0.5">
              {highlightedSegment ? `${highlightedSegment.percentage}%` : "100%"}
            </span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px] mt-0.5">
              {highlightedSegment ? highlightedSegment.name : "All Sources"}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3 w-full">
          {SEGMENTS.map((segment) => {
            const isHighlighted = activeSourceHighlight === segment.name;
            const isAnyHighlighted = activeSourceHighlight !== null;

            return (
              <div 
                key={segment.name}
                onClick={() => handleSegmentClick(segment.name)}
                className={`
                  flex items-center justify-between p-2 rounded-xl border transition-all duration-200 cursor-pointer
                  ${isHighlighted 
                    ? "bg-[#0F172A]/5 border-white/20 shadow-none" 
                    : "border-transparent hover:bg-[#0F172A]/[0.02]"
                  }
                  ${isAnyHighlighted && !isHighlighted ? "opacity-40" : "opacity-100"}
                `}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${segment.color.replace("text-", "bg-")}`} />
                  <span className="text-xs font-bold text-white tracking-wide">{segment.name}</span>
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-xs text-muted-foreground">{segment.percentage}%</span>
                  <span className="text-xs font-bold text-white">ROI x{(segment.revenue / (segment.spend || 1)).toFixed(1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spend vs Revenue mini Area Chart */}
      <div className="p-4 rounded-2xl bg-[#0F172A]/5 border border-white/5 space-y-3">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="w-4 h-4 text-primary" />
            <span>Spend vs Configured Revenue</span>
          </div>
          <span className="font-bold text-white">
            {highlightedSegment ? highlightedSegment.name : "All Channels"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Estimated Spend</span>
            <p className="text-lg font-mono font-black text-rose-400">
              {formatPrice(highlightedSegment ? highlightedSegment.spend : SEGMENTS.reduce((a, b) => a + b.spend, 0))}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Configured Value</span>
            <p className="text-lg font-mono font-black text-emerald-400">
              {formatPrice(highlightedSegment ? highlightedSegment.revenue : SEGMENTS.reduce((a, b) => a + b.revenue, 0))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
