"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/mock-data";
import { Category, Component } from "@/types";
import ComponentCard from "./ComponentCard";
import PreviewSidebar from "./PreviewSidebar";
import { cn } from "@/lib/utils";

import { useRealtimeInventory } from "@/hooks/useRealtimeInventory";
import Skeleton from "@/components/ui/skeleton";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Configurator({ 
  initialComponents
}: { 
  initialComponents: Component[]
}) {
  const { products: components, isReady } = useRealtimeInventory(initialComponents);
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);

  const filteredComponents = components.filter(
    (c) => c.category === activeCategory
  );

  if (!isReady) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-8">
            <div className="space-y-3">
              <Skeleton className="h-12 w-2/3 rounded-3xl bg-slate-200/40" />
              <Skeleton className="h-5 w-full max-w-2xl rounded-full bg-slate-200/35" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-28 shrink-0 rounded-full bg-slate-200/40" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} tone="subtle" className="space-y-4 p-4">
                  <Skeleton className="aspect-square w-full rounded-2xl bg-slate-200/35" />
                  <Skeleton className="h-5 w-3/4 rounded-full bg-slate-200/45" />
                  <Skeleton className="h-4 w-full rounded-full bg-slate-200/35" />
                  <Skeleton className="h-4 w-2/3 rounded-full bg-slate-200/35" />
                </Card>
              ))}
            </div>
          </div>
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <div className="rounded-3xl border border-slate-200/60 bg-[#F0EEE9]/80 p-6 space-y-4 shadow-sm">
              <Skeleton className="h-6 w-40 rounded-full bg-slate-200/40" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full rounded-2xl bg-slate-200/35" />
                ))}
              </div>
              <Skeleton className="h-12 w-full rounded-2xl bg-slate-200/40" />
              <Skeleton className="h-12 w-full rounded-2xl bg-[#B7D1EA]/35" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 lg:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Content */}
        <div className="lg:col-span-8 space-y-8">
          <header className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Configure Your <span className="text-gradient">Dream PC</span>
            </h1>
            <p className="text-muted-foreground text-base max-w-2xl sm:text-lg">
              Select premium components to build a high-performance machine tailored to your needs.
            </p>
          </header>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" role="tablist" aria-label="PC Component Categories">
            {CATEGORIES.map((category) => (
              <Button
                key={category}
                variant={activeCategory === category ? "primary" : "secondary"}
                role="tab"
                aria-selected={activeCategory === category}
                aria-controls={`panel-${category}`}
                id={`tab-${category}`}
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "shrink-0 px-6 py-2.5 text-sm font-bold whitespace-nowrap",
                  activeCategory === category
                    ? "scale-105 shadow-lg shadow-primary/20"
                    : "hover:bg-secondary/80"
                )}
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Component Grid */}
          <MotionReveal
            key={activeCategory}
            className="grid grid-cols-1 gap-6 md:grid-cols-2"
            role="tabpanel"
            id={`panel-${activeCategory}`}
            aria-labelledby={`tab-${activeCategory}`}
          >
            {filteredComponents.length > 0 ? (
              filteredComponents.map((component) => (
                <ComponentCard key={component.id} component={component} />
              ))
            ) : (
              <Card tone="subtle" className="col-span-full py-20 text-center">
                <p className="text-muted-foreground italic">
                  No components available in this category yet.
                </p>
              </Card>
            )}
          </MotionReveal>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 lg:sticky lg:top-24">
          <PreviewSidebar />
        </div>
      </div>
    </div>
  );
}
