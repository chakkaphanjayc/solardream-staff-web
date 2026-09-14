"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { db } from "@/db";
import { quotationComments, userNotifications, proposals } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { ensureUserExists } from "@/app/actions/auth";

export interface QuotationComment {
  id: string;
  quotationId: string;
  userId: string;
  message: string;
  isAdminReply: boolean;
  createdAt: string;
  senderName: string | null;
  senderAvatar: string | null;
}

type GetCommentsResult =
  | { success: true; comments: QuotationComment[] }
  | { success: false; error: string };

type AddCommentResult =
  | { success: true; comment: QuotationComment }
  | { success: false; error: string };

/**
 * Fetch all comments for a given quotation/proposal ID, ordered chronologically.
 */
export async function getQuotationComments(
  quotationId: string
): Promise<GetCommentsResult> {
  try {
    const rows = await db.query.quotationComments.findMany({
      where: eq(quotationComments.quotationId, quotationId),
      orderBy: [asc(quotationComments.createdAt)],
      with: {
        user: {
          columns: {
            name: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const comments: QuotationComment[] = rows.map((row) => ({
      id: row.id,
      quotationId: row.quotationId,
      userId: row.userId,
      message: row.message,
      isAdminReply: row.isAdminReply,
      createdAt: row.createdAt.toISOString(),
      senderName: row.user?.fullName || row.user?.name || null,
      senderAvatar: row.user?.avatarUrl ?? null,
    }));

    return { success: true, comments };
  } catch (error) {
    console.error("Failed to fetch quotation comments:", error);
    return { success: false, error: "Failed to fetch comments." };
  }
}

/**
 * Add a comment from the currently authenticated user to a quotation thread.
 * Smart notification logic:
 *  - Customer → notifies admin.
 *  - Admin/Staff → notifies the customer.
 */
export async function addQuotationComment(
  quotationId: string,
  message: string
): Promise<AddCommentResult> {
  try {
    const supabase = await createClient();
    const { data: { user: supabaseUser } } = await supabase.auth.getUser();
    if (!supabaseUser) return { success: false, error: "Unauthorized. Please log in." };

    const dbUser = await ensureUserExists(supabaseUser);
    if (!dbUser) return { success: false, error: "User profile not found." };

    const trimmedMessage = message.trim();
    if (!trimmedMessage) return { success: false, error: "Message cannot be empty." };
    if (trimmedMessage.length > 2000) return { success: false, error: "Message is too long (max 2000 characters)." };

    // Verify the proposal exists and fetch its owner
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, quotationId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    });
    if (!proposal) return { success: false, error: "Quotation not found." };

    const isAdmin =
      dbUser.role === "ADMIN" ||
      dbUser.role === "STAFF" ||
      dbUser.role === "MANAGER" ||
      dbUser.role === "SUPER_ADMIN";

    const [inserted] = await db
      .insert(quotationComments)
      .values({
        quotationId,
        userId: dbUser.id,
        message: trimmedMessage,
        isAdminReply: isAdmin,
      })
      .returning();

    if (!inserted) return { success: false, error: "Failed to save comment." };

    // --- Smart Notification Logic ---
    if (isAdmin) {
      // Admin replied → notify the customer (proposal owner)
      if (proposal.userId && proposal.userId !== dbUser.id) {
        const notifMessage = `เจ้าหน้าที่มีข้อความใหม่เกี่ยวกับใบเสนอราคาของคุณ (#${quotationId.substring(0, 8).toUpperCase()})`;
        await db.insert(userNotifications).values({
          userId: proposal.userId,
          featureKey: "QUOTATION_COMMENT",
          title: "ข้อความใหม่จากเจ้าหน้าที่",
          link: "/proposals",
          message: notifMessage,
          isRead: false,
        });
      }
    } else {
      // Customer sent a message → notify all admin/staff users
      const adminUsers = await db.query.users.findMany({
        where: (u, { inArray }) => inArray(u.role, ["ADMIN", "STAFF", "MANAGER", "SUPER_ADMIN"]),
        columns: { id: true },
      });

      if (adminUsers.length > 0) {
        const senderLabel =
          dbUser.fullName || dbUser.name
            ? ` (${dbUser.fullName || dbUser.name})`
            : "";
        const notifMessage = `ลูกค้า${senderLabel} ส่งข้อความเกี่ยวกับใบเสนอราคา #${quotationId.substring(0, 8).toUpperCase()}`;
        await db.insert(userNotifications).values(
          adminUsers.map((admin) => ({
            userId: admin.id,
            featureKey: "QUOTATION_COMMENT",
            title: "ข้อความใหม่จากลูกค้า",
            link: `/admin/crm/${quotationId}`,
            message: notifMessage,
            isRead: false as boolean,
          }))
        );
      }
    }

    revalidatePath(`/admin/crm/${quotationId}`);
    revalidatePath("/proposals");

    const comment: QuotationComment = {
      id: inserted.id,
      quotationId: inserted.quotationId,
      userId: inserted.userId,
      message: inserted.message,
      isAdminReply: inserted.isAdminReply,
      createdAt: inserted.createdAt.toISOString(),
      senderName: dbUser.fullName || dbUser.name || null,
      senderAvatar: dbUser.avatarUrl ?? null,
    };

    return { success: true, comment };
  } catch (error) {
    console.error("Failed to add quotation comment:", error);
    return { success: false, error: "Failed to send message." };
  }
}

/**
 * Internal utility: Insert an automated system comment.
 * Used by fulfillment.ts when admin updates the revision matrix.
 * Does NOT trigger notifications since it's a system-generated event.
 */
export async function addSystemComment(
  quotationId: string,
  systemMessage: string
): Promise<void> {
  try {
    // Find the first super admin / admin to use as sender identity
    const [superAdmin] = await db.query.users.findMany({
      where: (u, { inArray }) => inArray(u.role, ["SUPER_ADMIN", "ADMIN"]),
      columns: { id: true },
      limit: 1,
    });

    const systemUserId = superAdmin?.id;
    if (!systemUserId) return; // No admin found, skip silently

    await db.insert(quotationComments).values({
      quotationId,
      userId: systemUserId,
      message: systemMessage,
      isAdminReply: true,
    });
  } catch (error) {
    // Non-critical: log but do not throw
    console.error("Failed to insert system comment:", error);
  }
}

/**
 * Customer negotiation action — called when a customer sends a message
 * while the quotation status is PENDING_CUSTOMER_SIGNATURE.
 *
 * This action:
 * 1. Verifies ownership and current status.
 * 2. Inserts the customer message into the thread.
 * 3. Mutates proposal status → REVISION_REQUIRED.
 * 4. Inserts an activityLog entry.
 * 5. Sends push notifications to all admin/staff.
 * 6. Fires a Discord webhook alert (non-blocking).
 */

type RequestChangesResult =
  | { success: true; comment: QuotationComment; newStatus: string }
  | { success: false; error: string };

export async function requestQuotationChanges(
  quotationId: string,
  message: string
): Promise<RequestChangesResult> {
  try {
    const supabase = await createClient();
    const { data: { user: supabaseUser } } = await supabase.auth.getUser();
    if (!supabaseUser) return { success: false, error: "Unauthorized. Please log in." };

    const dbUser = await ensureUserExists(supabaseUser);
    if (!dbUser) return { success: false, error: "User profile not found." };

    const trimmedMessage = message.trim();
    if (!trimmedMessage) return { success: false, error: "Message cannot be empty." };
    if (trimmedMessage.length > 2000) return { success: false, error: "Message is too long (max 2000 characters)." };

    // Fetch proposal with owner details
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, quotationId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!proposal) return { success: false, error: "Quotation not found." };

    // Only the owner can negotiate
    if (proposal.userId !== dbUser.id) {
      return { success: false, error: "You are not authorized to negotiate this quotation." };
    }

    // Only valid from PENDING_CUSTOMER_SIGNATURE or PENDING_CUSTOMER_APPROVAL
    const currentStatus = proposal.status.toUpperCase();
    if (currentStatus !== "PENDING_CUSTOMER_SIGNATURE" && currentStatus !== "PENDING_CUSTOMER_APPROVAL") {
      return {
        success: false,
        error: "Cannot request changes at this stage.",
      };
    }

    const { activityLogs } = await import("@/db/schema");
    const { getQuotationDocumentNo } = await import("@/lib/erpnext");
    const documentNo = getQuotationDocumentNo(quotationId);

    // Run DB mutations in a transaction
    const [inserted] = await db.transaction(async (tx) => {
      // 1. Insert customer message as non-admin comment
      const [comment] = await tx
        .insert(quotationComments)
        .values({
          quotationId,
          userId: dbUser.id,
          message: trimmedMessage,
          isAdminReply: false,
        })
        .returning();

      // 2. Mutate quotation status → REVISION_REQUIRED
      await tx
        .update(proposals)
        .set({ status: "REVISION_REQUIRED" })
        .where(eq(proposals.id, quotationId));

      // 3. Write activityLog
      const truncatedMsg = trimmedMessage.length > 120
        ? `${trimmedMessage.slice(0, 120)}…`
        : trimmedMessage;

      await tx.insert(activityLogs).values({
        entityId: quotationId,
        entityType: "QUOTATION",
        action: "REVISION_REQUIRED",
        description: `Customer requested changes: ${truncatedMsg}`,
        userId: dbUser.id,
      });

      // 4. Push notifications to all admin/staff
      const adminUsers = await tx.query.users.findMany({
        where: (u, { inArray }) => inArray(u.role, ["ADMIN", "STAFF", "MANAGER", "SUPER_ADMIN"]),
        columns: { id: true },
      });

      const senderLabel = dbUser.fullName || dbUser.name
        ? ` (${dbUser.fullName || dbUser.name})`
        : "";
      const notifMessage = `ลูกค้า${senderLabel} ขอปรับปรุงแก้ไขใบเสนอราคา ${documentNo} — "${truncatedMsg}"`;

      if (adminUsers.length > 0) {
        await tx.insert(userNotifications).values(
          adminUsers.map((admin) => ({
            userId: admin.id,
            featureKey: "QUOTATION_REVISION_REQUESTED",
            title: "🟡 ลูกค้าขอปรับปรุงแก้ไขใบเสนอราคา",
            link: `/admin/crm/${quotationId}`,
            message: notifMessage,
            isRead: false as boolean,
          }))
        );
      }

      return [comment];
    });

    // 5. Discord webhook (non-blocking, fire-and-forget)
    const { sendDiscordQuotationNegotiationAlert } = await import("@/lib/discord");
    void sendDiscordQuotationNegotiationAlert({
      proposalId: quotationId,
      documentNo,
      customerName: dbUser.fullName || dbUser.name || proposal.user?.email || "Unknown Customer",
      message: trimmedMessage,
    }).catch((err) => {
      console.error("[requestQuotationChanges] Discord alert failed:", err);
    });

    revalidatePath(`/admin/crm/${quotationId}`);
    revalidatePath("/proposals");

    const comment: QuotationComment = {
      id: inserted.id,
      quotationId: inserted.quotationId,
      userId: inserted.userId,
      message: inserted.message,
      isAdminReply: inserted.isAdminReply,
      createdAt: inserted.createdAt.toISOString(),
      senderName: dbUser.fullName || dbUser.name || null,
      senderAvatar: dbUser.avatarUrl ?? null,
    };

    return { success: true, comment, newStatus: "REVISION_REQUIRED" };
  } catch (error) {
    console.error("Failed to request quotation changes:", error);
    return { success: false, error: "Failed to submit negotiation request." };
  }
}
