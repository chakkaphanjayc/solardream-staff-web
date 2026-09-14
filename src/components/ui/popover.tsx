"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { useLayerHost } from "@/components/providers/LayerProvider";
import { cn } from "@/lib/utils";

interface PopoverIds {
  contentId: string;
  open: boolean;
  triggerId: string;
}

const PopoverIdsContext = React.createContext<PopoverIds | null>(null);

function usePopoverIds(): PopoverIds {
  const context = React.useContext(PopoverIdsContext);
  if (!context) {
    throw new Error("Popover components must be used within <Popover>");
  }
  return context;
}

export type PopoverProps = React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Root
>;

function Popover({
  children,
  defaultOpen = false,
  onOpenChange,
  open: controlledOpen,
  ...props
}: PopoverProps) {
  const reactId = React.useId();
  const [uncontrolledOpen, setUncontrolledOpen] =
    React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const triggerId = `popover-trigger-${reactId}`;
  const contentId = `popover-content-${reactId}`;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const ids = React.useMemo(
    () => ({ contentId, open, triggerId }),
    [contentId, open, triggerId],
  );

  return (
    <PopoverIdsContext.Provider value={ids}>
      <PopoverPrimitive.Root
        {...props}
        open={controlledOpen}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
      >
        {children}
      </PopoverPrimitive.Root>
    </PopoverIdsContext.Provider>
  );
}

const PopoverTrigger = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(({ id, "aria-controls": ariaControls, ...props }, ref) => {
  const { contentId, open, triggerId } = usePopoverIds();

  return (
    <PopoverPrimitive.Trigger
      ref={ref}
      id={id ?? triggerId}
      aria-controls={ariaControls ?? (open ? contentId : undefined)}
      {...props}
    />
  );
});
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName;

const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    {
      align = "end",
      avoidCollisions = true,
      children,
      className,
      collisionPadding = 12,
      id,
      sideOffset = 8,
      "aria-labelledby": ariaLabelledBy,
      ...props
    },
    ref,
  ) => {
    const { contentId, triggerId } = usePopoverIds();
    const layerHost = useLayerHost();

    return (
      <PopoverPrimitive.Portal container={layerHost ?? undefined}>
        <PopoverPrimitive.Content
          ref={ref}
          id={id ?? contentId}
          aria-labelledby={ariaLabelledBy ?? triggerId}
          align={align}
          avoidCollisions={avoidCollisions}
          collisionPadding={collisionPadding}
          sideOffset={sideOffset}
          data-bagui="popover-content"
          data-liquid-glass="popover"
          className={cn(
            "layer-popover max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-1.5rem))] max-w-[min(var(--radix-popover-content-available-width),calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[#CBC7BE] bg-[#F7F6F3] p-2 text-[#1C1C1A] shadow-[0_4px_12px_rgba(28,28,26,0.12)] outline-none",
            "origin-[var(--radix-popover-content-transform-origin)] data-[state=open]:animate-ios-popover-in data-[state=closed]:animate-ios-popover-out motion-reduce:animate-none",
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    );
  },
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const PopoverArrow = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow>
>(({ className, ...props }, ref) => (
  <PopoverPrimitive.Arrow
    ref={ref}
    className={cn("fill-popover", className)}
    {...props}
  />
));
PopoverArrow.displayName = PopoverPrimitive.Arrow.displayName;

export {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
};
