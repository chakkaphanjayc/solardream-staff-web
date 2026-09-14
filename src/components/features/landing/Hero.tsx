"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MotionReveal } from "@/components/ui/motion-reveal";

export default function Hero() {
  const t = useTranslations("Landing");

  return (
    <section className="relative isolate flex min-h-[80vh] items-center justify-center overflow-hidden px-4 py-20">
      <div className="relative z-10 mx-auto max-w-5xl space-y-8 text-center">
        <MotionReveal>
          <Badge variant="info" className="gap-2 px-4 py-1.5 text-sm">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{t("hero.eyebrow")}</span>
          </Badge>
        </MotionReveal>

        <MotionReveal delay={0.12}>
          <h1 className="text-balance text-5xl font-black leading-[1.1] tracking-tight text-foreground md:text-8xl">
            {t("hero.titleLineOne")} <br />
            {t("hero.titleLineTwo")}
          </h1>
        </MotionReveal>

        <MotionReveal delay={0.2}>
          <p className="mx-auto max-w-3xl text-xl font-semibold text-muted-foreground md:text-2xl">
            {t("hero.description")}
          </p>
        </MotionReveal>

        <MotionReveal
          delay={0.28}
          className="flex flex-col items-center justify-center gap-4 pt-8 sm:flex-row"
        >
          <Button asChild size="lg" className="group">
            <Link href="/wizard">
              <span>{t("hero.estimator")}</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/services">{t("hero.services")}</Link>
          </Button>
        </MotionReveal>
      </div>
    </section>
  );
}
