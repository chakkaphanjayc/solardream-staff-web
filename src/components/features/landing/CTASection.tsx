"use client";

import Link from "next/link";
import { Zap, ShieldCheck } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MotionReveal } from "@/components/ui/motion-reveal";

export default function CTASection() {
  const t = useTranslations("Landing");

  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <MotionReveal>
        <Card tone="accent" className="relative space-y-8 overflow-hidden p-10 text-center md:p-16">
        
        <h2 className="text-balance text-4xl font-black tracking-tight text-foreground md:text-5xl">
          {t("cta.titleLineOne")} <br />
          <span className="text-primary-foreground">{t("cta.titleLineTwo")}</span>
        </h2>
        <p className="mx-auto max-w-xl text-base font-semibold leading-relaxed text-muted-foreground">
          {t("cta.description")}
        </p>
 
        <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/wizard">
              <Zap className="h-4 w-4 fill-current" aria-hidden="true" />
              {t("cta.estimator")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/services">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("cta.services")}
            </Link>
          </Button>
        </div>
 
        <div className="flex flex-wrap items-center justify-center gap-6 pt-8 text-xs font-black tracking-widest text-muted-foreground">
          <span>{t("cta.trust.longi")}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span>{t("cta.trust.huawei")}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span>{t("cta.trust.jinko")}</span>
        </div>
        </Card>
      </MotionReveal>
    </section>
  );
}
