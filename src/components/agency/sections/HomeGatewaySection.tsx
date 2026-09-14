import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, Calculator, MessageSquare, WandSparkles } from "@/components/ui/icons";
import SectionReveal from "../SectionReveal";
import Footer from "@/components/layout/Footer";
import { cn } from "@/lib/utils";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import { Card } from "@/components/ui/card";

type Gateway = Readonly<{
  title: string;
  description: string;
  href: string;
  action: string;
  icon: typeof Calculator;
  featured: boolean;
}>;

type HomeGatewaySectionProps = Readonly<{
  locale: string;
  latestNewsTitle?: string;
  solarSizeKw: number;
  websiteSettings: WebsiteSettings;
}>;

export default function HomeGatewaySection({ locale, latestNewsTitle, solarSizeKw, websiteSettings }: HomeGatewaySectionProps) {
  const t = useTranslations("HomeGatewaySection");

  const gateways: readonly Gateway[] = [
    {
      title: t("buildTitle"),
      description: t("buildDesc"),
      href: `/${locale}/build?kw=${solarSizeKw}`,
      action: t("buildAction", { kw: solarSizeKw }),
      icon: Calculator,
      featured: true,
    },
    {
      title: t("wizardTitle"),
      description: t("wizardDesc"),
      href: `/${locale}/wizard`,
      action: t("wizardAction"),
      icon: WandSparkles,
      featured: true,
    },
    {
      title: t("newsTitle"),
      description: latestNewsTitle ? t("newsDescLatest", { title: latestNewsTitle }) : t("newsDesc"),
      href: `/${locale}/news`,
      action: t("newsAction"),
      icon: BookOpen,
      featured: false,
    },
    {
      title: t("forumTitle"),
      description: t("forumDesc"),
      href: `/${locale}/forum`,
      action: t("forumAction"),
      icon: MessageSquare,
      featured: false,
    },
  ];

  return (
    <SectionReveal disableReveal id="services" className="flex min-h-[100svh] flex-col justify-between overflow-y-auto lg:overflow-hidden bg-transparent pt-16 sm:pt-20 lg:pt-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 w-full flex-grow flex flex-col justify-center">
        <div data-parallax="10" className="flex flex-col justify-between gap-3 border-t border-slate-200/80 pt-3 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#0369a1]">{t("subtitle")}</p>
            <h2 className="max-w-4xl text-balance text-[clamp(1.65rem,3.2vw,3rem)] font-extrabold leading-[1.1] tracking-tighter text-slate-900">
              {t("title")}
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs font-medium leading-relaxed text-slate-600 sm:text-sm">
              {t("description")}
            </p>
          </div>
        </div>

        <div data-parallax="-10" className="mt-3 sm:mt-4 grid gap-3 sm:gap-4 md:grid-cols-2">
          {gateways.map((gateway) => {
            const Icon = gateway.icon;
            return (
              <Card
                key={gateway.title}
                asChild
                interactive
                className={cn(
                  "motion-lift group overflow-hidden p-4 backdrop-blur-md sm:p-5 lg:p-4",
                  gateway.featured
                    ? "border-primary/60 bg-card hover:border-primary"
                    : "border-border/70 bg-card/85 hover:bg-card",
                )}
              >
                <Link
                  href={gateway.href}
                  data-analytics-event="primary_cta_clicked"
                  data-analytics-cta={gateway.href.includes("/build") ? "home_build_gateway" : gateway.href.includes("/wizard") ? "home_wizard_gateway" : "home_resource_gateway"}
                  data-analytics-position="gateway"
                  className="block"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl border",
                      gateway.featured
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-card text-primary-foreground",
                    )}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className={cn("mt-2 h-0.5 w-8 transition-all duration-300 group-hover:w-14", gateway.featured ? "bg-primary" : "bg-foreground")} />
                  </div>
                  <h3 className="mt-2.5 text-lg font-extrabold tracking-tight text-foreground sm:text-xl lg:text-[clamp(1.15rem,2.2vh,1.45rem)]">{gateway.title}</h3>
                  <p className="mt-1 min-h-0 text-xs font-medium leading-relaxed text-muted-foreground sm:text-sm">{gateway.description}</p>
                  <p className={cn("mt-2 text-xs font-black sm:text-sm", gateway.featured ? "text-primary-foreground" : "text-foreground")}>{gateway.action}</p>
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
      <div className="mt-3 w-full shrink-0">
        <Footer settings={websiteSettings} compact />
      </div>
    </SectionReveal>
  );
}
