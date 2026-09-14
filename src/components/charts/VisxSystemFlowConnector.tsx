"use client";

import { useMemo } from "react";
import { LinePath } from "@visx/shape";
import { curveStepAfter } from "@visx/curve";
import { ParentSize } from "@visx/responsive";
import { motion } from "framer-motion";

type Point = { x: number; y: number };

type VisxSystemFlowConnectorProps = Readonly<{
  activeStepIndex: number;
  totalSteps?: number;
  accentColor?: string;
}>;

function SystemFlowConnectorInner({
  width,
  height,
  activeStepIndex,
  totalSteps = 4,
  accentColor = "#F59E0B",
}: {
  width: number;
  height: number;
  activeStepIndex: number;
  totalSteps?: number;
  accentColor?: string;
}) {
  if (width < 50 || height < 10) return null;

  // Step button center calculation (4 columns in grid)
  const columnWidth = width / totalSteps;
  const startX = columnWidth * activeStepIndex + columnWidth / 2;
  const startY = 2;

  // Target: Header of Technical Engineering Specs container (in lg:grid-cols-12, specs is col-span-5 on the right, approx 79% of width)
  const targetX = width >= 1024 ? width * 0.79 : width * 0.5;
  const targetY = height - 2;

  const points: Point[] = useMemo(() => {
    return [
      { x: startX, y: startY },
      { x: startX, y: height * 0.5 },
      { x: targetX, y: height * 0.5 },
      { x: targetX, y: targetY },
    ];
  }, [startX, startY, targetX, targetY, height]);

  return (
    <svg width={width} height={height} className="overflow-visible select-none pointer-events-none">
      {/* Background Circuit Grid Texture Lines */}
      <line
        x1={0}
        y1={height * 0.5}
        x2={width}
        y2={height * 0.5}
        stroke="#0F172A"
        strokeWidth={1}
        strokeDasharray="4,6"
        opacity={0.2}
      />

      {/* Visx LinePath with Step Curve Configuration (PCB / Comic Divider) */}
      <LinePath<Point>
        data={points}
        x={(d) => d.x}
        y={(d) => d.y}
        curve={curveStepAfter}
        stroke="#0F172A"
        strokeWidth={4}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />

      {/* Start Node: Originating from active Step button */}
      <circle
        cx={startX}
        cy={startY}
        r={5}
        fill={accentColor}
        stroke="#0F172A"
        strokeWidth={3}
      />

      {/* End Node: Connecting to Technical Engineering Specs */}
      <circle
        cx={targetX}
        cy={targetY}
        r={5}
        fill="#10B981"
        stroke="#0F172A"
        strokeWidth={3}
      />

      {/* Animated PCB Signal Pulse along track */}
      <motion.circle
        key={`pulse-${activeStepIndex}`}
        r={3.5}
        fill="#F59E0B"
        initial={{ cx: startX, cy: startY, opacity: 1 }}
        animate={{
          cx: [startX, startX, targetX, targetX],
          cy: [startY, height * 0.5, height * 0.5, targetY],
          opacity: [1, 1, 1, 0.2],
        }}
        transition={{
          duration: 1.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </svg>
  );
}

export default function VisxSystemFlowConnector({
  activeStepIndex,
  totalSteps = 4,
  accentColor = "#F59E0B",
}: VisxSystemFlowConnectorProps) {
  return (
    <div className="hidden sm:block h-8 w-full -my-2 z-10 relative">
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <SystemFlowConnectorInner
            width={width}
            height={height}
            activeStepIndex={activeStepIndex}
            totalSteps={totalSteps}
            accentColor={accentColor}
          />
        )}
      </ParentSize>
    </div>
  );
}
