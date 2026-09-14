"use client";

import VisxSparkline from "@/components/charts/VisxSparkline";

interface SparklineProps {
  data: number[];
  colorClass?: string;
  fillColorClass?: string;
}

export default function Sparkline({ data, colorClass, fillColorClass }: SparklineProps) {
  return <VisxSparkline data={data} colorClass={colorClass} fillColorClass={fillColorClass} />;
}
