"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { X } from "@/components/ui/icons";
import { useLayerHost } from "@/components/providers/LayerProvider";
import { cn } from "@/lib/utils";

export type SheetTone = "dark" | "light";
export type SheetSide = "right" | "bottom";

interface SheetContextValue {
  closeLabel: string;
  tone: SheetTone;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  tone?: SheetTone;
  side?: SheetSide;
  /** Accessible fallback name when no SheetTitle is rendered. */
  ariaLabel?: string;
  /** Accessible label for icon-only close controls. */
  closeLabel?: string;
}

const toneClasses: Record<SheetTone, string> = {
  dark: "border-transparent bg-[#1C1C1A] text-[#F0EEE9] shadow-2xl",
  light: "border-transparent bg-[#E6E3DC] text-[#1C1C1A] shadow-2xl",
};

export function Sheet({
  isOpen,
  onClose,
  children,
  className,
  tone = "light",
  side = "right",
  ariaLabel = "Side panel",
  closeLabel = "Close panel",
}: SheetProps) {
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const layerHost = useLayerHost();
  const isBottomSheet = side === "bottom";

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContext.Provider value={{ closeLabel, tone }}>
        <DialogPrimitive.Portal container={layerHost ?? undefined}>
          <DialogPrimitive.Overlay
            data-sheet-tone={tone}
            className={cn(
              "layer-backdrop fixed inset-0 opacity-0",
              isBottomSheet
                ? "bg-[#1C1C1A]/40 backdrop-blur-sm"
                : "bg-[#1C1C1A]/50",
              "transition-opacity duration-200 ease-out",
              "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
              "starting:data-[state=open]:opacity-0 motion-reduce:transition-none",
            )}
          />
          <DialogPrimitive.Content
            data-bagui="sheet"
            data-sheet-tone={tone}
            data-liquid-glass={tone === "light" ? "surface" : "dark"}
            data-solar-surface={tone === "light" ? "atelier" : undefined}
            aria-label={ariaLabel}
            tabIndex={-1}
            onOpenAutoFocus={() => {
              previouslyFocusedElementRef.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              previouslyFocusedElementRef.current?.focus({ preventScroll: true });
              previouslyFocusedElementRef.current = null;
            }}
            className={cn(
              isBottomSheet
                ? "layer-dialog sd-panel fixed inset-x-0 bottom-0 flex h-[min(85dvh,760px)] max-h-[85vh] w-full translate-y-full flex-col overflow-hidden rounded-t-[28px] border opacity-0 outline-none"
                : "layer-dialog sd-panel fixed inset-y-0 right-0 flex h-dvh w-full translate-x-full flex-col overflow-hidden rounded-l-[28px] border opacity-0 outline-none sm:max-w-md",
              isBottomSheet
                ? "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                : "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              isBottomSheet
                ? "data-[state=open]:translate-y-0 data-[state=open]:opacity-100"
                : "data-[state=open]:translate-x-0 data-[state=open]:opacity-100",
              isBottomSheet
                ? "data-[state=closed]:translate-y-full data-[state=closed]:opacity-0"
                : "data-[state=closed]:translate-x-full data-[state=closed]:opacity-0",
              isBottomSheet
                ? "starting:data-[state=open]:translate-y-full starting:data-[state=open]:opacity-0"
                : "starting:data-[state=open]:translate-x-full starting:data-[state=open]:opacity-0",
              "focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-inset motion-reduce:transition-none",
              toneClasses[tone],
              className,
            )}
          >
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </SheetContext.Provider>
    </DialogPrimitive.Root>
  );
}

export interface SheetContentProps {
  children: ReactNode;
  className?: string;
}

export function SheetContent({ children, className }: SheetContentProps) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {children}
    </div>
  );
}

export interface SheetHeaderProps {
  children: ReactNode;
  className?: string;
  showClose?: boolean;
  onClose?: () => void;
  closeLabel?: string;
}

export function SheetHeader({
  children,
  className,
  showClose = true,
  onClose,
  closeLabel,
}: SheetHeaderProps) {
  const context = useContext(SheetContext);
  const tone = context?.tone ?? "dark";
  const closeControl = (
    <button
      type="button"
      onClick={onClose}
      aria-label={closeLabel ?? context?.closeLabel ?? "Close panel"}
      className={cn(
        "solar-sheet-close ml-4 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 motion-reduce:transition-none",
        tone === "light"
          ? "text-[#4E4B44] hover:bg-[#A5C2DE]/10 hover:text-[#1C1C1A] focus-visible:ring-offset-[#F0EEE9]"
          : "text-[#CBC7BE] hover:bg-white/10 hover:text-[#F0EEE9] focus-visible:ring-offset-[#1C1C1A]",
      )}
    >
      <X aria-hidden="true" className="size-5" />
    </button>
  );

  return (
    <div
      data-sheet-section="header"
      className={cn(
        "flex shrink-0 items-center justify-between border-b px-6 pb-4 pt-6",
        tone === "light"
          ? "border-[#8E8B83]/15 bg-[#E6E3DC]"
          : "border-white/10 bg-[#1C1C1A]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {showClose
        ? onClose || !context
          ? closeControl
          : <DialogPrimitive.Close asChild>{closeControl}</DialogPrimitive.Close>
        : null}
    </div>
  );
}

export interface SheetTitleProps {
  children: ReactNode;
  className?: string;
}

export function SheetTitle({ children, className }: SheetTitleProps) {
  const tone = useContext(SheetContext)?.tone ?? "dark";

  return (
    <DialogPrimitive.Title asChild>
      <h3
        className={cn(
          "text-lg font-bold tracking-tight",
          tone === "light" ? "text-[#1C1C1A]" : "text-[#F0EEE9]",
          className,
        )}
      >
        {children}
      </h3>
    </DialogPrimitive.Title>
  );
}

export interface SheetDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function SheetDescription({
  children,
  className,
}: SheetDescriptionProps) {
  const tone = useContext(SheetContext)?.tone ?? "dark";

  return (
    <DialogPrimitive.Description
      className={cn(
        "mt-1 text-sm leading-5",
        tone === "light" ? "text-[#4E4B44]" : "text-[#CBC7BE]",
        className,
      )}
    >
      {children}
    </DialogPrimitive.Description>
  );
}

export interface SheetBodyProps {
  children: ReactNode;
  className?: string;
}

export function SheetBody({ children, className }: SheetBodyProps) {
  return (
    <div
      data-sheet-section="body"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface SheetFooterProps {
  children: ReactNode;
  className?: string;
}

export function SheetFooter({ children, className }: SheetFooterProps) {
  const tone = useContext(SheetContext)?.tone ?? "dark";

  return (
    <div
      data-sheet-section="footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-3 border-t px-6 py-4",
        tone === "light"
          ? "border-[#8E8B83]/15 bg-[#E6E3DC]"
          : "border-white/10 bg-[#1C1C1A]",
        className,
      )}
    >
      {children}
    </div>
  );
}
