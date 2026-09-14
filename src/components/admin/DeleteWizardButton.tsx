"use client";

import { Trash2 } from "@/components/ui/icons";
import { deleteWizard } from "@/app/actions/wizard";
import { useTransition } from "react";
import { toast } from "sonner";

export default function DeleteWizardButton({ wizardId }: { wizardId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this wizard?")) return;
    startTransition(async () => {
      const res = await deleteWizard(wizardId);
      if (res.success) {
        toast.success("Wizard deleted.");
      } else {
        toast.error(res.error ?? "Failed to delete wizard.");
      }
    });
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleDelete}
      className="p-2 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
      title="Delete Wizard"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
