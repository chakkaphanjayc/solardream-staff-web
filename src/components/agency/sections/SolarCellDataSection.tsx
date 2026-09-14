"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, BatteryCharging, Gauge, Leaf, SunMedium, ThermometerSun, Zap } from "@/components/ui/icons";
import SectionReveal from "../SectionReveal";
import MagneticButton from "@/components/ui/MagneticButton";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import VisxMiniChart from "@/components/charts/VisxMiniChart";

type DataPoint = Readonly<{
  label: string;
  value: string;
  numericValue?: number;
  formatter?: (value: number) => string;
  detail: string;
  icon: typeof SunMedium;
  chart?: "line" | "bar";
  chartData?: { time: string; value: number }[];
}>;

type SolarCellDataSectionProps = Readonly<{
  locale: string;
  solarSizeKw: number;
  onSolarSizeChange?: (value: number) => void;
  isActive?: boolean;
}>;

const SOLAR_SIZE_OPTIONS = [3, 5, 8, 10] as const;
const subscribeToNothing = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export default function SolarCellDataSection({ locale, solarSizeKw, onSolarSizeChange, isActive = false }: SolarCellDataSectionProps) {
  const t = useTranslations("SolarCellDataSection");
  const panelCount550w = Math.ceil((solarSizeKw * 1000) / 550);
  const panelCount450w = Math.ceil((solarSizeKw * 1000) / 450);
  const estimatedDailyKwh = solarSizeKw * 4.2 * 0.85;
  const estimatedMonthlySavings = Math.round(estimatedDailyKwh * 30 * 4.2);
  const diurnalEnergyTrend = useMemo(
    () =>
      [
        { time: "06", factor: 0.05 },
        { time: "08", factor: 0.28 },
        { time: "10", factor: 0.72 },
        { time: "12", factor: 1 },
        { time: "14", factor: 0.82 },
        { time: "16", factor: 0.42 },
        { time: "18", factor: 0.08 },
      ].map((point) => ({
        time: point.time,
        value: Number((solarSizeKw * point.factor * 0.85).toFixed(2)),
      })),
    [solarSizeKw],
  );
  const monthlySavingsTrend = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => ({
        time: `M${index + 1}`,
        value: Math.round(estimatedMonthlySavings * (0.94 + index * 0.012)),
      })),
    [estimatedMonthlySavings],
  );

  const solarCellData: readonly DataPoint[] = [
    {
      label: t("selectedSize"),
      value: `${solarSizeKw} kW`,
      numericValue: solarSizeKw,
      formatter: (value) => `${value.toFixed(0)} kW`,
      detail: t("selectedSizeDetail"),
      icon: Gauge,
    },
    {
      label: t("panelEstimate"),
      value: `${panelCount550w}-${panelCount450w}`,
      numericValue: panelCount550w,
      formatter: (value) => `${Math.round(value)}-${Math.round(value * (550 / 450))}`,
      detail: t("panelEstimateDetail"),
      icon: SunMedium,
    },
    {
      label: t("practicalOutput"),
      value: `${estimatedDailyKwh.toFixed(1)} kWh`,
      numericValue: estimatedDailyKwh,
      formatter: (value) => `${value.toFixed(1)} kWh`,
      detail: t("practicalOutputDetail"),
      icon: Zap,
      chart: "line",
      chartData: diurnalEnergyTrend,
    },
    {
      label: t("monthlySavings"),
      value: `฿${estimatedMonthlySavings.toLocaleString("th-TH")}`,
      numericValue: estimatedMonthlySavings,
      formatter: (value) => `฿${Math.round(value).toLocaleString("th-TH")}`,
      detail: t("monthlySavingsDetail"),
      icon: BatteryCharging,
      chart: "bar",
      chartData: monthlySavingsTrend,
    },
  ];

  const guidance = [
    t("guidance1", { kw: solarSizeKw, panels: `${panelCount550w}-${panelCount450w}` }),
    t("guidance2"),
    t("guidance3"),
    t("guidance4"),
  ];

  return (
    <SectionReveal disableReveal className="flex min-h-[100svh] items-center overflow-hidden bg-transparent py-[clamp(1.5rem,4vh,2.5rem)]">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-[clamp(0.9rem,2.2vh,1.5rem)]">
          <div data-parallax="10">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#0369a1]">
              <ThermometerSun className="h-3.5 w-3.5 text-[#0369a1]" />
              {t("subtitle")}
            </div>
            <h2 className="max-w-3xl text-balance text-[clamp(2rem,4.7vw,4.35rem)] font-extrabold leading-[1.08] tracking-tighter text-slate-900">
              {t("title")}
            </h2>
            <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-slate-600 md:text-base">
              {t("description")}
            </p>
            {onSolarSizeChange ? (
              <div className="mt-5 grid max-w-md grid-cols-4 gap-2" aria-label="System size presets">
                {SOLAR_SIZE_OPTIONS.map((size) => (
                  <Button
                    key={size}
                    type="button"
                    onClick={() => onSolarSizeChange(size)}
                    data-analytics-event="home_size_selected"
                    data-analytics-size-kw={size}
                    aria-pressed={solarSizeKw === size}
                    variant={solarSizeKw === size ? "primary" : "outline"}
                    className="w-full rounded-xl px-3"
                  >
                    {size} kW
                  </Button>
                ))}
              </div>
            ) : null}
            <MagneticButton className="mt-5 w-fit" range={110} strength={0.28}>
              <Link
                href={`/${locale}/build?kw=${solarSizeKw}`}
                data-analytics-event="primary_cta_clicked"
                data-analytics-cta="home_build_from_data"
                data-analytics-position="solar_data"
                className="featured-action group inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-black"
              >
                {t("buttonText", { kw: solarSizeKw })}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-expo-out group-hover:translate-x-1" />
              </Link>
            </MagneticButton>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-2 lg:gap-4">
            {solarCellData.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} interactive className="motion-lift p-4 lg:p-[clamp(0.85rem,1.9vh,1.15rem)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-[#0369a1] shadow-xs">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                  <p className="mt-1.5 text-3xl font-extrabold tracking-tighter text-slate-900 lg:text-[clamp(1.55rem,3.4vh,2.05rem)]">
                    {typeof item.numericValue === "number" && item.formatter ? (
                      <AnimatedNumber value={item.numericValue} formatter={item.formatter} className="inline-block min-w-[5ch]" />
                    ) : (
                      item.value
                    )}
                  </p>
                  <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-600">{item.detail}</p>
                  {item.chart && item.chartData ? (
                    <MetricMicroChart data={item.chartData} type={item.chart} active={isActive} />
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="motion-lift mt-[clamp(0.8rem,2vh,1.15rem)] p-4 lg:p-[clamp(0.9rem,2vh,1.15rem)]">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-[#0369a1] shadow-xs">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t("planningNotes")}</p>
              <h3 className="text-2xl font-medium tracking-tight text-slate-900">{t("whatThisEstimateMeans")}</h3>
            </div>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {guidance.map((item) => (
              <p key={item} className="rounded-2xl border border-slate-200/40 bg-white/60 px-4 py-2 text-sm leading-relaxed text-slate-500 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
                {item}
              </p>
            ))}
          </div>
        </Card>
      </div>
    </SectionReveal>
  );
}

function MetricMicroChart({
  data,
  type,
  active,
}: {
  data: { time: string; value: number }[];
  type: "line" | "bar";
  active: boolean;
}) {
  const [hasActivated, setHasActivated] = useState(false);
  const [animateChart, setAnimateChart] = useState(false);
  const hasActivatedRef = useRef(false);
  const animationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((!active && !reducedMotion) || hasActivatedRef.current) return;
    let activationCommitted = false;
    const animationFrame = window.requestAnimationFrame(() => {
      activationCommitted = true;
      hasActivatedRef.current = true;
      setAnimateChart(!reducedMotion);
      setHasActivated(true);
      if (!reducedMotion) {
        animationTimerRef.current = window.setTimeout(() => setAnimateChart(false), 950);
      }
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (!activationCommitted) hasActivatedRef.current = false;
    };
  }, [active]);

  useEffect(() => () => {
    if (animationTimerRef.current !== null) window.clearTimeout(animationTimerRef.current);
  }, []);

  const isMounted = useSyncExternalStore(subscribeToNothing, getClientMountedSnapshot, getServerMountedSnapshot);

  if (!hasActivated || !isMounted) {
    return <div className="relative mt-3 h-[clamp(42px,6.5vh,60px)] w-full min-w-0 overflow-hidden" aria-hidden="true" />;
  }

  return <VisxMiniChart data={data.map((point) => ({ label: point.time, value: point.value }))} type={type} active={animateChart} />;
}
