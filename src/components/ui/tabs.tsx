"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    data-bagui="tabs"
    className={cn("min-w-0", className)}
    {...props}
  />
));
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-bagui="tabs-list"
    className={cn(
      "inline-flex min-h-12 max-w-full items-center gap-1.5 overflow-visible rounded-full border border-[#CBC7BE] bg-[#F7F6F3] p-1.5 text-[#4E4B44]",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-bagui="tabs-trigger"
    className={cn(
      "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2 text-sm font-medium text-[#4E4B44]",
      "transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#A5C2DE]/10 hover:text-[#1C1C1A]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0EEE9]",
      "disabled:pointer-events-none disabled:opacity-50 active:scale-95",
      "data-[state=active]:bg-[#B7D1EA] data-[state=active]:font-semibold data-[state=active]:text-[#142533] data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-bagui="tabs-content"
    className={cn(
      "mt-4 min-w-0 outline-none data-[state=active]:animate-fade-in motion-reduce:animate-none",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
