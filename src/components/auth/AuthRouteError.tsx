"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ShieldAlert } from "@/components/ui/icons";

type AuthRouteErrorProps = {
  reset: () => void;
};

export default function AuthRouteError({ reset }: AuthRouteErrorProps) {
  const locale = useLocale();
  const t = useTranslations("AuthPage");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-lg rounded-xl bg-white p-6 sm:p-8">
        <Link
          href={`/${locale}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("homeAriaLabel")}
        >
          <Image src="/asset/sd-logo.png" alt="" width={42} height={42} className="h-9 w-auto" />
          <span className="text-xl font-extrabold tracking-[-0.025em] text-foreground">
            Solar<span className="text-[#4F7FA8]">Dream</span>
          </span>
        </Link>

        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-800">
          <ShieldAlert aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-foreground">{t("routeErrorTitle")}</h1>
        <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
          {t("routeErrorDescription")}
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={reset} className="sm:flex-1">
            {t("tryAgain")}
          </Button>
          <Button asChild variant="outline" className="bg-white sm:flex-1">
            <Link href={`/${locale}`}>{t("backToHome")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
