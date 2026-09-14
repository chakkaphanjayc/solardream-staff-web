"use client";

import { useEffect, useRef } from "react";
import { Globe2, Leaf, ShieldCheck, SunMedium, Waves } from "@/components/ui/icons";
import { gsap } from "gsap";
import { useTranslations } from "next-intl";

import SectionReveal from "../SectionReveal";
import SolarCard from "@/components/ui/SolarCard";
import { cn } from "@/lib/utils";

type Pillar = Readonly<{
  titleKey: string;
  descKey: string;
  icon: typeof Leaf;
  accentIcon?: typeof Waves;
  iconClassName: string;
  motion: "sway" | "pulse" | "guard";
}>;

const pillars: readonly Pillar[] = [
  {
    titleKey: "pillar1Title",
    descKey: "pillar1Desc",
    icon: Leaf,
    accentIcon: Globe2,
    iconClassName: "from-emerald-100 via-white to-emerald-50 text-emerald-700",
    motion: "sway",
  },
  {
    titleKey: "pillar2Title",
    descKey: "pillar2Desc",
    icon: SunMedium,
    accentIcon: Waves,
    iconClassName: "from-amber-100 via-white to-yellow-50 text-amber-700",
    motion: "pulse",
  },
  {
    titleKey: "pillar3Title",
    descKey: "pillar3Desc",
    icon: ShieldCheck,
    iconClassName: "from-sky-100 via-white to-slate-50 text-slate-800",
    motion: "guard",
  },
];

function IconMotion({
  pillar,
}: {
  pillar: Pillar;
}) {
  const iconRef = useRef<HTMLDivElement | null>(null);
  const accentRef = useRef<HTMLDivElement | null>(null);
  const Icon = pillar.icon;
  const AccentIcon = pillar.accentIcon;

  useEffect(() => {
    const icon = iconRef.current;
    if (!icon) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const context = gsap.context(() => {
      if (pillar.motion === "sway") {
        gsap.to(icon, {
          rotate: 4,
          y: -2,
          duration: 1.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      } else if (pillar.motion === "pulse") {
        gsap.to(icon, {
          scale: 1.08,
          autoAlpha: 1,
          duration: 1.6,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      } else {
        gsap.to(icon, {
          y: -2,
          filter: "brightness(1.08)",
          duration: 1.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }

      if (accentRef.current) {
        gsap.to(accentRef.current, {
          scale: 1.06,
          duration: 1.6,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }
    }, icon);

    return () => context.revert();
  }, [pillar.motion]);

  return (
    <div
      className={cn(
        "bg-polkadot relative flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200/60",
        pillar.iconClassName,
      )}
    >
      <div ref={iconRef}>
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </div>
      {AccentIcon ? (
        <div
          ref={accentRef}
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200/60 bg-white text-[#0369a1]"
        >
          <AccentIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </div>
      ) : null}
    </div>
  );
}

function GsapHoverCard({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleEnter = () => {
    const card = cardRef.current;
    if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.to(card, {
      y: -8,
      scale: 1.025,
      rotateY: index === 0 ? -3 : index === 2 ? 3 : 0,
      rotateX: 1,
      duration: 0.3,
      ease: "expo.out",
    });
  };

  const handleLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    gsap.to(card, {
      y: 0,
      scale: 1,
      rotateY: 0,
      rotateX: 0,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.01 : 0.36,
      ease: "expo.out",
    });
  };

  return (
    <div
      ref={cardRef}
      data-snap-card
      className="[perspective:1000px]"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {children}
    </div>
  );
}

export default function CoreValuesTechnologySection() {
  const t = useTranslations("CoreValuesTechnologySection");

  return (
    <SectionReveal disableReveal className="flex min-h-[60vh] lg:min-h-[80vh] items-center overflow-visible bg-transparent py-[clamp(2.5rem,6vh,4rem)]">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div data-parallax="10" className="max-w-3xl">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#0369a1]">{t("subtitle")}</p>
          <h2 className="text-balance text-[clamp(2rem,4.7vw,4.35rem)] font-extrabold leading-[1.08] tracking-tighter text-slate-900">
            {t("title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 md:text-base">
            {t("description")}
          </p>
        </div>

        <div data-parallax="-8" className="mt-[clamp(1.5rem,3.5vh,2.5rem)] grid grid-cols-1 gap-6 md:grid-cols-3 items-stretch">
          {pillars.map((pillar, index) => (
            <GsapHoverCard key={pillar.titleKey} index={index}>
              <SolarCard
                interactive
                className="group flex flex-col justify-between h-full rounded-2xl border border-slate-200/70 bg-white/85 p-5 backdrop-blur-md shadow-sm transition-all duration-300 ease-expo-out hover:border-[#B7D1EA] hover:bg-white hover:shadow-md lg:p-[clamp(1rem,2.5vh,1.35rem)]"
              >
                <div className="flex-1 flex flex-col justify-between break-words">
                  <div>
                    <div className="group-hover:scale-105 group-hover:translate-x-0.5 transition-all duration-300">
                      <IconMotion pillar={pillar} />
                    </div>
                    <h3 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900 transition-colors duration-300 break-words">
                      {t(pillar.titleKey)}
                    </h3>
                    <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 break-words">
                      {t(pillar.descKey)}
                    </p>
                  </div>

                </div>
                <div className="mt-5 h-px w-full bg-slate-200/80 transition-all duration-300 ease-expo-out group-hover:bg-[#B7D1EA]" />
              </SolarCard>
            </GsapHoverCard>
          ))}
        </div>
      </div>
    </SectionReveal>
  );
}
