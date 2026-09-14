import { revalidatePath } from "next/cache";

import { pusherServer } from "@/lib/pusher";

export async function publishPortalStateChanged(proposalId: string, event: string) {
  revalidatePath(`/th/portal/${proposalId}`);
  revalidatePath(`/en/portal/${proposalId}`);
  revalidatePath(`/admin/crm/${proposalId}`);
  try {
    await pusherServer.trigger(`private-portal-${proposalId}`, "portal-state-changed", {
      proposalId,
      event,
      occurredAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.warn("[Portal Events] Realtime publish failed:", error);
  }
}
