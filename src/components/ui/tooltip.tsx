"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { useLayerHost } from "@/components/providers/LayerProvider";
import { cn } from "@/lib/utils";

interface TooltipTriggerChildProps {
  disabled?: boolean;
  href?: string;
  id?: string;
  role?: React.AriaRole;
  tabIndex?: number;
}

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  wrapperClassName?: string;
  align?: React.ComponentPropsWithoutRef<
    typeof TooltipPrimitive.Content
  >["align"];
  delayDuration?: number;
  side?: React.ComponentPropsWithoutRef<
    typeof TooltipPrimitive.Content
  >["side"];
  sideOffset?: number;
}

function isInteractiveElement(
  element: React.ReactElement<TooltipTriggerChildProps>,
): boolean {
  if (element.props.disabled) return false;
  if (
    element.props.tabIndex !== undefined &&
    element.props.tabIndex >= 0
  ) {
    return true;
  }
  if (element.props.role === "button" || element.props.role === "link") {
    return true;
  }
  if (typeof element.type !== "string") return false;
  if (element.type === "a") return Boolean(element.props.href);
  return ["button", "input", "select", "summary", "textarea"].includes(
    element.type,
  );
}

export function Tooltip({
  align = "center",
  children,
  content,
  delayDuration = 350,
  side = "top",
  sideOffset = 8,
  wrapperClassName,
}: TooltipProps) {
  const layerHost = useLayerHost();
  const reactId = React.useId();
  const triggerId = `tooltip-trigger-${reactId}`;
  const contentId = `tooltip-content-${reactId}`;
  const child = React.isValidElement<TooltipTriggerChildProps>(children)
    ? children
    : null;
  const useChildAsTrigger = child ? isInteractiveElement(child) : false;

  const trigger = useChildAsTrigger ? (
    child
  ) : (
    <div tabIndex={0}>{children}</div>
  );

  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={250}
    >
      <TooltipPrimitive.Root delayDuration={delayDuration}>
        <TooltipPrimitive.Trigger
          asChild
          id={child?.props.id ?? triggerId}
          className={
            useChildAsTrigger
              ? wrapperClassName
              : cn(
                  "relative inline-block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  wrapperClassName,
                )
          }
        >
          {trigger}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={layerHost ?? undefined}>
          <TooltipPrimitive.Content
            id={contentId}
            align={align}
            side={side}
            sideOffset={sideOffset}
            collisionPadding={8}
            avoidCollisions
            data-bagui="tooltip-content"
            className={cn(
              "layer-tooltip max-w-xs select-none rounded-lg bg-[#0F172A] px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-sm",
              "origin-[var(--radix-tooltip-content-transform-origin)] data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in motion-reduce:animate-none",
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-[#0F172A]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
