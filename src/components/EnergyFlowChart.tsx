"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  calculateSolarOutput,
  type WeatherCondition,
} from "@/lib/solarCalculations";
import { Tooltip as InfoTooltip } from "@/components/ui/tooltip";
import { GsapPulse } from "@/components/ui/GsapMotion";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/utils";

// Visx visualization imports
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scaleBand } from "@visx/scale";
import { AreaClosed, LinePath, Line, Bar } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { GridRows } from "@visx/grid";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { Sun, BatteryCharging, BarChart2, TrendingUp, Info } from "@/components/ui/icons";

export interface HourlyData {
  hour: string;
  load: number;
  solarGeneration: number;
  batterySoc: number;
  batteryFlow: number;
  gridConsumption: number;
}

export function generate24HourSimulation(
  totalCalculatedSolarKwp: number,
  activeBatteryCapacityKwh: number,
  monthlyBill: number,
  electricityRate: number,
  daytimeUsagePct: number,
  weather: WeatherCondition = "sunny",
  batteryMode:
    | "self-consumption"
    | "night-discharge"
    | "tou"
    | "backup" = "self-consumption",
  options: {
    daysInMonth?: number;
    futureMonthlyKwh?: number;
    orientationDegrees?: number;
    adjustedSunHours?: number;
    simulatorMultiplier?: number;
  } = {},
): HourlyData[] {
  const rate = electricityRate || 4.5;
  const daysInMonth = options.daysInMonth ?? 30;
  const futureMonthlyKwh = Math.max(0, options.futureMonthlyKwh ?? 0);
  const clampedDaytimePct = Math.max(0, Math.min(100, daytimeUsagePct));

  // Integral-based load model:
  const billedDailyKwh = monthlyBill / (daysInMonth * rate);
  const futureDailyKwh = futureMonthlyKwh / daysInMonth;
  const totalDailyLoadKwh = billedDailyKwh + futureDailyKwh;
  const daytimeLoadKwh = totalDailyLoadKwh * (clampedDaytimePct / 100);
  const nighttimeLoadKwh = totalDailyLoadKwh - daytimeLoadKwh;

  const daylightHours = Array.from({ length: 24 }, (_, h) => h).filter(
    (h) => h >= 6 && h < 18,
  );
  const nightHours = Array.from({ length: 24 }, (_, h) => h).filter(
    (h) => h < 6 || h >= 18,
  );
  const daylightCenter = 12.5;
  const daylightSigma = 3.0;
  const daylightFactors = Array.from({ length: 24 }, (_, h) => {
    if (!daylightHours.includes(h)) return 0;
    const t = h + 0.5;
    return Math.exp(-0.5 * ((t - daylightCenter) / daylightSigma) ** 2);
  });
  const daylightFactorSum = daylightFactors.reduce((a, b) => a + b, 0);
  const loadFactors = Array.from({ length: 24 }, (_, h) => {
    if (daylightHours.includes(h)) {
      return daylightFactorSum > 0
        ? (daytimeLoadKwh * daylightFactors[h]) / daylightFactorSum
        : 0;
    }
    return nighttimeLoadKwh / nightHours.length;
  });

  const solarOut = calculateSolarOutput({
    panelQuantity: 1,
    productWattage: totalCalculatedSolarKwp * 1000,
    orientationDegrees: options.orientationDegrees ?? 180,
    weather,
  });
  const totalDailySolarKwh =
    typeof options.adjustedSunHours === "number"
      ? totalCalculatedSolarKwp * options.adjustedSunHours
      : solarOut.dailyEnergyKwh;
  const adjustedDailySolarKwh =
    totalDailySolarKwh * Math.max(0, options.simulatorMultiplier ?? 1);

  // Solar distribution: sine wave peaking at midday (12:30)
  const solarFactors = Array.from({ length: 24 }, (_, h) => {
    if (h < 6 || h > 18) return 0;
    const t = h + 0.5;
    return Math.max(0, Math.sin(((t - 6) * Math.PI) / 12));
  });
  const solarFactorsSum = solarFactors.reduce((a, b) => a + b, 0);
  const normalizedSolarFactors = solarFactors.map((f) =>
    solarFactorsSum > 0 ? f / solarFactorsSum : 0,
  );

  const data: HourlyData[] = [];
  const maxCapacity = activeBatteryCapacityKwh;
  const minCapacity = activeBatteryCapacityKwh * 0.1; // 10% depth-of-discharge reserve
  let batterySoc =
    batteryMode === "backup" ? maxCapacity : activeBatteryCapacityKwh * 0.2;

  for (let h = 0; h < 24; h++) {
    const hourStr = `${String(h).padStart(2, "0")}:00`;
    const load = loadFactors[h];
    const solarGeneration = adjustedDailySolarKwh * normalizedSolarFactors[h];

    let batteryFlow = 0;
    let gridConsumption = 0;

    // 1. charging check
    let surplus = 0;
    if (solarGeneration > load && batteryMode !== "backup") {
      surplus = solarGeneration - load;
    }

    // Grid charging in TOU off-peak hours (10:00 PM to 9:00 AM)
    let gridChargeFlow = 0;
    if (
      batteryMode === "tou" &&
      (h < 9 || h >= 22) &&
      batterySoc < maxCapacity * 0.8
    ) {
      gridChargeFlow = Math.min(
        maxCapacity * 0.15,
        maxCapacity * 0.8 - batterySoc,
      );
    }

    if (surplus > 0) {
      const chargeAmount = Math.min(surplus, maxCapacity - batterySoc);
      batterySoc += chargeAmount;
      batteryFlow = chargeAmount;
    } else if (gridChargeFlow > 0) {
      batterySoc += gridChargeFlow;
      batteryFlow = gridChargeFlow;
      gridConsumption += gridChargeFlow;
    }

    // 2. discharging check
    const deficit = load - (solarGeneration - surplus) - gridChargeFlow;
    let allowedDischarge = false;

    if (batteryMode === "self-consumption") {
      allowedDischarge = true;
    } else if (batteryMode === "night-discharge") {
      allowedDischarge = solarGeneration === 0;
    } else if (batteryMode === "tou") {
      allowedDischarge = h >= 9 && h < 22;
    } else if (batteryMode === "backup") {
      allowedDischarge = false;
    }

    if (deficit > 0 && allowedDischarge) {
      const dischargeAmount = Math.min(
        deficit,
        Math.max(0, batterySoc - minCapacity),
      );
      batterySoc -= dischargeAmount;
      batteryFlow = -dischargeAmount;
      gridConsumption += deficit - dischargeAmount;
    } else {
      gridConsumption += Math.max(0, deficit);
    }

    data.push({
      hour: hourStr,
      load: parseFloat(load.toFixed(2)),
      solarGeneration: parseFloat(solarGeneration.toFixed(2)),
      batterySoc: parseFloat(batterySoc.toFixed(2)),
      batteryFlow: parseFloat(batteryFlow.toFixed(2)),
      gridConsumption: parseFloat(gridConsumption.toFixed(2)),
    });
  }

  return data;
}

