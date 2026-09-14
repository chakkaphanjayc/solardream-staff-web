"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Calendar, Laptop } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import ProgressiveImage from "@/components/ui/progressive-image";
import { formatPrice } from "@/lib/utils";
import type { SavedBuildConfiguration } from "@/types/profile";

export default function SavedBuildsTab({
  configurations,
}: {
  configurations: SavedBuildConfiguration[];
}) {
  const t = useTranslations("SavedBuilds");
  const locale = useLocale();

  if (configurations.length === 0) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center px-4 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <Laptop className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">{t("emptyTitle")}</h2>
        <p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">
          {t("emptyDescription")}
        </p>
        <Button asChild className="mt-6">
          <Link href="/builder">{t("startConfiguring")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h2>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <div className="mt-7 divide-y divide-border border-y border-border">
        {configurations.map((config) => {
          const buildName = typeof config.name === "string" && config.name.trim()
            ? config.name
            : t("untitled", { id: config.id.slice(0, 8) });

          return (
            <article key={config.id} className="py-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  <time dateTime={new Date(config.createdAt).toISOString()}>
                    {new Date(config.createdAt).toLocaleDateString(locale === "th" ? "th-TH" : "en-US")}
                  </time>
                </div>
                <h3 className="mt-2 text-lg font-bold tracking-tight text-foreground">{buildName}</h3>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <div className="flex -space-x-2">
                    {config.products.slice(0, 3).map((product) => (
                      <div
                        key={product.id}
                        className="relative h-11 w-11 overflow-hidden rounded-lg border-2 border-card bg-muted"
                      >
                        <ProgressiveImage
                          src={product.imageUrl && product.imageUrl.trim() !== ""
                            ? product.imageUrl
                            : "/images/placeholder.png"}
                          alt={product.name}
                          fill
                          sizes="44px"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                    {config.products.length > 3 && (
                      <span className="grid h-11 w-11 place-items-center rounded-lg border-2 border-card bg-muted text-xs font-semibold text-foreground">
                        +{config.products.length - 3}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("total")}
                    </p>
                    <p className="mt-1 text-base font-bold text-foreground">{formatPrice(config.totalPrice)}</p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
