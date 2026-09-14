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

export type DialogTone = "dark" | "light";

interface DialogContextValue {
  closeLabel: string;
  tone: DialogTone;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error("Dialog layout components must be used within <Dialog>");
  }

  return context;
}

export interface DialogProps {
  /** Controlled open state. */
  isOpen: boolean;
  /** Called when the user requests to close the dialog. */
  onClose: () => void;
  children: ReactNode;
  /** Additional class names applied to the Radix dialog panel. */
  className?: string;
  size?: "full" | "md" | "sm";
  /** Visual surface treatment. Dark remains the compatibility default. */
  tone?: DialogTone;
  /** Accessible fallback name when no DialogTitle is rendered. */
  ariaLabel?: string;
  /** Accessible label for icon-only close controls. */
  closeLabel?: string;
  /** Prevent Escape and outside-pointer dismissal for blocking progress states. */
  dismissible?: boolean;
}

const sizeClasses: Record<NonNullable<DialogProps["size"]>, string> = {
  full:
    "h-[85dvh] max-h-[85vh] w-[92vw] md:max-w-3xl lg:max-w-5xl xl:max-w-6xl",
  md: "max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg",
  sm: "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md",
};

const toneClasses: Record<DialogTone, string> = {
  dark:
    "border border-transparent bg-[#1C1C1A] text-[#F0EEE9] shadow-2xl focus-visible:ring-offset-[#1C1C1A]",
  light:
    "border border-transparent bg-[#E6E3DC] text-[#1C1C1A] shadow-2xl focus-visible:ring-offset-[#F0EEE9]",
};

export function Dialog({
  isOpen,
  onClose,
  children,
  className,
  size = "full",
  tone = "light",
  ariaLabel = "Dialog",
  closeLabel = "Close dialog",
  dismissible = true,
}: DialogProps) {
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const layerHost = useLayerHost();

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && dismissible) onClose();
      }}
    >
      <DialogContext.Provider value={{ closeLabel, tone }}>
        <DialogPrimitive.Portal container={layerHost ?? undefined}>
          <DialogPrimitive.Overlay
            data-dialog-tone={tone}
            className={cn(
              "layer-backdrop fixed inset-0 backdrop-blur-md opacity-0",
              tone === "light" ? "bg-[#1C1C1A]/40" : "bg-[#1C1C1A]/75",
              "transition-opacity duration-200 ease-out",
              "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
              "starting:data-[state=open]:opacity-0 motion-reduce:transition-none",
            )}
          />
          <DialogPrimitive.Content
            data-bagui="dialog"
            data-dialog-tone={tone}
            data-liquid-glass={tone === "light" ? "surface" : "dark"}
            data-solar-surface={tone === "light" ? "atelier" : undefined}
            aria-label={ariaLabel}
            tabIndex={-1}
            onEscapeKeyDown={(event) => {
              if (!dismissible) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (!dismissible) event.preventDefault();
            }}
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
              "layer-dialog sd-panel fixed left-1/2 top-1/2 flex -translate-x-1/2 translate-y-[calc(-50%+1rem)] scale-[0.92] flex-col overflow-hidden rounded-[28px] border opacity-0 outline-none",
              "transition-[opacity,translate,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              "data-[state=open]:-translate-y-1/2 data-[state=open]:scale-100 data-[state=open]:opacity-100",
              "data-[state=closed]:translate-y-[calc(-50%+1rem)] data-[state=closed]:scale-[0.92] data-[state=closed]:opacity-0",
              "starting:data-[state=open]:translate-y-[calc(-50%+1rem)] starting:data-[state=open]:scale-[0.92] starting:data-[state=open]:opacity-0",
              "focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 motion-reduce:transition-none",
              sizeClasses[size],
              toneClasses[tone],
              className,
            )}
          >
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogContext.Provider>
    </DialogPrimitive.Root>
  );
}

export interface DialogHeaderProps {
  children?: ReactNode;
  className?: string;
  /** Show a default close button in the top-right corner. */
  showClose?: boolean;
  /** Overrides the root close label for this control. */
  closeLabel?: string;
}

export function DialogHeader({
  children,
  className,
  showClose = true,
  closeLabel,
}: DialogHeaderProps) {
  const context = useDialogContext();
  const isLight = context.tone === "light";

  return (
    <div
      data-dialog-section="header"
      className={cn(
        "flex shrink-0 items-start justify-between px-6 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {showClose ? (
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            aria-label={closeLabel ?? context.closeLabel}
            className={cn(
              "solar-dialog-close ml-4 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 motion-reduce:transition-none",
              isLight
                ? "text-[#4E4B44] hover:bg-[#A5C2DE]/10 hover:text-[#1C1C1A] focus-visible:ring-offset-[#F0EEE9]"
                : "text-[#CBC7BE] hover:bg-white/10 hover:text-[#F0EEE9] focus-visible:ring-offset-[#1C1C1A]",
            )}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

export interface DialogBodyProps {
  children?: ReactNode;
  className?: string;
}

export function DialogBody({ children, className }: DialogBodyProps) {
  return (
    <div
      data-dialog-section="body"
      className={cn(
        "min-h-0 max-h-[85dvh] flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable] sm:px-8 sm:py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface DialogFooterProps {
  children?: ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div
      data-dialog-section="footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-3 px-6 py-5 sm:px-8 sm:py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface DialogContentProps {
  children?: ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {children}
    </div>
  );
}

export interface DialogTitleProps {
  children?: ReactNode;
  className?: string;
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  const { tone } = useDialogContext();

  return (
    <DialogPrimitive.Title
      className={cn(
        "text-xl font-bold tracking-tight",
        tone === "light" ? "text-[#1C1C1A]" : "text-[#F0EEE9]",
        className,
      )}
    >
      {children}
    </DialogPrimitive.Title>
  );
}

export interface DialogDescriptionProps {
  children?: ReactNode;
  className?: string;
}

export function DialogDescription({
  children,
  className,
}: DialogDescriptionProps) {
  const { tone } = useDialogContext();

  return (
    <DialogPrimitive.Description
      className={cn(
        "mt-2 text-sm leading-6",
        tone === "light" ? "text-[#4E4B44]" : "text-[#CBC7BE]",
        className,
      )}
    >
      {children}
    </DialogPrimitive.Description>
  );
}

export interface DialogCloseButtonProps {
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function DialogCloseButton({
  children,
  className,
  ariaLabel,
}: DialogCloseButtonProps) {
  const { tone } = useDialogContext();

  return (
    <DialogPrimitive.Close asChild>
      <button
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "solar-dialog-close-action inline-flex min-h-11 items-center justify-center rounded-full px-6 py-2.5 text-xs font-bold transition-all duration-200 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 motion-reduce:transition-none",
          tone === "light"
            ? "text-[#4E4B44] hover:bg-[#A5C2DE]/10 hover:text-[#1C1C1A] focus-visible:ring-offset-[#F0EEE9]"
            : "text-[#CBC7BE] hover:bg-white/10 hover:text-[#F0EEE9] focus-visible:ring-offset-[#1C1C1A]",
          className,
        )}
      >
        {children ?? "Cancel"}
      </button>
    </DialogPrimitive.Close>
  );
}
