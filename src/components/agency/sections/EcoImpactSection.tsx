"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Leaf, Recycle, Sprout, Trees } from "@/components/ui/icons";
import SectionReveal from "../SectionReveal";

type EcoImpactSectionProps = Readonly<{
  solarSizeKw: number;
  isActive?: boolean;
}>;

export default function EcoImpactSection({ solarSizeKw, isActive = false }: EcoImpactSectionProps) {
  const locale = useLocale();
  const t = useTranslations("EcoImpactSection");
  const yearlyKwh = Math.round(solarSizeKw * 4.2 * 365);
  const avoidedCo2Kg = Math.round(yearlyKwh * 0.475);
  const treeEquivalent = Math.max(1, Math.round(avoidedCo2Kg / 21));

  return (
    <SectionReveal disableReveal className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-transparent py-[clamp(1.5rem,4vh,2.5rem)]">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute left-[6%] top-12 h-72 w-72 rounded-full bg-[#B7D1EA]/34 blur-3xl" />
        <div className="absolute bottom-10 right-[8%] h-80 w-80 rounded-full bg-[#D8A87B]/18 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#B7D1EA]/30" />
        <div className="absolute left-1/2 top-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70" />
      </div>

      <div className="mx-auto grid max-w-7xl gap-[clamp(1rem,3vh,2rem)] px-5 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div data-parallax="12">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#0369a1]">
            <Leaf className="h-3.5 w-3.5 text-[#0369a1]" />
            {t("subtitle")}
          </div>
          <h2 className="max-w-3xl text-balance text-[clamp(2rem,4.7vw,4.35rem)] font-extrabold leading-[1.08] tracking-tighter text-slate-900">
            {t("title")}
          </h2>
          <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-slate-600 md:text-base">
            {t("description")}
          </p>
        </div>

        <div data-parallax="-10" className="grid gap-4 sm:grid-cols-2">
          <article className="motion-lift rounded-2xl border border-slate-200/70 bg-white/85 p-5 backdrop-blur-md shadow-sm lg:p-[clamp(1rem,2.1vh,1.3rem)] transition-all duration-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-[#0369a1] shadow-xs">
              <Sprout className="h-6 w-6" />
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{t("annualCleanEnergy")}</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tighter text-slate-900 lg:text-[clamp(2.2rem,4.8vh,2.8rem)]">
              <AnimatedImpactNumber active={isActive} value={yearlyKwh} formatter={(value) => Math.round(value).toLocaleString("th-TH")} />
            </p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{t("annualCleanEnergyDetail", { kw: solarSizeKw })}</p>
          </article>
          <article className="motion-lift rounded-2xl border border-slate-200/70 bg-white/85 p-5 backdrop-blur-md shadow-sm sm:translate-y-2 lg:p-[clamp(1rem,2.1vh,1.3rem)] transition-all duration-300">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-[#0369a1] shadow-xs">
              <Trees className="h-6 w-6" />
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{t("co2Avoided")}</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tighter text-slate-900 lg:text-[clamp(2.2rem,4.8vh,2.8rem)]">
              <AnimatedImpactNumber active={isActive} value={avoidedCo2Kg} formatter={(value) => Math.round(value).toLocaleString("th-TH")} />
            </p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{t("co2AvoidedDetail")}</p>
          </article>
          <article className="motion-lift rounded-2xl border border-slate-200/70 bg-white/85 p-5 backdrop-blur-md shadow-sm sm:col-span-2 lg:p-[clamp(1rem,2.1vh,1.3rem)] transition-all duration-300">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{t("treeAbsorption")}</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tighter text-slate-900 lg:text-[clamp(1.9rem,4.2vh,2.45rem)]">
                  {locale === "th" ? "เทียบเท่าปลูกต้นไม้ประมาณ ~" : "~"}
                  <AnimatedImpactNumber
                    active={isActive}
                    value={treeEquivalent}
                    formatter={(value) => Math.round(value).toLocaleString("th-TH")}
                  />
                  {locale === "th" ? " ต้น" : " trees"}
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/70 bg-white text-[#0369a1] shadow-xs">
                <Recycle className="h-6 w-6" />
              </div>
            </div>
          </article>
        </div>
      </div>
    </SectionReveal>
  );
}

function AnimatedImpactNumber({
  value,
  formatter,
  active,
}: {
  value: number;
  formatter: (value: number) => string;
  active: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const hasActivatedRef = useRef(false);

  useEffect(() => {
    let animationFrame = 0;
    let activationCommitted = false;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (hasActivatedRef.current) {
      animationFrame = window.requestAnimationFrame(() => setDisplayValue(value));
      return () => window.cancelAnimationFrame(animationFrame);
    }
    if (!active && !prefersReducedMotion) return;

    const frames = prefersReducedMotion ? 1 : 30;
    let frame = 0;

    const tick = () => {
      if (!activationCommitted) {
        activationCommitted = true;
        hasActivatedRef.current = true;
      }
      frame += 1;
      const progress = Math.min(1, frame / frames);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(value * eased);
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (!activationCommitted) hasActivatedRef.current = false;
    };
  }, [active, value]);

  return <span className="inline-block min-w-[4ch] tabular-nums">{formatter(displayValue)}</span>;
}
