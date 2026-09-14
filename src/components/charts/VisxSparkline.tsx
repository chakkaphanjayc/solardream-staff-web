"use client";

import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, Circle, LinePath } from "@visx/shape";

type SparklinePoint = Readonly<{ index: number; value: number }>;

type VisxSparklineProps = Readonly<{
  data: readonly number[];
  colorClass?: string;
  fillColorClass?: string;
}>;

export default function VisxSparkline({
  data,
  colorClass = "stroke-primary",
  fillColorClass = "fill-primary/5",
}: VisxSparklineProps) {
  if (data.length === 0) return null;

  const width = 120;
  const height = 40;
  const padding = 2;
  const points: SparklinePoint[] = data.map((value, index) => ({ value, index }));
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xScale = scaleLinear<number>({
    domain: [0, Math.max(1, points.length - 1)],
    range: [padding, width - padding],
  });
  const yScale = scaleLinear<number>({
    domain: [min, max],
    range: [height - padding, padding],
  });
  const getX = (point: SparklinePoint) => xScale(point.index) ?? padding;
  const getY = (point: SparklinePoint) => yScale(point.value) ?? height / 2;
  const latestPoint = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      <AreaClosed<SparklinePoint>
        data={points}
        x={getX}
        y={getY}
        yScale={yScale}
        curve={curveMonotoneX}
        className={`${fillColorClass} transition-all duration-300`}
      />
      <LinePath<SparklinePoint>
        data={points}
        x={getX}
        y={getY}
        curve={curveMonotoneX}
        className={`${colorClass} transition-all duration-300`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle
        cx={getX(latestPoint)}
        cy={getY(latestPoint)}
        r={3}
        className={colorClass.replace("stroke-", "fill-")}
      />
    </svg>
  );
}
