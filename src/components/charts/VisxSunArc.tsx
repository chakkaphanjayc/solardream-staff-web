"use client";

import { RadialGradient } from "@visx/gradient";
import { ParentSize } from "@visx/responsive";
import { Bar, Circle, Line, LinePath } from "@visx/shape";

type SunArcPoint = Readonly<{ x: number; y: number }>;

type VisxSunArcProps = Readonly<{
  hour: number;
  ariaLabel?: string;
}>;

const WIDTH = 200;
const HEIGHT = 115;
const START_X = 15;
const CONTROL_X = 100;
const END_X = 185;
const GROUND_Y = 96;
const CONTROL_Y = 8;

function getArcPoint(progress: number): SunArcPoint {
  const t = Math.min(1, Math.max(0, progress));
  return {
    x: (1 - t) * (1 - t) * START_X + 2 * t * (1 - t) * CONTROL_X + t * t * END_X,
    y: (1 - t) * (1 - t) * GROUND_Y + 2 * t * (1 - t) * CONTROL_Y + t * t * GROUND_Y,
  };
}

const ARC_POINTS: readonly SunArcPoint[] = Array.from({ length: 25 }, (_, index) =>
  getArcPoint(index / 24),
);

function SunArcInner({ hour, ariaLabel, width, height }: VisxSunArcProps & Readonly<{ width: number; height: number }>) {
  if (width < 10 || height < 10) return null;

  const progress = (Math.min(18, Math.max(6, hour)) - 6) / 12;
  const sun = getArcPoint(progress);
  const isAbove = sun.y < GROUND_Y;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={width}
      height={height}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className="block h-full w-full"
    >
      <defs>
        <RadialGradient
          id="visx-sun-arc-glow"
          from="#fde68a"
          to="#fbbf24"
          fromOpacity={0.5}
          toOpacity={0}
        />
      </defs>

      <Bar x={0} y={GROUND_Y} width={WIDTH} height={HEIGHT - GROUND_Y} fill="#1e293b" radius={2} />
      <Line from={{ x: 10, y: GROUND_Y }} to={{ x: 190, y: GROUND_Y }} stroke="#334155" strokeWidth={1} />
      <LinePath<SunArcPoint>
        data={[...ARC_POINTS]}
        x={(point) => point.x}
        y={(point) => point.y}
        fill="none"
        stroke="#334155"
        strokeWidth={1}
        strokeDasharray="3 3"
      />

      <text x={8} y={93} fontSize={7} fill="#475569" fontFamily="monospace">
        W
      </text>
      <text x={183} y={93} fontSize={7} fill="#475569" fontFamily="monospace">
        E
      </text>
      <text x={95} y={93} fontSize={7} fill="#64748b" fontFamily="monospace" textAnchor="middle">
        S (South)
      </text>

      {isAbove && <Circle cx={sun.x} cy={sun.y} r={14} fill="url(#visx-sun-arc-glow)" />}
      <Circle
        cx={sun.x}
        cy={sun.y}
        r={5}
        fill={isAbove ? "#fbbf24" : "#475569"}
        stroke={isAbove ? "#fde68a" : "#334155"}
        strokeWidth={1.5}
      />
      <Line
        from={{ x: sun.x, y: sun.y }}
        to={{ x: sun.x, y: GROUND_Y }}
        stroke="#64748b"
        strokeWidth={0.5}
        strokeDasharray="2 2"
      />

      {[6, 9, 12, 15, 18].map((tickHour) => {
        const point = getArcPoint((tickHour - 6) / 12);
        return (
          <g key={tickHour}>
            <Circle cx={point.x} cy={point.y} r={1.5} fill="#475569" />
            <text x={point.x} y={110} textAnchor="middle" fontSize={6.5} fill="#64748b" fontFamily="monospace">
              {`${tickHour}`.padStart(2, "0")}h
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function VisxSunArc({ hour, ariaLabel = "Sun position across the day" }: VisxSunArcProps) {
  return (
    <ParentSize className="h-[115px] w-full" debounceTime={10}>
      {({ width, height }) => <SunArcInner hour={hour} ariaLabel={ariaLabel} width={width} height={height} />}
    </ParentSize>
  );
}
