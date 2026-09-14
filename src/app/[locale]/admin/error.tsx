"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AlertCircle, RefreshCcw } from "@/components/ui/icons";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (
      error.message?.includes("Failed to find Server Action") ||
      error.message?.includes("older or newer deployment")
    ) {
      window.location.reload();
      return;
    }
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-[32px] border border-slate-800 bg-[#0F172A] p-8 text-center shadow-none">
        <div
          aria-hidden="true"
          className="pointer-events-none mx-auto mb-2 h-28 w-28"
        >
          <Image
            src="/asset/solia-miffed.webp"
            alt=""
            width={140}
            height={180}
            className="h-full w-full object-contain drop-shadow-none"
            priority
          />
        </div>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10">
          <AlertCircle className="h-6 w-6 text-rose-400" />
        </div>
        <div className="mt-6 space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-[#F8FAFC]">The console paused for a moment</h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-[#94A3B8]">
          We encountered an error while loading the admin console. This might be a temporary issue.
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#B7D1EA] hover:bg-[#99BFE3] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#0F172A] transition cursor-pointer"
        >
          <RefreshCcw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
