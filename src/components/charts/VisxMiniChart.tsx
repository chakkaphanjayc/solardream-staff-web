"use client";

import { curveMonotoneX } from "@visx/curve";
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scalePoint } from "@visx/scale";
import { AreaClosed, Bar, Circle, LinePath } from "@visx/shape";

export type VisxMiniChartDatum = Readonly<{
  label: string;
  value: number;
}>;

type VisxMiniChartProps = Readonly<{
  data: readonly VisxMiniChartDatum[];
  type: "line" | "bar";
  active?: boolean;
  ariaLabel?: string;
}>;

type IndexedDatum = VisxMiniChartDatum & Readonly<{ index: number }>;

function MiniChartInner({
  data,
  type,
  ariaLabel,
  width,
  height,
}: VisxMiniChartProps & Readonly<{ width: number; height: number }>) {
  if (width < 10 || height < 10 || data.length === 0) return null;

  const points: IndexedDatum[] = data.map((point, index) => ({ ...point, index }));
  const padding = { top: 5, right: 4, bottom: 3, left: 4 };
  const innerWidth = Math.max(1, width - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const xScale = scalePoint<string>({
    domain: points.map((point) => point.label),
    range: [0, innerWidth],
    padding: points.length > 1 ? 0.35 : 0.5,
  });
  const yScale = scaleLinear<number>({
    domain: [0, maxValue],
    range: [innerHeight, 0],
    nice: true,
  });
  const getX = (point: IndexedDatum) => xScale(point.label) ?? 0;
  const getY = (point: IndexedDatum) => yScale(point.value) ?? innerHeight;

  return (
    <svg
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className="block h-full w-full overflow-visible"
      role={ariaLabel ? "img" : undefined}
      viewBox={`0 0 ${width} ${height}`}
    >
      <g transform={`translate(${padding.left},${padding.top})`}>
        {type === "bar" ? (
          points.map((point, index) => {
            const x = getX(point);
            const nextX = index < points.length - 1 ? getX(points[index + 1]) : innerWidth;
            const previousX = index > 0 ? getX(points[index - 1]) : 0;
            const barWidth = Math.max(3, Math.min(20, (nextX - previousX) * 0.42));
            const y = getY(point);
            return (
              <Bar
                key={`${point.label}-${point.index}`}
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(0, innerHeight - y)}
                rx={2}
                fill="#B7D1EA"
              />
            );
          })
        ) : (
          <>
            <AreaClosed<IndexedDatum>
              data={points}
              x={getX}
              y={getY}
              yScale={yScale}
              curve={curveMonotoneX}
              fill="rgba(183, 209, 234, 0.18)"
            />
            <LinePath<IndexedDatum>
              data={points}
              x={getX}
              y={getY}
              curve={curveMonotoneX}
              stroke="#4F7FA8"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle
              cx={getX(points[points.length - 1])}
              cy={getY(points[points.length - 1])}
              r={3}
              fill="#4F7FA8"
              stroke="#F0EEE9"
              strokeWidth={1.5}
            />
          </>
        )}
      </g>
    </svg>
  );
}

export default function VisxMiniChart({ data, type, active = false, ariaLabel }: VisxMiniChartProps) {
  return (
    <ParentSize
      className={`h-[clamp(42px,6.5vh,60px)] w-full min-w-0 overflow-hidden ${active ? "opacity-100" : "opacity-90"}`}
      debounceTime={10}
    >
      {({ width, height }) => (
        <MiniChartInner data={data} type={type} ariaLabel={ariaLabel} width={width} height={height} />
      )}
    </ParentSize>
  );
}
