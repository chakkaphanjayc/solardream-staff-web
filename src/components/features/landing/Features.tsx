"use client";

import { ShieldCheck, Cpu, Gauge, Zap, Award, Settings } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionReveal } from "@/components/ui/motion-reveal";

const featureMeta = [
  {
    id: "brands",
    icon: ShieldCheck,
    color: "text-[#1CBBBB]",
    bg: "bg-[#1CBBBB]/10"
  },
  {
    id: "estimator",
    icon: Gauge,
    color: "text-[#1CBBBB]",
    bg: "bg-[#1CBBBB]/10"
  },
  {
    id: "engineering",
    icon: Cpu,
    color: "text-[#1CBBBB]",
    bg: "bg-[#1CBBBB]/10"
  },
  {
    id: "independence",
    icon: Zap,
    color: "text-[#1CBBBB]",
    bg: "bg-[#1CBBBB]/10"
  },
  {
    id: "tracking",
    icon: Award,
    color: "text-[#1CBBBB]",
    bg: "bg-[#1CBBBB]/10"
  },
  {
    id: "permits",
    icon: Settings,
    color: "text-[#1CBBBB]",
    bg: "bg-[#1CBBBB]/10"
  }
];

export default function Features() {
  const t = useTranslations("Landing");

  return (
    <section id="features" className="mx-auto max-w-7xl space-y-16 px-6 py-24">
      <div className="space-y-4 text-center">
        <Badge variant="neutral">{t("features.titleAccent")}</Badge>
        <h2 className="text-balance text-4xl font-black tracking-tight text-foreground md:text-5xl">
          {t("features.titleLineOne")} <span className="text-primary-foreground">{t("features.titleAccent")}</span>?
        </h2>
        <p className="mx-auto max-w-2xl text-base font-semibold leading-relaxed text-muted-foreground">
          {t("features.description")}
        </p>
      </div>
 
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {featureMeta.map((feature, index) => (
          <MotionReveal
            key={feature.id}
            delay={index * 0.08}
            className="h-full"
          >
            <Card interactive className="group h-full p-2">
              <CardHeader>
                <div className={`mb-2 flex h-14 w-14 items-center justify-center rounded-xl ${feature.bg} transition-transform group-hover:scale-105`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} aria-hidden="true" />
                </div>
                <CardTitle className="text-base">{t(`features.items.${feature.id}.title`)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-semibold leading-relaxed text-muted-foreground">
                  {t(`features.items.${feature.id}.description`)}
                </p>
              </CardContent>
            </Card>
          </MotionReveal>
        ))}
      </div>
    </section>
  );
}
