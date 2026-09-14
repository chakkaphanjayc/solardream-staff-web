"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LayerPortal } from "@/components/ui/layer-portal";

type MobileActionBarProps = {
  label: string;
  value: ReactNode;
  actionLabel: ReactNode;
  actionIcon?: ReactNode;
  helperText?: ReactNode;
  secondaryAction?: ReactNode;
  buttonClassName?: string;
  valueClassName?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "value">;

const MobileActionBar = forwardRef<HTMLButtonElement, MobileActionBarProps>(
  (
    {
      label,
      value,
      actionLabel,
      actionIcon,
      helperText,
      secondaryAction,
      className,
      buttonClassName,
      valueClassName,
      disabled,
      ...buttonProps
    },
    ref,
  ) => {
    return (
      <LayerPortal layer="floating">
      <div
        data-bagui="mobile-action-bar"
        data-solar-surface="atelier"
        className={cn(
          "solar-route-action-bar sd-safe-pb-4-max fixed bottom-0 left-0 right-0 z-40 px-4 py-3 lg:hidden",
          className,
        )}
      >
        <div className="mx-auto flex max-w-3xl flex-row items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#475569]">
              {label}
            </p>
            <div
              className={cn(
                "truncate text-lg font-black text-black",
                valueClassName,
              )}
            >
              {value}
            </div>
            {helperText ? (
              <p className="mt-0.5 text-xs font-bold leading-5 text-slate-600">
                {helperText}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {secondaryAction}
            <Button
              ref={ref}
              type="button"
              size="lg"
              disabled={disabled}
              className={cn(
                "solar-route-action-button shrink-0 px-5 py-2.5 text-sm font-black",
                buttonClassName,
              )}
              {...buttonProps}
            >
              <span>{actionLabel}</span>
              {actionIcon}
            </Button>
          </div>
        </div>
      </div>
      </LayerPortal>
    );
  },
);

MobileActionBar.displayName = "MobileActionBar";

export default MobileActionBar;
