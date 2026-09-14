"use client";

import { useEffect, useRef } from "react";

interface HypotrochoidLoaderProps {
  className?: string;
  size?: number; // width and height in px
  color?: string; // CSS color string (e.g. "currentColor", "#B7D1EA")
}

export default function HypotrochoidLoader({
  className = "",
  size = 120,
  color = "currentColor",
}: HypotrochoidLoaderProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const particlesRef = useRef<SVGCircleElement[]>([]);

  const config = {
    particleCount: 82,
    trailSpan: 0.46,
    durationMs: 7600,
    rotationDurationMs: 42000,
    pulseDurationMs: 6200,
    strokeWidth: 4.6,
    spiroR: 8.2,
    spiror: 2.7,
    spirorBoost: 0.45,
    spirod: 4.8,
    spirodBoost: 1.2,
    spiroScale: 3.05,
    point(progress: number, detailScale: number) {
      const t = progress * Math.PI * 2;
      const r = this.spiror + detailScale * this.spirorBoost;
      const d = this.spirod + detailScale * this.spirodBoost;
      const x = (this.spiroR - r) * Math.cos(t) + d * Math.cos(((this.spiroR - r) / r) * t);
      const y = (this.spiroR - r) * Math.sin(t) - d * Math.sin(((this.spiroR - r) / r) * t);
      return {
        x: 50 + x * this.spiroScale,
        y: 50 + y * this.spiroScale,
      };
    },
  };

  useEffect(() => {
    let animationFrameId: number;
    const startedAt = performance.now();

    function normalizeProgress(progress: number) {
      return ((progress % 1) + 1) % 1;
    }

    function getDetailScale(time: number) {
      const pulseProgress = (time % config.pulseDurationMs) / config.pulseDurationMs;
      const pulseAngle = pulseProgress * Math.PI * 2;
      return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
    }

    function getRotation(time: number) {
      return 0; // Rotate config is false by default in template
    }

    function buildPath(detailScale: number, steps = 480) {
      return Array.from({ length: steps + 1 }, (_, index) => {
        const point = config.point(index / steps, detailScale);
        return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      }).join(" ");
    }

    function getParticle(index: number, progress: number, detailScale: number) {
      const tailOffset = index / (config.particleCount - 1);
      const point = config.point(
        normalizeProgress(progress - tailOffset * config.trailSpan),
        detailScale
      );
      const fade = Math.pow(1 - tailOffset, 0.56);
      return {
        x: point.x,
        y: point.y,
        radius: 0.9 + fade * 2.7,
        opacity: 0.04 + fade * 0.96,
      };
    }

    function render(now: number) {
      const time = now - startedAt;
      const progress = (time % config.durationMs) / config.durationMs;
      const detailScale = getDetailScale(time);

      if (groupRef.current) {
        groupRef.current.setAttribute("transform", `rotate(${getRotation(time)} 50 50)`);
      }
      if (pathRef.current) {
        pathRef.current.setAttribute("d", buildPath(detailScale));
      }

      particlesRef.current.forEach((node, index) => {
        if (!node) return;
        const particle = getParticle(index, progress, detailScale);
        node.setAttribute("cx", particle.x.toFixed(2));
        node.setAttribute("cy", particle.y.toFixed(2));
        node.setAttribute("r", particle.radius.toFixed(2));
        node.setAttribute("opacity", particle.opacity.toFixed(3));
      });

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className={className} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        className="w-full h-full overflow-visible"
      >
        <g ref={groupRef}>
          <path
            ref={pathRef}
            stroke={color}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.1"
          />
          {Array.from({ length: config.particleCount }).map((_, i) => (
            <circle
              key={i}
              ref={(el) => {
                if (el) particlesRef.current[i] = el;
              }}
              fill={color}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
