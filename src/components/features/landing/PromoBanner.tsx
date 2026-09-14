"use client";

import { Timer, Zap } from "@/components/ui/icons";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MotionReveal } from "@/components/ui/motion-reveal";

export default function PromoBanner() {
  const t = useTranslations("Landing");

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <MotionReveal>
        <Card className="relative overflow-hidden p-8 md:p-12">
        
        <div className="flex flex-col items-center justify-between gap-8 lg:flex-row">
          <div className="space-y-4 text-center lg:text-left">
            <Badge variant="info" className="gap-1.5">
              <Zap className="h-3 w-3 fill-current" aria-hidden="true" />
              {t("promo.eyebrow")}
            </Badge>
            <h2 className="text-balance text-2xl font-black tracking-tight text-foreground md:text-3xl">
              {t("promo.titleLineOne")} <span className="text-primary-foreground">{t("promo.titleAccent")}</span> <br />
              {t("promo.titleLineTwo")}
            </h2>
            <p className="max-w-xl text-xs font-semibold leading-relaxed text-muted-foreground">
              {t("promo.description")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-6 rounded-xl border border-border bg-muted p-6">
            <div className="flex items-center gap-3 text-primary-foreground">
              <Timer className="h-8 w-8" aria-hidden="true" />
              <div className="flex flex-col">
                <span className="font-mono text-xl font-black leading-none">14:23:05</span>
                <span className="mt-1 text-[9px] font-black tracking-widest text-muted-foreground">{t("promo.timerLabel")}</span>
              </div>
            </div>
            <div className="h-10 w-px bg-border" />
            <Button asChild size="sm">
              <Link href="/wizard">{t("promo.action")}</Link>
            </Button>
          </div>
        </div>
        </Card>
      </MotionReveal>
    </section>
  );
}
