"use client";

import type { ReactNode } from "react";
import { Bar } from "@visx/shape";

type VisxFunnelStepProps = Readonly<{
  widthClass: string;
  fill: string;
  stroke: string;
  children: ReactNode;
}>;

export default function VisxFunnelStep({ widthClass, fill, stroke, children }: VisxFunnelStepProps) {
  return (
    <div className={`relative min-h-[74px] ${widthClass} rounded-2xl`}>
      <svg
        viewBox="0 0 100 74"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <Bar x={0} y={0} width={100} height={74} rx={12} fill={fill} fillOpacity={0.16} />
        <Bar x={0.5} y={0.5} width={99} height={73} rx={11.5} fill="transparent" stroke={stroke} strokeOpacity={0.38} strokeWidth={1} />
      </svg>
      <div className="relative flex h-full min-h-[74px] items-center justify-between p-3.5">
        {children}
      </div>
    </div>
  );
}
