"use client";

import { cn } from "@/lib/utils";

export type MangaBurstVariant = "orange" | "teal" | "cream" | "black";
export type MangaBurstTextKey = "zap" | "power" | "shine";

const BURST_TEXTS: Record<MangaBurstTextKey, { en: string; th: string }> = {
  zap:   { en: "ZAP!",   th: "เปรี้ยง!" },
  power: { en: "POWER!", th: "พลัง!" },
  shine: { en: "SHINE!", th: "สว่างจ้า!" },
};

const VARIANT_COLORS: Record<MangaBurstVariant, { fill: string; textFill: string }> = {
  orange: { fill: "#D8A87B", textFill: "#FFFFFF" },
  teal:   { fill: "#2B9EB3", textFill: "#FFFFFF" },
  cream:  { fill: "#F7F6F3", textFill: "#D8A87B" },
  black:  { fill: "#000000", textFill: "#D8A87B" },
};

type MangaComicBurstProps = {
  textKey: MangaBurstTextKey;
  locale?: string;
  variant?: MangaBurstVariant;
  styleType?: "star" | "pill";
  size?: number;
  rotation?: number;
  className?: string;
  /** When this key changes, the burst re-pops */
  animationKey?: string | number;
};

// Generate asymmetrical hand-drawn jagged explosion path
function generateJaggedBurstPath(): string {
  const cx = 60;
  const cy = 60;
  const numPoints = 22;
  // Pre-calculated irregular radii for an authentic asymmetrical comic book impact burst
  const radii = [
    54, 30, 56, 32, 58, 28, 52, 34, 57, 29, 53, 31,
    59, 27, 51, 33, 56, 30, 55, 32, 58, 28
  ];
  
  const points: string[] = [];
  for (let i = 0; i < numPoints; i++) {
    const r = radii[i % radii.length];
    const angle = (Math.PI * 2 / numPoints) * i - Math.PI / 2;
    const x = Math.round((cx + r * Math.cos(angle)) * 10) / 10;
    const y = Math.round((cy + r * Math.sin(angle)) * 10) / 10;
    points.push(`${x},${y}`);
  }
  return `M ${points.join(" L ")} Z`;
}

const JAGGED_BURST_PATH = generateJaggedBurstPath();

export default function MangaComicBurst({
  textKey,
  locale = "th",
  variant = "orange",
  styleType = "star",
  size = 110,
  rotation = -12,
  className,
  animationKey,
}: MangaComicBurstProps) {
  const { fill, textFill } = VARIANT_COLORS[variant];
  const isTh = locale === "th";
  const label = isTh ? BURST_TEXTS[textKey].th : BURST_TEXTS[textKey].en;
  const animationToken = `${textKey}-${locale}-${String(animationKey ?? 0)}`;

  if (styleType === "pill") {
    return (
      <div
        key={animationToken}
        className={cn(
          "pointer-events-none select-none inline-flex items-center justify-center rounded-full border-2 border-[#000] bg-[#D8A87B] px-6 py-2 font-black text-2xl sm:text-3xl text-black shadow-[4px_4px_0px_#000000] animate-manga-pop",
          className
        )}
      >
        <span
          className="tracking-wider uppercase"
          style={{
            fontFamily: isTh ? "'Kanit', sans-serif" : "'Bangers', cursive, sans-serif",
            WebkitTextStroke: "2.5px #000",
            color: "#FFF",
            textShadow: "3px 3px 0 #000",
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  // Radiating speedlines angles
  const speedlineAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  return (
    <div
      key={animationToken}
      style={{ width: size, height: size, transform: `rotate(${rotation}deg)` }}
      className={cn(
        "relative inline-block select-none pointer-events-none manga-sfx-animate drop-shadow-[3px_3px_0px_#000000]",
        className
      )}
    >
      <svg
        aria-label={label}
        role="img"
        width="100%"
        height="100%"
        viewBox="0 0 120 120"
        className="overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Halftone dot pattern overlay inside burst */}
          <pattern
            id={`manga-halftone-${animationToken}`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="4" cy="4" r="1.5" fill="#000000" opacity="0.22" />
          </pattern>
        </defs>

        {/* 1. Action Speed lines radiating from center */}
        <g stroke="#000000" strokeWidth="3" strokeLinecap="round" opacity="0.85">
          {speedlineAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 60 + 38 * Math.cos(rad);
            const y1 = 60 + 38 * Math.sin(rad);
            const x2 = 60 + 58 * Math.cos(rad);
            const y2 = 60 + 58 * Math.sin(rad);
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>

        {/* 2. Primary Jagged Explosion Burst Path */}
        <path
          d={JAGGED_BURST_PATH}
          fill={fill}
          stroke="#000000"
          strokeWidth="4.5"
          strokeLinejoin="miter"
          strokeMiterlimit="6"
        />

        {/* 3. Halftone Dot Overlay Layer inside burst */}
        <path
          d={JAGGED_BURST_PATH}
          fill={`url(#manga-halftone-${animationToken})`}
          stroke="none"
        />

        {/* 4. Heavy Inked Outline Text */}
        <text
          x="60"
          y="65"
          textAnchor="middle"
          dominantBaseline="middle"
          stroke="#000000"
          strokeWidth="6"
          strokeLinejoin="miter"
          strokeMiterlimit="6"
          fill="none"
          fontSize={isTh ? "21" : "26"}
          fontWeight="900"
          fontFamily={isTh ? "'Kanit', sans-serif" : "'Bangers', 'Urbanist', cursive, sans-serif"}
          letterSpacing="0.04em"
        >
          {label}
        </text>

        {/* 5. Crisp Foreground Fill Text */}
        <text
          x="60"
          y="65"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textFill}
          fontSize={isTh ? "21" : "26"}
          fontWeight="900"
          fontFamily={isTh ? "'Kanit', sans-serif" : "'Bangers', 'Urbanist', cursive, sans-serif"}
          letterSpacing="0.04em"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
