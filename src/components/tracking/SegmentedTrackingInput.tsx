"use client";

import { useRef, type ClipboardEvent } from "react";
import { Clipboard, X } from "@/components/ui/icons";
import { formatTrackingInput } from "@/lib/trackingReference";
import { cn } from "@/lib/utils";

interface SegmentedTrackingInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  pasteLabel?: string;
  clearLabel?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}

function cleanTrackingInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
}

export default function SegmentedTrackingInput({
  value,
  onChange,
  className,
  id,
  disabled = false,
  placeholder = "SD-QT-123456",
  pasteLabel = "Paste reference",
  clearLabel = "Clear reference",
  ariaLabel = "Tracking reference number",
  ariaDescribedBy,
  ariaInvalid = false,
}: SegmentedTrackingInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (nextValue: string) => {
    onChange(cleanTrackingInput(nextValue));
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pastedText = event.clipboardData.getData("text");
    onChange(cleanTrackingInput(formatTrackingInput(pastedText)));
  };

  const handleBlur = () => {
    const formatted = cleanTrackingInput(formatTrackingInput(value));
    if (formatted !== value) onChange(formatted);
  };

  const pasteFromClipboard = async () => {
    try {
      const pastedText = await navigator.clipboard?.readText();
      if (pastedText) {
        onChange(cleanTrackingInput(formatTrackingInput(pastedText)));
      }
    } catch {
      // The native paste command remains available when clipboard permission is denied.
    } finally {
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className={cn(
        "solar-tracking-reference-shell group relative flex min-h-16 min-w-0 w-full items-center rounded-2xl border border-[#4F7FA8]/20 bg-white/45 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.7),0_12px_28px_-24px_rgb(15_23_42_/_0.42)] backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-200 ease-expo-out",
        "hover:border-[#4F7FA8]/40 hover:bg-white/65 focus-within:border-[#4F7FA8]/55 focus-within:bg-white/75 focus-within:shadow-[0_0_0_3px_rgb(183_209_234_/_0.42),0_16px_30px_-24px_rgb(15_23_42_/_0.44)]",
        ariaInvalid && "border-[#B86B4A]/60 bg-[#F8E8DE]/65 focus-within:border-[#B86B4A]/75 focus-within:shadow-[0_0_0_3px_rgb(216_168_123_/_0.28)]",
        disabled && "cursor-not-allowed opacity-65",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onPaste={handlePaste}
        onBlur={handleBlur}
        disabled={disabled}
        maxLength={12}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        className="solar-tracking-reference-input min-h-16 min-w-0 flex-1 rounded-2xl bg-transparent px-4 py-3 pr-24 font-mono text-base font-extrabold tracking-[0.04em] text-[#1C1C1A] outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-[#4E4B44]/75 disabled:cursor-not-allowed sm:pr-32"
      />

      <div className="absolute right-1.5 flex items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            disabled={disabled}
            aria-label={clearLabel}
            title={clearLabel}
            className="grid min-h-10 min-w-10 place-items-center rounded-full text-[#4E4B44] transition-colors duration-150 hover:bg-[#B7D1EA]/35 hover:text-[#1C1C1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7FA8]/55 disabled:pointer-events-none active:scale-95"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void pasteFromClipboard()}
          disabled={disabled}
          aria-label={pasteLabel}
          title={pasteLabel}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#4F7FA8]/22 bg-[#B7D1EA]/45 px-3 text-xs font-bold text-[#1C1C1A] shadow-sm transition-colors duration-150 hover:bg-[#B7D1EA]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7FA8]/55 disabled:pointer-events-none active:scale-95"
        >
          <Clipboard aria-hidden="true" className="size-4 text-[#3E6685]" />
          <span className="hidden sm:inline">{pasteLabel}</span>
        </button>
      </div>
    </div>
  );
}
