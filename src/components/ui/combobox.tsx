"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  buttonLabel?: string;
  className?: string;
  disabled?: boolean;
  variant?: "default" | "admin";
}

export default function Combobox({
  options,
  value = null,
  onSelect,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyText = "No options found.",
  buttonLabel,
  className,
  disabled = false,
  variant = "default",
}: ComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectedOption = options.find((option) => option.value === value) || null;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      return [option.label, option.description || "", option.value]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [options, query]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-3 rounded-2xl border text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 px-4 py-3",
          variant === "admin"
            ? "border-slate-800 bg-[#141B2D] text-slate-300 hover:border-[#06B6D4] hover:text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-[#1CBBBB] hover:text-slate-900"
        )}
      >
        <span className="min-w-0 truncate">{buttonLabel || selectedOption?.label || placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && !disabled && (
        <div
          className={cn(
            "absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full overflow-hidden rounded-2xl border",
            variant === "admin"
              ? "border-slate-800 bg-[#141B2D] shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
              : "border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)]"
          )}
        >
          <div className={cn("border-b px-3 py-3", variant === "admin" ? "border-slate-800" : "border-slate-100")}>
            <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", variant === "admin" ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-50")}>
              <Search className={cn("h-4 w-4 shrink-0", variant === "admin" ? "text-slate-500" : "text-slate-400")} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  "w-full bg-transparent text-sm font-medium outline-none",
                  variant === "admin" ? "text-slate-200 placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"
                )}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className={cn("px-3 py-8 text-center text-xs font-semibold uppercase tracking-widest", variant === "admin" ? "text-slate-500" : "text-slate-400")}>
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      onSelect(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                      variant === "admin"
                        ? "hover:bg-slate-800/80"
                        : "hover:bg-slate-50",
                      isSelected && (variant === "admin" ? "bg-[#06B6D4]/10" : "bg-[#1CBBBB]/8")
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        variant === "admin" ? "text-[#06B6D4]" : "text-[#1CBBBB]",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold", variant === "admin" ? "text-slate-200" : "text-slate-900")}>
                        {option.label}
                      </span>
                      {option.description && (
                        <span className={cn("mt-0.5 block text-xs", variant === "admin" ? "text-slate-500" : "text-slate-500")}>
                          {option.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
