"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { deleteProposalAndLinkedRecords } from "@/app/actions/proposals";

export default function DeleteOrderButton({
  proposalId,
  locale,
  isAdmin,
}: {
  proposalId: string;
  locale: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isAdmin) return null;

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteProposalAndLinkedRecords(proposalId);
        if (!result.success) {
          toast.error(result.error || "Failed to delete order.");
          setIsConfirming(false);
          return;
        }
        toast.success(`Order #${proposalId.slice(0, 8)} and linked records deleted.`);
        router.push(`/${locale}/admin/orders`);
      } catch (err) {
        console.error("Delete order failed:", err);
        toast.error("Failed to delete order.");
        setIsConfirming(false);
      }
    });
  };

  if (isConfirming) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs">
        <span className="text-[11px] font-bold text-rose-300">Confirm permanent delete?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Yes, Delete
        </button>
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          disabled={isPending}
          className="rounded-xl border border-slate-700 bg-[#0B1121] px-2.5 py-1.5 text-[10px] font-bold text-slate-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsConfirming(true)}
      className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-[10px] font-mono font-black uppercase text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
      title="Permanently delete this order and all attached records (Admin Only)"
    >
      <Trash2 className="h-3.5 w-3.5" />
      <span>Delete Order</span>
    </button>
  );
}
