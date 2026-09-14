"use client";

import React, { useCallback, useMemo } from "react";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, LinePath, Line } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { GridRows } from "@visx/grid";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";

export interface CashFlowPoint {
  year: number;
  cumulativeSavings: number;
  cumulativeInstallments: number;
  netCashBenefit: number;
  totalCost?: number;
  annualSavings?: number;
  panelEfficiencyPct?: number;
  netCashPositive?: number | null;
  netCashNegative?: number | null;
}

interface VisxCashFlowChartProps {
  data: CashFlowPoint[];
  breakevenYear: number | null;
  formatCurrency: (value: number) => string;
  formatCompactCurrency: (value: number) => string;
}

const defaultMargin = { top: 20, right: 24, bottom: 32, left: 56 };

function CashFlowChartInner({
  data,
  breakevenYear,
  formatCurrency,
  formatCompactCurrency,
  width,
  height,
}: VisxCashFlowChartProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<CashFlowPoint>();

  const margin = defaultMargin;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  // Scales
  const xScale = useMemo(() => {
    return scaleLinear<number>({
      domain: [1, Math.max(1, data.length)],
      range: [0, innerWidth],
    });
  }, [data.length, innerWidth]);

  const yScale = useMemo(() => {
    const maxVal = Math.max(
      ...data.map((d) => Math.max(d.cumulativeSavings, d.cumulativeInstallments, d.netCashBenefit, 1000)),
    );
    const minVal = Math.min(
      0,
      ...data.map((d) => Math.min(d.netCashBenefit, 0)),
    );
    return scaleLinear<number>({
      domain: [minVal, maxVal * 1.08],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [data, innerHeight]);

  // Accessors
  const getX = useCallback((d: CashFlowPoint) => xScale(d.year) ?? 0, [xScale]);
  const getYCumulativeSavings = useCallback(
    (d: CashFlowPoint) => yScale(d.cumulativeSavings) ?? 0,
    [yScale],
  );
  const getYCumulativeInstallments = useCallback(
    (d: CashFlowPoint) => yScale(d.cumulativeInstallments) ?? 0,
    [yScale],
  );

  // Hover tracker
  const handlePointer = useCallback(
    (event: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement> | React.PointerEvent<SVGRectElement>) => {
      const point = localPoint(event);
      if (!point) return;
      const x = point.x - margin.left;
      const yearFloat = xScale.invert(x);
      const roundedYear = Math.max(1, Math.min(data.length, Math.round(yearFloat)));
      const closestPoint = data.find((d) => d.year === roundedYear) || data[0];

      if (closestPoint) {
        showTooltip({
          tooltipData: closestPoint,
          tooltipLeft: margin.left + (xScale(closestPoint.year) ?? 0),
          tooltipTop: margin.top + (yScale(closestPoint.cumulativeSavings) ?? 0),
        });
      }
    },
    [data, margin.left, margin.top, showTooltip, xScale, yScale],
  );

  if (width < 10 || height < 10) return null;

  const breakevenX = breakevenYear !== null ? xScale(breakevenYear) : null;

  return (
    <div className="relative w-full h-full select-none">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <LinearGradient
            id="visx-cf-savings-grad"
            from="#B7D1EA"
            to="#B7D1EA"
            fromOpacity={0.22}
            toOpacity={0.01}
          />
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Background grid */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="3 3"
            stroke="#D9D0C4"
            strokeOpacity={0.7}
          />

          {/* Zero baseline if net benefit goes negative */}
          {yScale(0) <= innerHeight && yScale(0) >= 0 && (
            <Line
              from={{ x: 0, y: yScale(0) }}
              to={{ x: innerWidth, y: yScale(0) }}
              stroke="#CBD5E1"
              strokeWidth={1}
            />
          )}

          {/* Cumulative Savings Area (Teal) */}
          <AreaClosed<CashFlowPoint>
            data={data}
            x={getX}
            y={getYCumulativeSavings}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#visx-cf-savings-grad)"
          />

          {/* Cumulative Savings Line (Teal) */}
          <LinePath<CashFlowPoint>
            data={data}
            x={getX}
            y={getYCumulativeSavings}
            curve={curveMonotoneX}
            stroke="#4F7FA8"
            strokeWidth={3}
          />

          {/* Cumulative Expenditures Line (Dashed Slate) */}
          <LinePath<CashFlowPoint>
            data={data}
            x={getX}
            y={getYCumulativeInstallments}
            curve={curveMonotoneX}
            stroke="#475569"
            strokeWidth={2.5}
            strokeDasharray="5 5"
          />

          {/* Breakeven / Payoff Reference Line */}
          {breakevenX !== null && breakevenX >= 0 && breakevenX <= innerWidth && (
            <g>
              <Line
                from={{ x: breakevenX, y: 0 }}
                to={{ x: breakevenX, y: innerHeight }}
                stroke="#4F7FA8"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
              <g transform={`translate(${breakevenX}, -6)`}>
                <rect
                  x={-42}
                  y={-14}
                  width={84}
                  height={18}
                  rx={6}
                  fill="#4F7FA8"
                  opacity={0.95}
                />
                <text
                  x={0}
                  y={-1}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={10}
                  fontWeight={800}
                >
                  Payoff: Yr {breakevenYear}
                </text>
              </g>
            </g>
          )}

          {/* Active Hover Crosshair */}
          {tooltipOpen && tooltipData && (
            <g>
              <Line
                from={{ x: getX(tooltipData), y: 0 }}
                to={{ x: getX(tooltipData), y: innerHeight }}
                stroke="#0F172A"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.5}
                pointerEvents="none"
              />
              {/* Dot on Savings */}
              <circle
                cx={getX(tooltipData)}
                cy={getYCumulativeSavings(tooltipData)}
                r={5}
                fill="#B7D1EA"
                stroke="#FFFFFF"
                strokeWidth={2}
                pointerEvents="none"
              />
              {/* Dot on Installments */}
              <circle
                cx={getX(tooltipData)}
                cy={getYCumulativeInstallments(tooltipData)}
                r={5}
                fill="#475569"
                stroke="#FFFFFF"
                strokeWidth={2}
                pointerEvents="none"
              />
            </g>
          )}

          {/* X Axis */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={Math.min(data.length, 10)}
            tickFormat={(v) => `Y${v}`}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({
              fill: "#11223F",
              fontSize: 10,
              fontWeight: 700,
              textAnchor: "middle",
              dy: 6,
            })}
          />

          {/* Y Axis */}
          <AxisLeft
            scale={yScale}
            numTicks={5}
            tickFormat={(v) => formatCompactCurrency(Number(v))}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({
              fill: "#11223F",
              fontSize: 10,
              fontWeight: 700,
              textAnchor: "end",
              dx: -6,
              dy: 3,
            })}
          />

          {/* Pointer Event Capture Overlay */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handlePointer}
            onTouchStart={handlePointer}
            onTouchMove={handlePointer}
            onMouseLeave={hideTooltip}
            className="cursor-crosshair"
          />
        </g>
      </svg>

      {/* Floating Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: "#FFFFFF",
            border: "1px solid rgba(17,34,63,0.12)",
            borderRadius: "1rem",
            boxShadow: "0 14px 30px rgba(17,34,63,0.14)",
            padding: "0.75rem 1rem",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <div className="space-y-1.5 text-xs">
            <p className="font-black text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between gap-3">
              <span>Year {tooltipData.year}</span>
              {typeof tooltipData.panelEfficiencyPct === "number" ? (
                <span className="text-[10px] text-slate-500 font-semibold">
                  Eff: {tooltipData.panelEfficiencyPct.toFixed(1)}%
                </span>
              ) : null}
            </p>

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2 w-2 rounded-full bg-[#B7D1EA]" />
                Cumulative Savings:
              </span>
              <span className="font-black text-[#4F7FA8]">
                {formatCurrency(tooltipData.cumulativeSavings)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2 w-2 rounded-full bg-[#475569]" />
                Cumulative Payments:
              </span>
              <span className="font-black text-slate-800">
                {formatCurrency(tooltipData.cumulativeInstallments)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1">
              <span className="text-slate-600 font-bold">Net Benefit:</span>
              <span
                className={`font-black ${
                  tooltipData.netCashBenefit >= 0 ? "text-[#4F7FA8]" : "text-rose-600"
                }`}
              >
                {formatCurrency(tooltipData.netCashBenefit)}
              </span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export default function VisxCashFlowChart(props: VisxCashFlowChartProps) {
  return (
    <ParentSize debounceTime={10}>
      {({ width, height }) => (
        <CashFlowChartInner {...props} width={width} height={height} />
      )}
    </ParentSize>
  );
}