interface EnergyFlowChartProps {
  totalCalculatedSolarKwp: number;
  activeBatteryCapacityKwh: number;
  monthlyBill: number;
  electricityRate: number;
  daytimeUsagePct: number;
  weather?: "sunny" | "cloudy" | "rainy";
  batteryMode?: "self-consumption" | "night-discharge" | "tou" | "backup";
  futureMonthlyKwh?: number;
  orientationDegrees?: number;
  adjustedSunHours?: number;
  simulatorMultiplier?: number;
  daytimeDemandKwh?: number;
  selfConsumedDailyKwh?: number;
  wastedExcessDailyKwh?: number;
}

// ── Visx 24-Hour Manga Neo-Brutalist Reactor Chart ──
function Visx24HourChart({
  data,
  activeBatteryCapacityKwh,
  width,
  height,
  t,
}: {
  data: HourlyData[];
  activeBatteryCapacityKwh: number;
  width: number;
  height: number;
  t: (key: string) => string;
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<{ item: HourlyData; index: number }>();

  const isSmallMobile = width < 420;
  const isTablet = width < 640;
  const margin = {
    top: 18,
    right: isSmallMobile ? 12 : 18,
    bottom: 32,
    left: isSmallMobile ? 38 : 46,
  };
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(() => {
    return scaleLinear<number>({
      domain: [0, 23],
      range: [0, innerWidth],
    });
  }, [innerWidth]);

  const yScale = useMemo(() => {
    const maxVal = Math.max(
      ...data.map((d) =>
        Math.max(
          d.load,
          d.solarGeneration,
          activeBatteryCapacityKwh > 0 ? d.batterySoc : 0,
          d.gridConsumption,
          1,
        ),
      ),
    );
    return scaleLinear<number>({
      domain: [0, maxVal * 1.15],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [data, activeBatteryCapacityKwh, innerHeight]);

  const getX = useCallback((_: HourlyData, index: number) => xScale(index) ?? 0, [xScale]);
  const getYLoad = useCallback((d: HourlyData) => yScale(d.load) ?? 0, [yScale]);
  const getYSolar = useCallback((d: HourlyData) => yScale(d.solarGeneration) ?? 0, [yScale]);
  const getYBattery = useCallback((d: HourlyData) => yScale(d.batterySoc) ?? 0, [yScale]);
  const getYGrid = useCallback((d: HourlyData) => yScale(d.gridConsumption) ?? 0, [yScale]);

  const handlePointer = useCallback(
    (event: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement> | React.PointerEvent<SVGRectElement>) => {
      const point = localPoint(event);
      if (!point) return;
      const x = point.x - margin.left;
      const hourFloat = xScale.invert(x);
      const index = Math.max(0, Math.min(23, Math.round(hourFloat)));
      const item = data[index];
      if (item) {
        showTooltip({
          tooltipData: { item, index },
          tooltipLeft: margin.left + (xScale(index) ?? 0),
          tooltipTop: margin.top + (yScale(item.solarGeneration) ?? 0),
        });
      }
    },
    [data, margin.left, margin.top, showTooltip, xScale, yScale],
  );

  if (width < 10 || height < 10) return null;

  return (
    <div className="relative w-full h-full select-none">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          {/* Best-Practice Clean Linear Gradients */}
          <linearGradient id="solar-glow-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.38" />
            <stop offset="60%" stopColor="#3B82F6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="load-glow-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F172A" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="battery-glow-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="grid-glow-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D8A87B" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#D8A87B" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Cartesian Grid */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="3 3"
            stroke="#94A3B8"
            strokeWidth={1}
            strokeOpacity={0.35}
          />

          {/* Series 1: Load Curve (Home Demand) */}
          <AreaClosed<HourlyData>
            data={data}
            x={getX}
            y={getYLoad}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#load-glow-gradient)"
          />
          <LinePath<HourlyData>
            data={data}
            x={getX}
            y={getYLoad}
            curve={curveMonotoneX}
            stroke="#0F172A"
            strokeWidth={3}
          />

          {/* Series 2: Solar Production Curve (Primary #B7D1EA) */}
          <AreaClosed<HourlyData>
            data={data}
            x={getX}
            y={getYSolar}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#solar-glow-gradient)"
          />
          <LinePath<HourlyData>
            data={data}
            x={getX}
            y={getYSolar}
            curve={curveMonotoneX}
            stroke="#2563EB"
            strokeWidth={3.5}
          />

          {/* Series 3: Battery Storage (Amber #F59E0B) */}
          {activeBatteryCapacityKwh > 0 && (
            <>
              <AreaClosed<HourlyData>
                data={data}
                x={getX}
                y={getYBattery}
                yScale={yScale}
                curve={curveMonotoneX}
                fill="url(#battery-glow-gradient)"
              />
              <LinePath<HourlyData>
                data={data}
                x={getX}
                y={getYBattery}
                curve={curveMonotoneX}
                stroke="#F59E0B"
                strokeWidth={2.5}
              />
            </>
          )}

          {/* Series 4: Grid Consumption Curve (Soft copper) */}
          <AreaClosed<HourlyData>
            data={data}
            x={getX}
            y={getYGrid}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#grid-glow-gradient)"
          />
          <LinePath<HourlyData>
            data={data}
            x={getX}
            y={getYGrid}
            curve={curveMonotoneX}
            stroke="#C48248"
            strokeWidth={2.5}
            strokeDasharray="5 4"
          />

          {/* Active Hover Crosshair Line & Clean Modern Nodes */}
          {tooltipOpen && tooltipData && (
            <g pointerEvents="none">
              <Line
                from={{ x: xScale(tooltipData.index), y: 0 }}
                to={{ x: xScale(tooltipData.index), y: innerHeight }}
                stroke="#64748B"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              {/* Load Node */}
              <circle
                cx={xScale(tooltipData.index)}
                cy={getYLoad(tooltipData.item)}
                r={5.5}
                fill="#FFFFFF"
                stroke="#0F172A"
                strokeWidth={3}
              />
              {/* Solar Node */}
              <circle
                cx={xScale(tooltipData.index)}
                cy={getYSolar(tooltipData.item)}
                r={6}
                fill="#FFFFFF"
                stroke="#2563EB"
                strokeWidth={3.5}
              />
              {/* Battery Node */}
              {activeBatteryCapacityKwh > 0 && (
                <circle
                  cx={xScale(tooltipData.index)}
                  cy={getYBattery(tooltipData.item)}
                  r={5.5}
                  fill="#FFFFFF"
                  stroke="#F59E0B"
                  strokeWidth={3}
                />
              )}
              {/* Grid Node */}
              <circle
                cx={xScale(tooltipData.index)}
                cy={getYGrid(tooltipData.item)}
                r={5.5}
                fill="#FFFFFF"
                stroke="#C48248"
                strokeWidth={3}
              />
            </g>
          )}

          {/* X Axis */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            tickValues={
              isSmallMobile
                ? [0, 6, 12, 18, 23]
                : isTablet
                  ? [0, 4, 8, 12, 16, 20]
                  : [0, 3, 6, 9, 12, 15, 18, 21]
            }
            tickFormat={(v) => `${String(v).padStart(2, "0")}:00`}
            stroke="#000000"
            strokeWidth={2.5}
            tickStroke="#000000"
            tickLabelProps={() => ({
              fill: "#000000",
              fontSize: isSmallMobile ? 8.5 : 10,
              fontWeight: 900,
              textAnchor: "middle",
              dy: 6,
            })}
          />

          {/* Y Axis */}
          <AxisLeft
            scale={yScale}
            numTicks={4}
            tickFormat={(v) => `${v} kW`}
            stroke="#000000"
            strokeWidth={2.5}
            tickStroke="#000000"
            tickLabelProps={() => ({
              fill: "#000000",
              fontSize: isSmallMobile ? 8.5 : 10,
              fontWeight: 900,
              textAnchor: "end",
              dx: -4,
              dy: 3,
            })}
          />

          {/* Event Overlay */}
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

      {/* Manga Neo-Brutalist Speech Bubble Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: "#FFFFFF",
            border: "2px solid rgba(15, 23, 42, 0.62)",
            borderRadius: "0.75rem",
            boxShadow: "3px 3px 0 rgba(15, 23, 42, 0.50)",
            color: "#000000",
            padding: "0.75rem 1rem",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <div className="space-y-1.5 font-bold text-xs text-[#0F172A]">
            <p className="font-black text-black border-b border-slate-200 pb-1 text-xs uppercase tracking-wider">
              ⏱ {tooltipData.item.hour}
            </p>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-blue-600 font-bold uppercase">
                <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                {t("series.solarGeneration")}:
              </span>
              <span className="font-black text-slate-900">{tooltipData.item.solarGeneration.toFixed(1)} kW</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-800 font-bold uppercase">
                <span className="h-2 w-2 rounded-full bg-[#0F172A]" />
                {t("series.load")}:
              </span>
              <span className="font-black text-slate-900">{tooltipData.item.load.toFixed(1)} kW</span>
            </div>
            {activeBatteryCapacityKwh > 0 && (
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-amber-600 font-bold uppercase">
                  <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                  {t("series.batterySoc")}:
                </span>
                <span className="font-black text-slate-900">{tooltipData.item.batterySoc.toFixed(1)} kWh</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-[#C48248] font-bold uppercase">
                <span className="h-2 w-2 rounded-full bg-[#C48248]" />
                {t("series.gridConsumption")}:
              </span>
              <span className="font-black text-slate-900">{tooltipData.item.gridConsumption.toFixed(1)} kW</span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

// ── Visx Timeframe Multi-Series Bar Chart ──
function VisxBarChart({
  data,
  width,
  height,
  t,
}: {
  data: { name: string; load: number; solarGeneration: number }[];
  width: number;
  height: number;
  t: (key: string) => string;
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<{ item: { name: string; load: number; solarGeneration: number }; index: number }>();

  const isSmallMobile = width < 420;
  const margin = {
    top: 18,
    right: isSmallMobile ? 12 : 18,
    bottom: 32,
    left: isSmallMobile ? 38 : 46,
  };
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(() => {
    return scaleBand<string>({
      domain: data.map((d) => d.name),
      range: [0, innerWidth],
      padding: 0.28,
    });
  }, [data, innerWidth]);

  const yScale = useMemo(() => {
    const maxVal = Math.max(
      ...data.map((d) => Math.max(d.load, d.solarGeneration, 1)),
    );
    return scaleLinear<number>({
      domain: [0, maxVal * 1.15],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [data, innerHeight]);

  if (width < 10 || height < 10) return null;

  const barBandwidth = xScale.bandwidth();
  const singleBarWidth = Math.max(2, (barBandwidth - 2) / 2);

  return (
    <div className="relative w-full h-full select-none">
      <svg width={width} height={height} className="overflow-visible">
        <g transform={`translate(${margin.left},${margin.top})`}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="3 3"
            stroke="#94A3B8"
            strokeWidth={1}
            strokeOpacity={0.35}
          />

          {data.map((d, i) => {
            const x0 = xScale(d.name) ?? 0;
            const loadY = yScale(d.load) ?? 0;
            const loadH = Math.max(0, innerHeight - loadY);
            const solarY = yScale(d.solarGeneration) ?? 0;
            const solarH = Math.max(0, innerHeight - solarY);
            const isHovered = tooltipOpen && tooltipData?.index === i;

            return (
              <g
                key={d.name}
                onMouseEnter={() => {
                  showTooltip({
                    tooltipData: { item: d, index: i },
                    tooltipLeft: margin.left + x0 + barBandwidth / 2,
                    tooltipTop: margin.top + Math.min(loadY, solarY),
                  });
                }}
                onMouseLeave={hideTooltip}
                className="cursor-pointer"
              >
                {/* Load Bar (Solid Black with 2px stroke) */}
                <Bar
                  x={x0}
                  y={loadY}
                  width={singleBarWidth}
                  height={loadH}
                  fill="#0F172A"
                  rx={2}
                  opacity={isHovered ? 1 : 0.85}
                />
                {/* Solar Bar */}
                <Bar
                  x={x0 + singleBarWidth + 2}
                  y={solarY}
                  width={singleBarWidth}
                  height={solarH}
                  fill="#2563EB"
                  rx={2}
                  opacity={isHovered ? 1 : 0.95}
                />
              </g>
            );
          })}

          {/* X Axis */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="#000000"
            strokeWidth={2.5}
            tickStroke="#000000"
            tickLabelProps={() => ({
              fill: "#000000",
              fontSize: data.length > 20 ? (isSmallMobile ? 7 : 8) : (isSmallMobile ? 8.5 : 10),
              fontWeight: 900,
              textAnchor: "middle",
              dy: 6,
            })}
          />

          {/* Y Axis */}
          <AxisLeft
            scale={yScale}
            numTicks={4}
            tickFormat={(v) => `${v} kWh`}
            stroke="#000000"
            strokeWidth={2.5}
            tickStroke="#000000"
            tickLabelProps={() => ({
              fill: "#000000",
              fontSize: isSmallMobile ? 8.5 : 10,
              fontWeight: 900,
              textAnchor: "end",
              dx: -4,
              dy: 3,
            })}
          />
        </g>
      </svg>

      {/* Floating Manga Tooltip */}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: "#FFFFFF",
            border: "2px solid rgba(15, 23, 42, 0.62)",
            borderRadius: "0.75rem",
            boxShadow: "3px 3px 0 rgba(15, 23, 42, 0.50)",
            color: "#000000",
            padding: "0.75rem 1rem",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <div className="space-y-1 font-bold text-xs text-[#0F172A]">
            <p className="font-black text-black border-b border-slate-200 pb-1 text-xs uppercase tracking-wider">
              {tooltipData.item.name}
            </p>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-blue-600 font-bold uppercase">
                <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                {t("series.solarGeneration")}:
              </span>
              <span className="font-black text-slate-900">{tooltipData.item.solarGeneration.toFixed(1)} kWh</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-800 font-bold uppercase">
                <span className="h-2 w-2 rounded-full bg-[#0F172A]" />
                {t("series.load")}:
              </span>
              <span className="font-black text-slate-900">{tooltipData.item.load.toFixed(1)} kWh</span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export default function EnergyFlowChart({
  totalCalculatedSolarKwp,
  activeBatteryCapacityKwh,
  monthlyBill,
  electricityRate,
  daytimeUsagePct,
  weather = "sunny",
  batteryMode = "self-consumption",
  futureMonthlyKwh = 0,
  orientationDegrees = 180,
  adjustedSunHours,
  simulatorMultiplier = 1,
  daytimeDemandKwh,
  selfConsumedDailyKwh,
  wastedExcessDailyKwh,
}: EnergyFlowChartProps) {
  const t = useTranslations("EnergyFlowChart");
  const [mounted, setMounted] = useState(false);
  const [timeframe, setTimeframe] = useState<"24h" | "week" | "month" | "year">(
    "24h",
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const simulationData = useMemo(
    () =>
      generate24HourSimulation(
        totalCalculatedSolarKwp,
        activeBatteryCapacityKwh,
        monthlyBill,
        electricityRate,
        daytimeUsagePct,
        weather,
        batteryMode,
        {
          futureMonthlyKwh,
          orientationDegrees,
          adjustedSunHours,
          simulatorMultiplier,
        },
      ),
    [
      totalCalculatedSolarKwp,
      activeBatteryCapacityKwh,
      monthlyBill,
      electricityRate,
      daytimeUsagePct,
      weather,
      batteryMode,
      futureMonthlyKwh,
      orientationDegrees,
      adjustedSunHours,
      simulatorMultiplier,
    ],
  );

  // Peak metrics for daily simulation
  const totalLoad = useMemo(
    () => simulationData.reduce((sum, d) => sum + d.load, 0),
    [simulationData],
  );
  const totalSolar = useMemo(
    () => simulationData.reduce((sum, d) => sum + d.solarGeneration, 0),
    [simulationData],
  );
  const totalGrid = useMemo(
    () => simulationData.reduce((sum, d) => sum + d.gridConsumption, 0),
    [simulationData],
  );
  const batteryOffset = useMemo(
    () => Math.max(0, totalLoad - totalSolar - totalGrid),
    [totalLoad, totalSolar, totalGrid],
  );
  const flowSimulation = useMemo(() => {
    const utilized = Math.max(
      0,
      selfConsumedDailyKwh ?? Math.min(totalLoad, totalSolar),
    );
    const wasted = Math.max(
      0,
      wastedExcessDailyKwh ?? Math.max(0, totalSolar - totalLoad),
    );
    const total = Math.max(0.01, utilized + wasted);

    return {
      utilized,
      wasted,
      utilizedPct: (utilized / total) * 100,
      wastedPct: (wasted / total) * 100,
      demand: daytimeDemandKwh ?? totalLoad,
      sunHours: adjustedSunHours,
    };
  }, [
    adjustedSunHours,
    daytimeDemandKwh,
    selfConsumedDailyKwh,
    totalLoad,
    totalSolar,
    wastedExcessDailyKwh,
  ]);

  const chartLegendItems = timeframe === "24h"
    ? [
        { label: t("series.load"), color: "#0F172A" },
        { label: t("series.solarGeneration"), color: "#2563EB" },
        ...(activeBatteryCapacityKwh > 0 ? [{ label: t("series.batterySoc"), color: "#F59E0B" }] : []),
        { label: t("series.gridConsumption"), color: "#C48248" },
      ]
    : [
        { label: t("series.load"), color: "#0F172A" },
        { label: t("series.solarGeneration"), color: "#2563EB" },
      ];

  const weeklyData = useMemo(() => {
    const days = [
      t("days.mon"),
      t("days.tue"),
      t("days.wed"),
      t("days.thu"),
      t("days.fri"),
      t("days.sat"),
      t("days.sun"),
    ];
    return days.map((day, idx) => {
      const factor = idx >= 5 ? 0.85 : 1.0;
      const weatherFactors = [1.0, 0.95, 1.0, 0.8, 1.0, 0.9, 1.0];
      return {
        name: day,
        load: parseFloat((totalLoad * factor).toFixed(1)),
        solarGeneration: parseFloat(
          (totalSolar * weatherFactors[idx]).toFixed(1),
        ),
      };
    });
  }, [t, totalLoad, totalSolar]);

  const monthlyData = useMemo(() => {
    const dataPoints = [];
    for (let i = 1; i <= 30; i++) {
      const noiseLoad = 0.9 + (i % 7 >= 5 ? -0.15 : 0.05);
      const noiseSolar = 0.8 + ((i * 17) % 5) * 0.08;
      dataPoints.push({
        name: `${i}`,
        load: parseFloat((totalLoad * noiseLoad).toFixed(1)),
        solarGeneration: parseFloat((totalSolar * noiseSolar).toFixed(1)),
      });
    }
    return dataPoints;
  }, [totalLoad, totalSolar]);

  const yearlyData = useMemo(() => {
    const months = [
      { name: t("months.jan"), modifier: 1.05 },
      { name: t("months.feb"), modifier: 1.05 },
      { name: t("months.mar"), modifier: 1.0 },
      { name: t("months.apr"), modifier: 1.0 },
      { name: t("months.may"), modifier: 0.95 },
      { name: t("months.jun"), modifier: 0.85 },
      { name: t("months.jul"), modifier: 0.65 },
      { name: t("months.aug"), modifier: 0.6 },
      { name: t("months.sep"), modifier: 0.55 },
      { name: t("months.oct"), modifier: 0.7 },
      { name: t("months.nov"), modifier: 1.05 },
      { name: t("months.dec"), modifier: 1.05 },
    ];
    return months.map((m) => {
      const loadKwh = totalLoad * 30;
      const solarKwh = totalSolar * 30 * m.modifier;
      return {
        name: m.name,
        load: parseFloat(loadKwh.toFixed(1)),
        solarGeneration: parseFloat(solarKwh.toFixed(1)),
      };
    });
  }, [t, totalLoad, totalSolar]);

  const currentMetrics = useMemo(() => {
    if (timeframe === "24h") {
      return {
        load: totalLoad,
        solar: totalSolar,
        grid: totalGrid,
        battery: batteryOffset,
        unit: "kWh",
      };
    }
    if (timeframe === "week") {
      const sumLoad = weeklyData.reduce((sum, d) => sum + d.load, 0);
      const sumSolar = weeklyData.reduce(
        (sum, d) => sum + d.solarGeneration,
        0,
      );
      return {
        load: sumLoad,
        solar: sumSolar,
        grid: Math.max(0, sumLoad - sumSolar),
        battery: 0,
        unit: "kWh",
      };
    }
    if (timeframe === "month") {
      const sumLoad = monthlyData.reduce((sum, d) => sum + d.load, 0);
      const sumSolar = monthlyData.reduce(
        (sum, d) => sum + d.solarGeneration,
        0,
      );
      return {
        load: sumLoad,
        solar: sumSolar,
        grid: Math.max(0, sumLoad - sumSolar),
        battery: 0,
        unit: "kWh",
      };
    }
    const sumLoad = yearlyData.reduce((sum, d) => sum + d.load, 0);
    const sumSolar = yearlyData.reduce((sum, d) => sum + d.solarGeneration, 0);
    return {
      load: sumLoad,
      solar: sumSolar,
      grid: Math.max(0, sumLoad - sumSolar),
      battery: 0,
      unit: "kWh",
    };
  }, [
    timeframe,
    totalLoad,
    totalSolar,
    totalGrid,
    batteryOffset,
    weeklyData,
    monthlyData,
    yearlyData,
  ]);

  if (!mounted) {
    return (
      <div className="solar-energy-flow-loading flex aspect-[16/9] w-full min-w-0 items-center justify-center rounded-xl p-6">
        <GsapPulse className="text-xs font-black text-[#000000] uppercase tracking-widest">
          {t("loading")}
        </GsapPulse>
      </div>
    );
  }

  return (
    <section data-bagui="card" className="solar-energy-flow min-w-0 space-y-4 rounded-xl p-4 transition-[background-color,box-shadow] select-none sm:p-5">
      {/* Header & Timeframe Selector */}
      <div className="solar-energy-flow-header flex flex-col justify-between gap-4 pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="solar-energy-flow-live inline-flex items-center justify-center px-2.5 py-0.5 text-[10px] font-black uppercase">
              <GsapPulse className="mr-1 h-2 w-2 rounded-full bg-[#000000]" scale={1.5}>
                <span className="sr-only">live</span>
              </GsapPulse>
              {t("live")}
            </span>
            <h3 className="text-base font-black uppercase tracking-wider text-[#000000]">
              {timeframe === "24h" && t("titles.24h")}
              {timeframe === "week" && t("titles.week")}
              {timeframe === "month" && t("titles.month")}
              {timeframe === "year" && t("titles.year")}
            </h3>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-700">
            {timeframe === "24h" && t("descriptions.24h")}
            {timeframe === "week" && t("descriptions.week")}
            {timeframe === "month" && t("descriptions.month")}
            {timeframe === "year" && t("descriptions.year")}
          </p>
        </div>

        {/* Timeframe Selector Buttons (Manga Neo-Brutalist Toggles) */}
        <div className="flex w-full items-center gap-1.5 overflow-x-auto p-0.5 pb-1 sm:pb-0.5 lg:w-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              { key: "24h", label: t("timeframes.24h") },
              { key: "week", label: t("timeframes.week") },
              { key: "month", label: t("timeframes.month") },
              { key: "year", label: t("timeframes.year") },
            ] as const
          ).map(({ key, label }) => {
            const isActive = timeframe === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTimeframe(key)}
                className={`solar-energy-flow-toggle inline-flex min-h-9 sm:min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 py-1 sm:px-4 sm:py-1.5 text-xs font-black uppercase transition-[background-color,box-shadow,transform] duration-200 ease-expo cursor-pointer ${
                  isActive
                    ? "solar-energy-flow-toggle--active text-[#1C1C1A]"
                    : "text-[#1C1C1A] hover:bg-white/75 active:translate-y-px"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Telemetry Metrics Cards Grid */}
      <div className="flex flex-col justify-between gap-2.5 pb-1 lg:flex-row lg:items-center">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
          {t("metrics.cumulative", { timeframe })}
        </span>

        {/* Dynamic telemetry metrics badges */}
        <div
          className={cn(
            "grid w-full gap-1.5 lg:w-auto lg:flex lg:flex-row lg:flex-wrap",
            activeBatteryCapacityKwh > 0 && timeframe === "24h"
              ? "grid-cols-2 sm:grid-cols-4"
              : "grid-cols-3 sm:flex",
          )}
        >
          <InfoTooltip content={t("tooltips.load")}>
            <div className="solar-energy-flow-metric solar-energy-flow-metric--neutral w-full cursor-help rounded-lg px-2 py-1.5 text-center sm:px-3.5 sm:py-1.5 lg:w-auto">
              <p className="text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-slate-700 truncate">
                {t("metrics.load")}
              </p>
              <p className="text-[11px] sm:text-xs font-black text-[#000000] truncate">
                <AnimatedNumber
                  value={currentMetrics.load}
                  decimals={1}
                  suffix={` ${currentMetrics.unit}`}
                />
              </p>
            </div>
          </InfoTooltip>

          <InfoTooltip content={t("tooltips.solar")}>
              <div className="solar-energy-flow-metric solar-energy-flow-metric--solar w-full cursor-help rounded-lg px-2 py-1.5 text-center sm:px-3.5 sm:py-1.5 lg:w-auto">
              <p className="text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-[#4F7FA8] truncate">
                {t("metrics.solarYield")}
              </p>
              <p className="text-[11px] sm:text-xs font-black text-[#000000] truncate">
                <AnimatedNumber
                  value={currentMetrics.solar}
                  decimals={1}
                  suffix={` ${currentMetrics.unit}`}
                />
              </p>
            </div>
          </InfoTooltip>

          {timeframe === "24h" && activeBatteryCapacityKwh > 0 && (
            <InfoTooltip content={t("tooltips.battery")}>
              <div className="solar-energy-flow-metric solar-energy-flow-metric--battery w-full cursor-help rounded-lg px-2 py-1.5 text-center sm:px-3.5 sm:py-1.5 lg:w-auto">
                <p className="text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-amber-800 truncate">
                  {t("metrics.batteryShaved")}
                </p>
                <p className="text-[11px] sm:text-xs font-black text-[#000000] truncate">
                  <AnimatedNumber
                    value={currentMetrics.battery}
                    decimals={1}
                    suffix={` ${currentMetrics.unit}`}
                  />
                </p>
              </div>
            </InfoTooltip>
          )}

          <InfoTooltip content={t("tooltips.grid")}>
            <div className="solar-energy-flow-metric solar-energy-flow-metric--grid w-full cursor-help rounded-lg px-2 py-1.5 text-center sm:px-3.5 sm:py-1.5 lg:w-auto">
              <p className="text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-[#8A5A2B] truncate">
                {t("metrics.gridPull")}
              </p>
              <p className="text-[11px] sm:text-xs font-black text-[#000000] truncate">
                <AnimatedNumber
                  value={currentMetrics.grid}
                  decimals={1}
                  suffix={` ${currentMetrics.unit}`}
                />
              </p>
            </div>
          </InfoTooltip>
        </div>
      </div>

      {/* Energy Flow Utilization Progress Bar */}
      <div className="solar-energy-flow-utilization w-full min-w-0 max-w-full overflow-hidden rounded-lg p-3.5 sm:p-4">
        <div className="mb-2 flex w-full min-w-0 flex-col gap-1.5 sm:gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="break-words text-[10px] font-black uppercase tracking-wider text-[#000000]">
              {t("flow.title")}
            </p>
            <p className="mt-0.5 break-words text-xs font-bold text-slate-700">
              {t("flow.dailyDemand")} <AnimatedNumber value={flowSimulation.demand} decimals={1} suffix=" kWh" />
              {flowSimulation.sunHours
                ? t("flow.adjustedSun", { hours: flowSimulation.sunHours.toFixed(2) })
                : ""}
            </p>
          </div>
          <p
            className={`max-w-full break-words text-xs font-black uppercase lg:text-right ${
              flowSimulation.wasted > 0 ? "text-[#8A5A2B]" : "text-emerald-700"
            }`}
          >
            {flowSimulation.wasted > 0
              ? <><AnimatedNumber value={flowSimulation.wasted} decimals={1} suffix=" kWh" /> {t("flow.excessPerDay")}</>
              : t("flow.noDailyExcess")}
          </p>
        </div>
        <div className="solar-energy-flow-utilization-bar flex h-3.5 sm:h-4 w-full min-w-0 overflow-hidden rounded-full p-0.5">
          <div
            className="solar-energy-flow-utilization-used transition-[width]"
            style={{ width: `${flowSimulation.utilizedPct}%` }}
          />
          <div
            className="solar-energy-flow-utilization-wasted transition-[width]"
            style={{ width: `${flowSimulation.wastedPct}%` }}
          />
        </div>
        <div className="mt-2 flex min-w-0 flex-col gap-1.5 text-[10px] font-black text-slate-700 uppercase sm:flex-row sm:flex-wrap sm:gap-4">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="solar-energy-flow-legend-swatch solar-energy-flow-legend-swatch--used h-3 w-3 shrink-0 rounded-full" />
            <span className="truncate">{t("flow.utilized")} <AnimatedNumber value={flowSimulation.utilized} decimals={1} suffix=" kWh/day" /></span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="solar-energy-flow-legend-swatch solar-energy-flow-legend-swatch--wasted h-3 w-3 shrink-0 rounded-full" />
            <span className="truncate">{t("flow.wasted")} <AnimatedNumber value={flowSimulation.wasted} decimals={1} suffix=" kWh/day" /></span>
          </span>
        </div>
      </div>

      {/* Visx Reactor Simulation Chart */}
      <div className="w-full min-w-0 overflow-hidden pt-2">
        {/* Legend strip */}
        <div className="solar-energy-flow-legend mb-2.5 flex flex-wrap items-center gap-2.5 pb-2.5 sm:gap-4 sm:pb-3">
          {chartLegendItems.map((item) => (
            <span key={item.label} className="flex min-w-0 items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-black uppercase tracking-wider text-[#000000]">
              <span className="solar-energy-flow-legend-swatch h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3" style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </span>
          ))}
        </div>

        {/* Visx Reactor Simulation Chart Container */}
        <div className="aspect-[16/11] sm:aspect-[16/9] min-h-[220px] sm:min-h-[280px] w-full min-w-0">
          {mounted ? (
            <ParentSize debounceTime={10}>
              {({ width, height }) =>
                timeframe === "24h" ? (
                  <Visx24HourChart
                    data={simulationData}
                    activeBatteryCapacityKwh={activeBatteryCapacityKwh}
                    width={width}
                    height={height}
                    t={t}
                  />
                ) : (
                  <VisxBarChart
                    data={
                      timeframe === "week"
                        ? weeklyData
                        : timeframe === "month"
                          ? monthlyData
                          : yearlyData
                    }
                    width={width}
                    height={height}
                    t={t}
                  />
                )
              }
            </ParentSize>
          ) : null}
        </div>
      </div>

      {/* Insights Footer Box */}
      <div className="solar-energy-flow-insight rounded-lg p-3 text-xs font-bold leading-relaxed text-slate-800">
        {timeframe === "24h" &&
          (activeBatteryCapacityKwh > 0 ? (
            <p className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-[#8A5A2B] stroke-[2.5]" />
              <span>
                <strong className="text-[#000000] uppercase font-black">
                  {t("insights.dailyWithBatteryTitle")}
                </strong>{" "}
                {t("insights.dailyWithBatteryBody", { capacity: activeBatteryCapacityKwh })}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2">
              <BatteryCharging className="h-4 w-4 text-[#4F7FA8] shrink-0 stroke-[2.5]" />
              <span>
                <strong className="text-[#000000] uppercase font-black">{t("insights.dailyNoBatteryTitle")}</strong>{" "}
                {t("insights.dailyNoBatteryBody")}
              </span>
            </p>
          ))}
        {timeframe === "week" && (
          <p className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-[#000000] shrink-0 stroke-[2.5]" />
            <span>
              <strong className="text-[#000000] uppercase font-black">{t("insights.weekTitle")}</strong>{" "}
              {t("insights.weekBody")}
            </span>
          </p>
        )}
        {timeframe === "month" && (
          <p className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0 stroke-[2.5]" />
            <span>
              <strong className="text-[#000000] uppercase font-black">{t("insights.monthTitle")}</strong>{" "}
              {t("insights.monthBody")}
            </span>
          </p>
        )}
        {timeframe === "year" && (
          <p className="flex items-center gap-2">
              <Sun className="h-4 w-4 shrink-0 text-[#8A5A2B] stroke-[2.5]" />
            <span>
              <strong className="text-[#000000] uppercase font-black">
                {t("insights.yearTitle")}
              </strong>{" "}
              {t("insights.yearBody")}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
