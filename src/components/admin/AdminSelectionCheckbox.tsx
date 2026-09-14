"use client";

import { useEffect, useRef } from "react";

interface AdminSelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function AdminSelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  className = "",
}: AdminSelectionCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate && !checked;
    }
  }, [checked, indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
      className={`h-4 w-4 rounded border-[#475569] bg-[#0B1121] text-[#B7D1EA] accent-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/40 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  );
}
