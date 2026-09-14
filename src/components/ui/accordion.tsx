"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";

import { ChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    data-bagui="accordion-item"
    className={cn(
      "rounded-2xl bg-[#E6E3DC] border border-[#CBC7BE] mb-3 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:shadow-[0_2px_8px_rgba(28,28,26,0.08)]",
      className,
    )}
    {...props}
  />
));
AccordionItem.displayName = AccordionPrimitive.Item.displayName;

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ children, className, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      data-bagui="accordion-trigger"
      className={cn(
        "group flex min-h-14 flex-1 items-center justify-between gap-4 px-6 py-4 text-left text-base font-semibold text-[#1C1C1A]",
        "transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#A5C2DE]/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronDown
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-[#4F7FA8] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-data-[state=open]:rotate-180 motion-reduce:transition-none"
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ children, className, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    data-bagui="accordion-content"
    className={cn(
      "overflow-hidden text-sm text-[#4E4B44] data-[state=open]:animate-fade-in motion-reduce:animate-none",
      className,
    )}
    {...props}
  >
    <div className="px-6 pb-5 pt-1 leading-relaxed">{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
