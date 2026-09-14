"use client";

import { useReportStore } from "@/store/useReportStore";
import { Cpu, Video, HardDrive, Smartphone, type IconType } from "@/components/ui/icons";
import { GsapPulse } from "@/components/ui/GsapMotion";

interface TreemapNode {
  category: string;
  weight: number; // Proportional percentage
  color: string;
  borderColor: string;
  icon: IconType;
  itemsCount: number;
}

const NODES: TreemapNode[] = [
  { category: "CPUs", weight: 45, color: "bg-blue-500/10 hover:bg-blue-500/20", borderColor: "border-blue-500/30", icon: Cpu, itemsCount: 12 },
  { category: "GPUs", weight: 30, color: "bg-purple-500/10 hover:bg-purple-500/20", borderColor: "border-purple-500/30", icon: Video, itemsCount: 8 },
  { category: "Cases", weight: 15, color: "bg-emerald-500/10 hover:bg-emerald-500/20", borderColor: "border-emerald-500/30", icon: HardDrive, itemsCount: 6 },
  { category: "Memory", weight: 10, color: "bg-amber-500/10 hover:bg-amber-500/20", borderColor: "border-amber-500/30", icon: Smartphone, itemsCount: 9 },
];

export default function TreemapChart() {
  const activeCategoryHighlight = useReportStore((state) => state.activeCategoryHighlight);
  const setCategoryHighlight = useReportStore((state) => state.setCategoryHighlight);
  const activeSourceHighlight = useReportStore((state) => state.activeSourceHighlight);

  const handleNodeClick = (category: string) => {
    if (activeCategoryHighlight === category) {
      setCategoryHighlight(null); // Reset
    } else {
      setCategoryHighlight(category);
    }
  };

  const isAnyHighlighted = activeCategoryHighlight !== null;

  // Extract component icons to capitalized variables for valid JSX rendering
  const Icon0 = NODES[0].icon;
  const Icon1 = NODES[1].icon;
  const Icon2 = NODES[2].icon;
  const Icon3 = NODES[3].icon;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground font-semibold">
          {activeSourceHighlight ? `Acquisition Channel: ${activeSourceHighlight}` : "Showing all campaign acquisitions"}
        </span>
        {activeSourceHighlight && (
          <GsapPulse className="font-bold text-primary" scale={1.03}>
            <span>Cross-filtered active</span>
          </GsapPulse>
        )}
      </div>

      {/* Proportional Layout Area */}
      <div className="h-[260px] flex gap-3 w-full">
        {/* Left main block (CPUs: 45%) */}
        <div 
          style={{ flexGrow: NODES[0].weight }}
          onClick={() => handleNodeClick(NODES[0].category)}
          className={`
            border ${NODES[0].borderColor} ${NODES[0].color} rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all duration-300 relative overflow-hidden group
            ${activeCategoryHighlight === NODES[0].category ? "ring-2 ring-primary bg-blue-500/20" : ""}
            ${isAnyHighlighted && activeCategoryHighlight !== NODES[0].category ? "opacity-30" : "opacity-100"}
          `}
        >
          <div className="flex justify-between items-start z-10">
            <Icon0 className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-mono text-blue-300 font-bold">{NODES[0].weight}% Weight</span>
          </div>
          <div className="space-y-1 z-10">
            <h4 className="text-lg font-black text-white">{NODES[0].category}</h4>
            <p className="text-xs text-muted-foreground">{NODES[0].itemsCount} components in slot</p>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Right block - splits remaining 55% */}
        <div style={{ flexGrow: 55 }} className="flex flex-col gap-3">
          {/* Top section (GPUs: 30%) */}
          <div 
            style={{ flexGrow: NODES[1].weight }}
            onClick={() => handleNodeClick(NODES[1].category)}
            className={`
              border ${NODES[1].borderColor} ${NODES[1].color} rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 relative overflow-hidden group
              ${activeCategoryHighlight === NODES[1].category ? "ring-2 ring-primary bg-purple-500/20" : ""}
              ${isAnyHighlighted && activeCategoryHighlight !== NODES[1].category ? "opacity-30" : "opacity-100"}
            `}
          >
            <div className="flex justify-between items-start z-10">
              <Icon1 className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-mono text-purple-300 font-bold">{NODES[1].weight}% Weight</span>
            </div>
            <div className="space-y-0.5 z-10">
              <h4 className="text-sm font-black text-white">{NODES[1].category}</h4>
              <p className="text-[10px] text-muted-foreground">{NODES[1].itemsCount} components in slot</p>
            </div>
          </div>

          {/* Bottom section (Cases: 15% and Memory: 10% side by side) */}
          <div style={{ flexGrow: 25 }} className="flex gap-3">
            {/* Cases (15%) */}
            <div 
              style={{ flexGrow: NODES[2].weight }}
              onClick={() => handleNodeClick(NODES[2].category)}
              className={`
                border ${NODES[2].borderColor} ${NODES[2].color} rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 relative overflow-hidden group
                ${activeCategoryHighlight === NODES[2].category ? "ring-2 ring-primary bg-emerald-500/20" : ""}
                ${isAnyHighlighted && activeCategoryHighlight !== NODES[2].category ? "opacity-30" : "opacity-100"}
              `}
            >
              <Icon2 className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <div className="z-10 mt-2">
                <h4 className="text-xs font-black text-white">{NODES[2].category}</h4>
                <span className="text-[9px] font-mono text-emerald-300 block">{NODES[2].weight}%</span>
              </div>
            </div>

            {/* Memory (10%) */}
            <div 
              style={{ flexGrow: NODES[3].weight }}
              onClick={() => handleNodeClick(NODES[3].category)}
              className={`
                border ${NODES[3].borderColor} ${NODES[3].color} rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 relative overflow-hidden group
                ${activeCategoryHighlight === NODES[3].category ? "ring-2 ring-primary bg-amber-500/20" : ""}
                ${isAnyHighlighted && activeCategoryHighlight !== NODES[3].category ? "opacity-30" : "opacity-100"}
              `}
            >
              <Icon3 className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              <div className="z-10 mt-2">
                <h4 className="text-xs font-black text-white">{NODES[3].category}</h4>
                <span className="text-[9px] font-mono text-amber-300 block">{NODES[3].weight}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
