"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LayoutGrid, RefreshCw } from "@/components/ui/icons";
import { toast } from "sonner";

import {
  getLineRichMenuApiState,
  type LineEnvStatus,
  type LineRichMenuApiState,
} from "@/app/actions/settings/lineSettings";
import { cn } from "@/lib/utils";

type LineRichMenuInventoryProps = {
  envStatus: LineEnvStatus;
};

export default function LineRichMenuInventory({ envStatus }: LineRichMenuInventoryProps) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<LineRichMenuApiState | null>(null);

  const refresh = () => {
    startTransition(async () => {
      try {
        const result = await getLineRichMenuApiState();
        if (!result.success) {
          toast.error(result.error);
          return;
        }

        setState(result.state);
        toast.success("LINE Rich Menu inventory refreshed.");
      } catch (error) {
        console.error("LINE Rich Menu inventory error:", error);
        toast.error("Could not load LINE Rich Menu inventory. Please try again.");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5 text-left sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#B7D1EA]/20 bg-[#B7D1EA]/10 text-[#B7D1EA]">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B7D1EA]">LINE API inventory</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-50">Rich Menus on LINE</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              Check the menus created through the Messaging API and the current default assignment before publishing or scheduling a new menu.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending || !envStatus.LINE_CHANNEL_ACCESS_TOKEN}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-xs font-semibold text-slate-200 transition hover:border-[#B7D1EA]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
          {isPending ? "Loading…" : "Refresh inventory"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4">
          <p className="text-[10px] font-medium text-slate-500">API-created menus</p>
          <p className="mt-2 text-xl font-semibold text-slate-100">{state ? state.richMenus.length : "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4">
          <p className="text-[10px] font-medium text-slate-500">Default menu</p>
          <p className="mt-2 truncate font-mono text-xs text-slate-200">{state?.defaultRichMenuId || "Not loaded"}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4">
          <p className="text-[10px] font-medium text-slate-500">Configured member menu</p>
          <p className="mt-2 truncate font-mono text-xs text-slate-200">{envStatus.LINE_MEMBER_RICH_MENU_ID || "Not configured"}</p>
        </div>
      </div>

      {state ? (
        <div className="mt-5 space-y-2">
          {state.richMenus.length > 0 ? state.richMenus.map((menu) => (
            <div key={menu.richMenuId} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-[#0B1121] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-100">{menu.name}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{menu.richMenuId}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[10px] text-slate-500">
                <span>{menu.width && menu.height ? `${menu.width} × ${menu.height}` : "Size unavailable"}</span>
                {menu.richMenuId === state.defaultRichMenuId || menu.selected ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Active</span>
                ) : null}
              </div>
            </div>
          )) : (
            <p className="rounded-lg border border-dashed border-slate-700 p-4 text-xs text-slate-500">No API-created Rich Menus were returned. Menus created in LINE Official Account Manager are not visible through this endpoint.</p>
          )}
          {state.errors.length > 0 ? <p className="text-[10px] text-amber-200/80">Some inventory calls failed: {state.errors.join("; ")}</p> : null}
        </div>
      ) : (
        <p className="mt-5 text-xs text-slate-500">Refresh when you need a live LINE-side inventory. This avoids polling a rate-limited endpoint on every page load.</p>
      )}
    </section>
  );
}
