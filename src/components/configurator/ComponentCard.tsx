"use client";

import Image from "next/image";
import { Check } from "@/components/ui/icons";
import { Component } from "@/types";
import { cn, formatPrice } from "@/lib/utils";
import { useConfiguratorStore } from "@/store/useConfiguratorStore";
import { useCurrencyStore } from "@/store/useCurrencyStore";
import { GsapReveal } from "@/components/ui/GsapMotion";
import { useTranslations } from "next-intl";

interface ComponentCardProps {
  component: Component;
}

export default function ComponentCard({ component }: ComponentCardProps) {
  const t = useTranslations("ConfiguratorComponentCard");
  const { selectedComponents, selectComponent } = useConfiguratorStore();
  const activeCurrency = useCurrencyStore((state) => state.currency);
  const isSelected = selectedComponents[component.category]?.id === component.id;

  return (
    <div
      onClick={() => selectComponent(component)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectComponent(component);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t("selectComponent", { name: component.name })}
      aria-pressed={isSelected}
      className={cn(
        "group relative cursor-pointer rounded-2xl border bg-brand-surface/50 p-4 transition-all duration-300 hover:scale-[1.02] outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm",
        isSelected 
          ? "border-primary ring-2 ring-primary/20 bg-primary/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]" 
          : "border-slate-200/50 hover:border-primary/50 hover:shadow-md"
      )}
    >
      {isSelected && (
        <GsapReveal from="none" className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-lg">
          <Check className="h-4 w-4 text-white" />
        </GsapReveal>
      )}

      <div className="relative mb-4 aspect-square overflow-hidden rounded-xl bg-secondary/30">
        {component.imageUrl && component.imageUrl.trim() !== "" ? (
          <Image
            src={component.imageUrl}
            alt={component.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/20 text-muted-foreground text-xs">
            {t("noImage")}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="space-y-1">
        <h3 className="font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors">
          {component.name}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
          {component.description}
        </p>
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xl font-black text-primary">
            {formatPrice(component.price)}
          </span>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md",
            isSelected ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
          )}>
            {isSelected ? t("selected") : t("select")}
          </span>
        </div>
      </div>
    </div>
  );
}
