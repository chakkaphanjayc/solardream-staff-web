"use client";

import { ParentSize } from "@visx/responsive";
import { Pie } from "@visx/shape";
import type { PieArcDatum } from "@visx/vendor/d3-shape";
import type { KeyboardEvent } from "react";

export type VisxDonutDatum = Readonly<{
  id: string;
  label: string;
  value: number;
  color: string;
}>;

type VisxDonutProps = Readonly<{
  data: readonly VisxDonutDatum[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  innerRadius?: number;
  outerRadius?: number;
  ariaLabel?: string;
}>;

function DonutInner({
  data,
  selectedId,
  onSelect,
  innerRadius = 48,
  outerRadius = 72,
  ariaLabel,
  width,
  height,
}: VisxDonutProps & Readonly<{ width: number; height: number }>) {
  const size = Math.min(width, height);
  if (size < 10) return null;

  const center = size / 2;
  const handleKeyDown = (event: KeyboardEvent<SVGPathElement>, datum: VisxDonutDatum) => {
    if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onSelect(datum.id);
  };

  return (
    <svg
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className="block h-full w-full overflow-visible"
      role={ariaLabel ? "img" : undefined}
      viewBox={`0 0 ${size} ${size}`}
    >
      <Pie<VisxDonutDatum>
        data={[...data]}
        pieValue={(datum) => datum.value}
        innerRadius={Math.min(innerRadius, center - 12)}
        outerRadius={Math.min(outerRadius, center - 4)}
        cornerRadius={3}
        padAngle={0.025}
        top={center}
        left={center}
      >
        {({ arcs, path }) => (
          <g>
            {arcs.map((arc: PieArcDatum<VisxDonutDatum>) => {
              const datum = arc.data;
              const isSelected = selectedId === datum.id;
              const hasSelection = selectedId !== null && selectedId !== undefined;
              return (
                <path
                  key={datum.id}
                  d={path(arc) ?? ""}
                  fill={datum.color}
                  opacity={hasSelection && !isSelected ? 0.3 : 1}
                  stroke={isSelected ? "#FFFFFF" : "transparent"}
                  strokeWidth={isSelected ? 3 : 1}
                  tabIndex={onSelect ? 0 : undefined}
                  role={onSelect ? "button" : undefined}
                  aria-label={`${datum.label}: ${datum.value}`}
                  className={onSelect ? "cursor-pointer transition-opacity duration-200" : undefined}
                  onClick={onSelect ? () => onSelect(datum.id) : undefined}
                  onKeyDown={onSelect ? (event) => handleKeyDown(event, datum) : undefined}
                >
                  <title>{`${datum.label}: ${datum.value}`}</title>
                </path>
              );
            })}
          </g>
        )}
      </Pie>
    </svg>
  );
}

export default function VisxDonut(props: VisxDonutProps) {
  return (
    <ParentSize className="h-full w-full" debounceTime={10}>
      {({ width, height }) => <DonutInner {...props} width={width} height={height} />}
    </ParentSize>
  );
}
