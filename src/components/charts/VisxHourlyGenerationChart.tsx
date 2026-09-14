"use client";

import { useMemo, useCallback } from "react";
import { AreaClosed, LinePath, Line, Circle } from "@visx/shape";
import { scaleLinear, scalePoint } from "@visx/scale";
import { curveMonotoneX } from "@visx/curve";
import { AxisBottom } from "@visx/axis";
import { ParentSize } from "@visx/responsive";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";

export type HourlySolarDatum = {
  time: string;
  hour: number;
  outputKw: number;
};

type VisxHourlyGenerationChartProps = {
  solarSizeKw?: number;
  locale?: string;
  className?: string;
};

function HourlyGenerationChartInner({
  width,
  height,
  solarSizeKw = 5,
  locale = "th",
}: {
  width: number;
  height: number;
  solarSizeKw?: number;
  locale?: string;
}) {
  const isTh = locale === "th";

  // Generate hourly data from 06:00 to 18:00 peaking at 12:00
  const data: HourlySolarDatum[] = useMemo(() => {
    const peakKw = Number((solarSizeKw * 0.85).toFixed(2));
    const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

    return hours.map((hour) => {
      const timeStr = `${hour.toString().padStart(2, "0")}:00`;
      // Gaussian bell curve peak at 12:00, zero at 06:00 and 18:00
      const bell = Math.exp(-Math.pow(hour - 12, 2) / 6.5);
      const kw = hour === 6 || hour === 18 ? 0 : Number((peakKw * bell).toFixed(2));
      return {
        time: timeStr,
        hour,
        outputKw: kw,
      };
    });
  }, [solarSizeKw]);

  // Dimensions & bounds
  const margin = { top: 20, right: 16, bottom: 28, left: 16 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  // Scales
  const maxKw = useMemo(() => {
    return Math.max(...data.map((d) => d.outputKw), 1) * 1.15;
  }, [data]);

  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: data.map((d) => d.time),
        range: [0, innerWidth],
        padding: 0.1,
      }),
    [data, innerWidth],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxKw],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight, maxKw],
  );

  // Accessors
  const getX = useCallback((d: HourlySolarDatum) => xScale(d.time) ?? 0, [xScale]);
  const getY = useCallback((d: HourlySolarDatum) => yScale(d.outputKw) ?? innerHeight, [yScale, innerHeight]);

  // Tooltip hooks
  const {
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<HourlySolarDatum>();

  const handlePointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      const point = localPoint(event);
      if (!point) return;

      const adjustedX = point.x - margin.left;

      // Find closest data point based on x position
      let closestDatum = data[0];
      let minDistance = Infinity;

      data.forEach((d) => {
        const xPos = getX(d);
        const distance = Math.abs(xPos - adjustedX);
        if (distance < minDistance) {
          minDistance = distance;
          closestDatum = d;
        }
      });

      if (closestDatum) {
        showTooltip({
          tooltipData: closestDatum,
          tooltipLeft: getX(closestDatum) + margin.left,
          tooltipTop: getY(closestDatum) + margin.top,
        });
      }
    },
    [data, getX, getY, margin.left, margin.top, showTooltip],
  );

  if (width < 20 || height < 20) return null;

  return (
    <div className="relative h-full w-full select-none">
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onPointerMove={handlePointer}
        onPointerLeave={hideTooltip}
        onTouchMove={handlePointer}
        onTouchEnd={hideTooltip}
      >
        {/* Clean Linear Gradient */}
        <defs>
          <linearGradient id="visx-hourly-solar-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.40" />
            <stop offset="60%" stopColor="#3B82F6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Gradient Filled Area under Curve */}
          <AreaClosed<HourlySolarDatum>
            data={data}
            x={getX}
            y={getY}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#visx-hourly-solar-gradient)"
          />

          {/* Clean Vibrant Blue Stroke */}
          <LinePath<HourlySolarDatum>
            data={data}
            x={getX}
            y={getY}
            curve={curveMonotoneX}
            stroke="#2563EB"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Hover Crosshair & Dot */}
          {tooltipOpen && tooltipData && (
            <g pointerEvents="none">
              {/* Vertical Dashed Line indicating exact time */}
              <Line
                from={{ x: tooltipLeft - margin.left, y: 0 }}
                to={{ x: tooltipLeft - margin.left, y: innerHeight }}
                stroke="#000000"
                strokeWidth={2.5}
                strokeDasharray="4 4"
              />

              {/* Active Marker Dot */}
              <Circle
                cx={tooltipLeft - margin.left}
                cy={tooltipTop - margin.top}
                r={7}
                fill="#B7D1EA"
                stroke="#000000"
                strokeWidth={3.5}
              />
            </g>
          )}

          {/* Bottom Time Axis */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            tickValues={["06:00", "09:00", "12:00", "15:00", "18:00"]}
            stroke="#000000"
            strokeWidth={3}
            tickStroke="#000000"
            tickLength={5}
            tickLabelProps={() => ({
              fill: "#000000",
              fontSize: 10,
              fontWeight: 900,
              textAnchor: "middle",
              dy: "0.4em",
            })}
          />
        </g>
      </svg>

      {/* Manga Speech Bubble Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: "#FFFFFF",
            color: "#000000",
            border: "2px solid rgba(15, 23, 42, 0.62)",
            borderRadius: "0.75rem",
            boxShadow: "3px 3px 0 rgba(15, 23, 42, 0.50)",
            padding: "8px 14px",
            transform: "translate(-50%, -125%)",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <div className="flex flex-col items-center font-black">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
              {isTh ? "เวลา" : "TIME"} {tooltipData.time}
            </span>
            <span className="text-sm font-black text-[#4F7FA8]">
              {tooltipData.outputKw.toFixed(2)} kW
            </span>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export default function VisxHourlyGenerationChart({
  solarSizeKw = 5,
  locale = "th",
  className = "h-44 w-full",
}: VisxHourlyGenerationChartProps) {
  return (
    <div className={className}>
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <HourlyGenerationChartInner
            width={width}
            height={height}
            solarSizeKw={solarSizeKw}
            locale={locale}
          />
        )}
      </ParentSize>
    </div>
  );
}
