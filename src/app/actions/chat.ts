"use server";

import { z } from "zod";
import { db } from "@/db";
import { chatThreads, chatMessages, difyConversations, lineContentItems, proposals, users } from "@/db/schema";
import { eq, and, desc, asc, isNull, inArray, ne, lt, sql } from "drizzle-orm";
import { getDbUser } from "@/app/actions/auth";
import { revalidatePath } from "next/cache";
import { ADMIN_PERMISSIONS, requireAdminPermission } from "@/lib/admin-permissions";
import { recordAuditEventBestEffort } from "@/lib/auditLog";
import { compileLineContentDocument, lineContentDocumentSchema } from "@/lib/lineContentSchema";
import { pushMessageToLine } from "@/lib/linePush";

// ─── Zod Validation Schemas (Enterprise Security) ────────────────────────────

const REFERENCE_TYPES = ["QUOTATION", "PRODUCT", "BUNDLE", "SAVED_BUILD", "NONE"] as const;

const SendMessageSchema = z.object({
  threadId: z.string().uuid("Invalid thread ID"),
  message: z.string().trim().min(1, "Message cannot be empty").max(2000, "Message exceeds 2000 character limit"),
  isInternalNote: z.boolean().optional().default(false),
  referenceType: z.enum(REFERENCE_TYPES).optional().default("NONE"),
  referenceId: z.string().trim().min(1).max(200).nullable().optional().default(null),
}).superRefine((value, ctx) => {
  const hasReference = value.referenceType !== "NONE";
  if (hasReference !== Boolean(value.referenceId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["referenceId"],
      message: "Reference type and reference ID must be provided together",
    });
  }
});

const ThreadIdSchema = z.string().uuid("Invalid thread ID");

const StartChatThreadSchema = z.object({
  topic: z.string().trim().min(1, "Topic is required").max(200, "Topic exceeds 200 character limit"),
  entityId: z.string().uuid("Invalid entity ID").nullable(),
});

const GetOrCreateEntityThreadSchema = z.object({
  entityId: z.string().trim().min(1, "Entity ID is required").max(200),
  entityType: z.string().trim().min(1).max(100),
  topicName: z.string().trim().max(200).optional().default(""),
});

const STAFF_ROLES = ["ADMIN", "STAFF", "MANAGER", "SUPER_ADMIN"] as const;

function isStaffRole(role: string | null | undefined): boolean {
  return STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]);
}

export interface ChatMessageDto {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  message: string;
  referenceType: "QUOTATION" | "PRODUCT" | "BUNDLE" | "SAVED_BUILD" | "NONE";
  referenceId: string | null;
  isRead: boolean;
  isInternalNote: boolean;
  createdAt: string;
  attachmentUrl?: string | null;
  source?: string;
  contentType?: string;
  payload?: Record<string, unknown> | null;
}

export interface ChatStaffDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

export interface ChatThreadDto {
  id: string;
  customerId: string;
  customerName: string | null;
  customerAvatar: string | null;
  staffId: string | null;
  staffName: string | null;
  staffAvatar: string | null;
  staffRole: string | null;
  entityId: string | null;
  topic: string;
  status: "UNASSIGNED" | "OPEN" | "RESOLVED" | "CLOSED";
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage?: string;
  automationEnabled?: boolean;
  humanTakeoverAt?: string | null;
  humanTakeoverBy?: string | null;
  lastReplySource?: string;
}

export interface ChatThreadUpdateDto {
  id: string;
  staffId: string | null;
  staffName: string | null;
  staffAvatar: string | null;
  staffRole: string | null;
  status: ChatThreadDto["status"];
  updatedAt: string;
  lastMessage?: string;
}

export interface ChatProposalReferenceDto {
  id: string;
  status: string;
  totalPrice: number;
  createdAt: string;
}

type ThreadMessageSummary = {
  unreadCount: number;
  lastMessage: string;
};

/**
 * Loads the two pieces of message metadata needed by thread lists without
 * issuing one unread/latest query pair for every thread.
 */
async function getThreadMessageSummaries(
  threadIds: readonly string[],
  viewerId: string,
  includeInternalNotes: boolean,
): Promise<Map<string, ThreadMessageSummary>> {
  if (threadIds.length === 0) return new Map();

  const threadFilter = inArray(chatMessages.threadId, [...threadIds]);
  const visibleMessageFilter = includeInternalNotes
    ? threadFilter
    : and(threadFilter, eq(chatMessages.isInternalNote, false));
  const unreadMessageFilter = and(
    visibleMessageFilter,
    eq(chatMessages.isRead, false),
    ne(chatMessages.senderId, viewerId),
  );

  const [unreadRows, latestRows] = await Promise.all([
    db
      .select({
        threadId: chatMessages.threadId,
        unreadCount: sql<number>`count(*)::int`,
      })
      .from(chatMessages)
      .where(unreadMessageFilter)
      .groupBy(chatMessages.threadId),
    db
      .selectDistinctOn([chatMessages.threadId], {
        threadId: chatMessages.threadId,
        message: chatMessages.message,
      })
      .from(chatMessages)
      .where(visibleMessageFilter)
      .orderBy(chatMessages.threadId, desc(chatMessages.createdAt)),
  ]);

  const summaries = new Map<string, ThreadMessageSummary>();
  for (const row of latestRows) {
    summaries.set(row.threadId, {
      unreadCount: 0,
      lastMessage: row.message,
    });
  }
  for (const row of unreadRows) {
    const summary = summaries.get(row.threadId) ?? {
      unreadCount: 0,
      lastMessage: "",
    };
    summary.unreadCount = row.unreadCount;
    summaries.set(row.threadId, summary);
  }

  return summaries;
}

function getStaffDisplayName(staff: { fullName?: string | null; name?: string | null; email?: string | null } | null | undefined) {
  return staff?.fullName || staff?.name || staff?.email || null;
}

function toThreadUpdateDto(thread: {
  id: string;
  staffId: string | null;
  status: ChatThreadDto["status"];
  updatedAt: Date;
  staff?: { fullName: string | null; name: string | null; email: string; avatarUrl: string | null; role: string } | null;
}, lastMessage?: string): ChatThreadUpdateDto {
  return {
    id: thread.id,
    staffId: thread.staffId,
    staffName: getStaffDisplayName(thread.staff),
    staffAvatar: thread.staff?.avatarUrl ?? null,
    staffRole: thread.staff?.role ?? null,
    status: thread.status,
    updatedAt: thread.updatedAt.toISOString(),
    lastMessage,
  };
}

async function triggerThreadUpdated(thread: ChatThreadUpdateDto) {
  try {
    const { pusherServer } = await import("@/lib/pusher");
    await pusherServer.trigger("chat-thread", "thread-updated", thread);
  } catch (pusherError) {
    console.error("Failed to trigger Pusher thread update:", pusherError);
  }
}

/**
 * Gets the current logged-in user profile, role, and details.
 */
export async function getMessengerUser() {
  try {
    const user = await getDbUser();
    if (!user) {
      return { success: false, error: "Not logged in" };
    }
    return { success: true, user };
  } catch (error) {
    console.error("Error in getMessengerUser:", error);
    return { success: false, error: "Internal server error" };
  }
}

export type ChatUser = NonNullable<Awaited<ReturnType<typeof getDbUser>>>;

/**
 * Fetch threads list and available topics (Unstarted Quotations and Job Tickets) for the logged-in customer.
 */
export async function getCustomerThreadsAndTopics() {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    // 1. Fetch existing threads for this customer
    const existingThreads = await db.query.chatThreads.findMany({
      where: and(
        eq(chatThreads.customerId, user.id),
        eq(chatThreads.isArchived, false)
      ),
      orderBy: [desc(chatThreads.updatedAt)],
      with: {
        staff: {
          columns: {
            fullName: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    const [messageSummaries, activeProposals] = await Promise.all([
      getThreadMessageSummaries(
        existingThreads.map((thread) => thread.id),
        user.id,
        false,
      ),
      // 2. Fetch customer's active proposals (Quotations)
      db.query.proposals.findMany({
        where: and(
          eq(proposals.userId, user.id),
          eq(proposals.isArchived, false),
          ne(proposals.status, "CANCELLED"),
          ne(proposals.status, "DEACTIVATED")
        ),
        orderBy: [desc(proposals.updatedAt)],
      }),
    ]);

    // 3. Fetch customer's job tickets
    const proposalIds = activeProposals.map((p) => p.id);
    let activeTickets: { id: string }[] = [];
    if (proposalIds.length > 0) {
      activeTickets = await db.query.installationJobTickets.findMany({
        where: (t, { inArray }) => inArray(t.quotationId, proposalIds),
        columns: {
          id: true,
        },
      });
    }

    // Map threads to Dto format
    const threadDtos: ChatThreadDto[] = existingThreads.map((thread) => {
      const summary = messageSummaries.get(thread.id);
      return {
        id: thread.id,
        customerId: thread.customerId,
        customerName: user.fullName || user.name || "Customer",
        customerAvatar: user.avatarUrl,
        staffId: thread.staffId,
        staffName: getStaffDisplayName(thread.staff),
        staffAvatar: thread.staff?.avatarUrl ?? null,
        staffRole: thread.staff?.role ?? null,
        entityId: thread.entityId,
        topic: thread.topic,
        status: thread.status,
        isArchived: thread.isArchived,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: summary?.unreadCount ?? 0,
        lastMessage: summary?.lastMessage ?? "",
      };
    });

    // 4. Compile unstarted topics lists (Topics where no thread exists yet)
    const availableTopics: { topic: string; entityId: string | null }[] = [];

    // Check default support thread
    const hasSupportThread = threadDtos.some((t) => t.topic === "General Support");
    if (!hasSupportThread) {
      availableTopics.push({ topic: "General Support", entityId: null });
    }

    // Check proposals topics
    for (const prop of activeProposals) {
      const topicName = `Quotation #${prop.id.substring(0, 8).toUpperCase()}`;
      const hasThread = threadDtos.some((t) => t.entityId === prop.id && t.topic.startsWith("Quotation"));
      if (!hasThread) {
        availableTopics.push({ topic: topicName, entityId: prop.id });
      }
    }

    // Check job tickets topics
    for (const ticket of activeTickets) {
      const topicName = `Job #${ticket.id.substring(0, 8).toUpperCase()}`;
      const hasThread = threadDtos.some((t) => t.entityId === ticket.id && t.topic.startsWith("Job"));
      if (!hasThread) {
        availableTopics.push({ topic: topicName, entityId: ticket.id });
      }
    }

    return {
      success: true,
      threads: threadDtos,
      availableTopics,
      activeProposals: activeProposals.map((proposal): ChatProposalReferenceDto => ({
        id: proposal.id,
        status: proposal.status,
        totalPrice: proposal.totalPrice,
        createdAt: proposal.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Error fetching customer threads/topics:", error);
    return { success: false, error: "Failed to fetch chat options." };
  }
}

/**
 * Fetch all active threads for Staff/Admin Inbox view.
 */
export async function getStaffInboxThreads() {
  try {
    const user = await requireAdminPermission(ADMIN_PERMISSIONS.inboxView);

    // Fetch all active threads in the system
    const threads = await db.query.chatThreads.findMany({
      where: eq(chatThreads.isArchived, false),
      orderBy: [desc(chatThreads.updatedAt)],
      with: {
        customer: {
          columns: {
            fullName: true,
            name: true,
            avatarUrl: true,
          },
        },
        staff: {
          columns: {
            fullName: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    const messageSummaries = await getThreadMessageSummaries(
      threads.map((thread) => thread.id),
      user.id,
      true,
    );
    const threadDtos: ChatThreadDto[] = threads.map((thread) => {
      const summary = messageSummaries.get(thread.id);
      return {
        id: thread.id,
        customerId: thread.customerId,
        customerName: thread.customer?.fullName || thread.customer?.name || "Customer",
        customerAvatar: thread.customer?.avatarUrl,
        staffId: thread.staffId,
        staffName: getStaffDisplayName(thread.staff),
        staffAvatar: thread.staff?.avatarUrl ?? null,
        staffRole: thread.staff?.role ?? null,
        entityId: thread.entityId,
        topic: thread.topic,
        status: thread.status,
        isArchived: thread.isArchived,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
        unreadCount: summary?.unreadCount ?? 0,
        lastMessage: summary?.lastMessage ?? "",
        automationEnabled: thread.automationEnabled,
        humanTakeoverAt: thread.humanTakeoverAt?.toISOString() ?? null,
        humanTakeoverBy: thread.humanTakeoverBy,
        lastReplySource: thread.lastReplySource,
      };
    });

    return { success: true, threads: threadDtos };
  } catch (error) {
    console.error("Error fetching staff inbox threads:", error);
    return { success: false, error: "Failed to fetch threads inbox." };
  }
}

/**
 * Fetch chat messages for a specific thread, marking unread incoming messages as read.
 */
export async function getThreadMessages(
  threadId: string,
  options: { limit?: number; cursorId?: string } = {}
) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    const isAdmin = isStaffRole(user.role);
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
    });
    if (!thread) return { success: false, error: "Chat thread not found." };
    if (!isAdmin && thread.customerId !== user.id) {
      return { success: false, error: "Access denied." };
    }
    const pageSize = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const baseWhere = isAdmin
      ? eq(chatMessages.threadId, threadId)
      : and(
          eq(chatMessages.threadId, threadId),
          eq(chatMessages.isInternalNote, false)
        );

    let cursorCreatedAt: Date | null = null;
    if (options.cursorId) {
      const cursorMessage = await db.query.chatMessages.findFirst({
        where: and(eq(chatMessages.id, options.cursorId), eq(chatMessages.threadId, threadId)),
        columns: { createdAt: true },
      });

      if (!cursorMessage) {
        return { success: false, error: "Message cursor not found." };
      }

      cursorCreatedAt = cursorMessage.createdAt;
    }

    // 1. Fetch newest messages first; reverse for chronological rendering.
    const messagesRowsDesc = await db.query.chatMessages.findMany({
      where: cursorCreatedAt ? and(baseWhere, lt(chatMessages.createdAt, cursorCreatedAt)) : baseWhere,
      orderBy: [desc(chatMessages.createdAt)],
      limit: pageSize + 1,
      with: {
        sender: true,
      },
    });
    const hasMore = messagesRowsDesc.length > pageSize;
    const messagesRows = messagesRowsDesc.slice(0, pageSize).reverse();

    // 2. Mark messages from other senders as read
    const unreadFromOthers = messagesRows.filter(
      (m) => m.senderId !== user.id && !m.isRead
    );

    if (unreadFromOthers.length > 0) {
      await db
        .update(chatMessages)
        .set({ isRead: true })
        .where(inArray(chatMessages.id, unreadFromOthers.map((msg) => msg.id)));
    }

    const messagesDtos: ChatMessageDto[] = messagesRows.map((msg) => ({
      id: msg.id,
      threadId: msg.threadId,
      senderId: msg.senderId,
      senderName: msg.sender?.fullName || msg.sender?.name || "User",
      senderAvatar: msg.sender?.avatarUrl,
      message: msg.message,
      referenceType: msg.referenceType,
      referenceId: msg.referenceId,
      isRead: msg.senderId === user.id ? msg.isRead : true, // Local update reflection
      isInternalNote: msg.isInternalNote,
      createdAt: msg.createdAt.toISOString(),
      source: msg.source,
      contentType: msg.contentType,
      payload: msg.payload,
    }));

    return {
      success: true,
      messages: messagesDtos,
      hasMore,
      nextCursor: messagesDtos[0]?.id ?? null,
    };
  } catch (error) {
    console.error("Error getting thread messages:", error);
    return { success: false, error: "Failed to load chat messages." };
  }
}

/**
 * Send a message in a specific chat thread.
 */
export async function sendChatMessage(
  threadId: string,
  messageText: string,
  options: {
    isInternalNote?: boolean;
    referenceType?: "QUOTATION" | "PRODUCT" | "BUNDLE" | "SAVED_BUILD" | "NONE";
    referenceId?: string;
  } = {}
) {
  try {
    // 🔒 Session-derived identity — never trust client for senderId
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    // 🛡️ Zod payload validation — prevent DoS via oversized payloads
    const parsed = SendMessageSchema.safeParse({
      threadId,
      message: messageText,
      isInternalNote: options.isInternalNote,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
    });
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
      return { success: false, error: firstError };
    }
    const { message: trimmed, isInternalNote, referenceType, referenceId } = parsed.data;

    const isAdmin = isStaffRole(user.role);
    if (isInternalNote && !isAdmin) {
      return { success: false, error: "Only staff can send internal notes." };
    }

    // Verify the thread exists
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, parsed.data.threadId),
    });
    if (!thread) return { success: false, error: "Chat thread not found." };
    if (!isAdmin && thread.customerId !== user.id) {
      return { success: false, error: "Access denied." };
    }
    if (referenceType === "QUOTATION" && referenceId && !isAdmin) {
      const referencedProposal = await db.query.proposals.findFirst({
        where: and(
          eq(proposals.id, referenceId),
          eq(proposals.userId, user.id)
        ),
        columns: { id: true },
      });
      if (!referencedProposal) {
        return { success: false, error: "Quotation reference not found." };
      }
    }

    const [inserted] = await db.transaction(async (tx) => {
      // 1. Insert message — senderId from session, NEVER from client
      const [msg] = await tx
        .insert(chatMessages)
        .values({
          threadId: parsed.data.threadId,
          senderId: user.id,
          message: trimmed,
          isRead: false,
          isInternalNote,
          referenceType,
          referenceId,
          source: isInternalNote ? "INTERNAL" : "HUMAN",
          contentType: "TEXT",
        })
        .returning();

      // 2. Update thread updatedAt and potentially assign staffId if a staff member replied
      const updateData: { updatedAt: Date; staffId?: string } = { updatedAt: new Date() };
      if (isAdmin && !thread.staffId) {
        updateData.staffId = user.id;
      }

      await tx
        .update(chatThreads)
      .set({ ...updateData, lastReplySource: isInternalNote ? "INTERNAL" : "HUMAN" })
        .where(eq(chatThreads.id, parsed.data.threadId));

      return [msg];
    });

    const msgDto: ChatMessageDto = {
      id: inserted.id,
      threadId: inserted.threadId,
      senderId: inserted.senderId,
      senderName: user.fullName || user.name || "User",
      senderAvatar: user.avatarUrl,
      message: inserted.message,
      referenceType: inserted.referenceType,
      referenceId: inserted.referenceId,
      isRead: inserted.isRead,
      isInternalNote: inserted.isInternalNote,
      createdAt: inserted.createdAt.toISOString(),
      source: inserted.source,
      contentType: inserted.contentType,
      payload: inserted.payload,
    };

    // Trigger Real-time WebSockets event via Pusher
    try {
      const { pusherServer } = await import("@/lib/pusher");
      await pusherServer.trigger(`chat-thread-${parsed.data.threadId}`, "new-message", { message: msgDto });
      await pusherServer.trigger("admin-helpdesk", "inbox-update", {
        threadId: parsed.data.threadId,
        lastMessage: trimmed,
        updatedAt: inserted.createdAt.toISOString(),
      });
    } catch (pusherError) {
      console.error("Failed to trigger Pusher realtime event:", pusherError);
    }

    return { success: true, message: msgDto };
  } catch (error) {
    console.error("Error sending chat message:", error);
    return { success: false, error: "Failed to send message." };
  }
}

/**
 * Fetch or create a dedicated chat thread for a specific entity and customer.
 */
export async function getOrCreateEntityThread(
  entityId: string,
  entityType: string,
  topicName: string,
  /** @deprecated customerId is now ignored — derived from session for anti-spoofing */
  _customerId?: string
) {
  try {
    void _customerId;
    // 🔒 Session-derived identity — never trust client-supplied customerId
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    // 🛡️ Zod payload validation
    const parsed = GetOrCreateEntityThreadSchema.safeParse({ entityId, entityType, topicName });
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
      return { success: false, error: firstError };
    }

    const { entityId: trimmedEntityId, entityType: trimmedEntityType, topicName: trimmedTopicName } = parsed.data;
    // customerId is ALWAYS the authenticated session user
    const resolvedCustomerId = user.id;

    const topic = trimmedTopicName || `${trimmedEntityType || "Entity"} #${trimmedEntityId.slice(0, 8).toUpperCase()}`;

    let isNew = false;
    const threadId = await db.transaction(async (tx) => {
      const existing = await tx.query.chatThreads.findFirst({
        where: and(
          eq(chatThreads.entityId, trimmedEntityId),
          eq(chatThreads.customerId, resolvedCustomerId)
        ),
      });

      if (existing) {
        return existing.id;
      }

      isNew = true;
      const [inserted] = await tx
        .insert(chatThreads)
        .values({
          customerId: resolvedCustomerId,
          entityId: trimmedEntityId,
          topic,
          isArchived: false,
        })
        .returning({ id: chatThreads.id });

      return inserted.id;
    });

    if (isNew) {
      try {
        const { pusherServer } = await import("@/lib/pusher");
        await pusherServer.trigger("admin-helpdesk", "inbox-update", {
          threadId,
          lastMessage: "",
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Failed to trigger global inbox update for new thread:", e);
      }
    }

    return { success: true, threadId };
  } catch (error) {
    console.error("Error getting or creating entity chat thread:", error);
    return { success: false, error: "Failed to get or create entity chat thread." };
  }
}

/**
 * Start a new thread dynamically for a topic.
 */
export async function startChatThread(topic: string, entityId: string | null) {
  try {
    // 🔒 Session-derived identity
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    // 🛡️ Zod payload validation
    const parsed = StartChatThreadSchema.safeParse({ topic, entityId });
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
      return { success: false, error: firstError };
    }
    const { topic: validatedTopic, entityId: validatedEntityId } = parsed.data;

    if (validatedEntityId) {
      return await getOrCreateEntityThread(validatedEntityId, "ENTITY", validatedTopic);
    }

    // Verify if thread already exists for safety
    const existing = await db.query.chatThreads.findFirst({
      where: and(
        eq(chatThreads.customerId, user.id),
        eq(chatThreads.topic, validatedTopic),
        isNull(chatThreads.entityId)
      ),
    });

    if (existing) {
      return { success: true, threadId: existing.id };
    }

    // Insert new thread — customerId from session
    const [inserted] = await db
      .insert(chatThreads)
      .values({
        customerId: user.id,
        topic: validatedTopic,
        entityId: null,
        isArchived: false,
      })
      .returning();

    if (inserted) {
      try {
        const { pusherServer } = await import("@/lib/pusher");
        await pusherServer.trigger("admin-helpdesk", "inbox-update", {
          threadId: inserted.id,
          lastMessage: "",
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Failed to trigger global inbox update for new thread:", e);
      }
    }

    return { success: true, threadId: inserted.id };
  } catch (error) {
    console.error("Error starting chat thread:", error);
    return { success: false, error: "Failed to initiate chat thread." };
  }
}

/**
 * Archive and export chat thread history (visible only to Admins/Staff).
 */
export async function archiveChatThread(threadId: string) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    const isAdmin = isStaffRole(user.role);
    if (!isAdmin) return { success: false, error: "Access denied." };

    // 1. Fetch thread and customer details
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
      with: {
        customer: true,
      },
    });

    if (!thread) return { success: false, error: "Chat thread not found." };
    if (thread.isArchived) return { success: false, error: "Chat thread is already archived." };

    // Keep archived messages in the access-controlled database. Previous
    // versions wrote full customer identities and messages into /public,
    // making the backup addressable without authentication.
    const backupUrl = `internal://chat-thread/${threadId}`;

    // 5. DB transactions: insert into backups & mark thread as archived
    const { chatBackups } = await import("@/db/schema");
    await db.transaction(async (tx) => {
      // 5.1 Insert backup log
      await tx.insert(chatBackups).values({
        threadId,
        backupUrl,
        exportedBy: user.id,
      });

      // 5.2 Set isArchived = true
      await tx
        .update(chatThreads)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(chatThreads.id, threadId));
    });

    revalidatePath("/admin/crm");
    revalidatePath("/proposals");

    return { success: true, backupUrl };
  } catch (error) {
    console.error("Error archiving chat thread:", error);
    return { success: false, error: "Failed to archive and export chat history." };
  }
}

/**
 * Claim an unassigned chat thread. Sets staffId to current user and status to OPEN.
 * Only Admins/Staff/Managers can claim threads.
 */
export async function claimChatThread(threadId: string) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    const isAdmin = isStaffRole(user.role);
    if (!isAdmin) return { success: false, error: "Access denied. Staff role required." };

    // Verify the thread exists and is claimable
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
    });

    if (!thread) return { success: false, error: "Chat thread not found." };
    if (thread.isArchived) return { success: false, error: "Cannot claim an archived thread." };
    if (thread.status === "CLOSED") return { success: false, error: "Cannot claim a closed thread." };

    // Atomically assign the thread to this staff member
    const [updated] = await db
      .update(chatThreads)
      .set({
        staffId: user.id,
        status: "OPEN",
        automationEnabled: false,
        humanTakeoverAt: new Date(),
        humanTakeoverBy: user.id,
        lastReplySource: "HUMAN",
        updatedAt: new Date(),
      })
      .where(eq(chatThreads.id, threadId))
      .returning();
    const updatedThread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, updated.id),
      with: { staff: true },
    });
    if (updatedThread) {
      await triggerThreadUpdated(toThreadUpdateDto(updatedThread));
      try {
        const { pusherServer } = await import("@/lib/pusher");
        await pusherServer.trigger(`chat-thread-${threadId}`, "thread-updated", {
          status: "OPEN",
          staffId: user.id,
          staffName: user.fullName || user.name || user.email || "Staff",
        });
        await pusherServer.trigger("admin-helpdesk", "thread-claimed", {
          threadId,
          staffId: user.id,
          status: "OPEN",
        });
      } catch (pusherError) {
        console.error("Failed to trigger Pusher channel thread-updated:", pusherError);
      }
    }

    revalidatePath("/admin/messages");

    return {
      success: true,
      thread: {
        id: updated.id,
        staffId: updated.staffId,
        staffName: user.fullName || user.name || user.email,
        staffAvatar: user.avatarUrl,
        staffRole: user.role,
        status: updated.status,
      },
    };
  } catch (error) {
    console.error("Error claiming chat thread:", error);
    return { success: false, error: "Failed to claim chat thread." };
  }
}

/**
 * Release an active chat thread back to the unassigned queue.
 */
export async function releaseChatThread(threadId: string) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    if (!isStaffRole(user.role)) return { success: false, error: "Access denied. Staff role required." };

    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
    });
    if (!thread) return { success: false, error: "Chat thread not found." };
    if (thread.isArchived) return { success: false, error: "Cannot release an archived thread." };
    if (thread.status === "CLOSED") return { success: false, error: "Cannot release a closed thread." };
    if (!thread.staffId) return { success: false, error: "Chat thread is already unassigned." };

    const adminName = user.fullName || user.name || user.email;
    const systemMessage =
      `⚡ ระบบ: ${adminName} ออกจากการสนทนา แชทนี้ถูกส่งกลับไปที่จุดรับเรื่องรอการตอบกลับ`;

    const { updatedThread, systemMessageRow } = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(chatThreads)
        .set({
          staffId: null,
          status: "UNASSIGNED",
          automationEnabled: true,
          humanTakeoverAt: null,
          humanTakeoverBy: null,
          lastReplySource: "RULE",
          updatedAt: new Date(),
        })
        .where(eq(chatThreads.id, threadId))
        .returning();

      const [message] = await tx
        .insert(chatMessages)
        .values({
          threadId,
          senderId: user.id,
          message: systemMessage,
          isRead: false,
          isInternalNote: false,
          referenceType: "NONE",
          referenceId: null,
        })
        .returning();

      return { updatedThread: updated, systemMessageRow: message };
    });

    const messageDto: ChatMessageDto = {
      id: systemMessageRow.id,
      threadId: systemMessageRow.threadId,
      senderId: systemMessageRow.senderId,
      senderName: "ระบบ",
      senderAvatar: null,
      message: systemMessageRow.message,
      referenceType: systemMessageRow.referenceType,
      referenceId: systemMessageRow.referenceId,
      isRead: systemMessageRow.isRead,
      isInternalNote: systemMessageRow.isInternalNote,
      createdAt: systemMessageRow.createdAt.toISOString(),
    };

    try {
      const { pusherServer } = await import("@/lib/pusher");
      await Promise.all([
        pusherServer.trigger("chat-thread", "new-message", messageDto),
        pusherServer.trigger(
          "chat-thread",
          "thread-updated",
          toThreadUpdateDto({
            id: updatedThread.id,
            staffId: updatedThread.staffId,
            status: updatedThread.status,
            updatedAt: updatedThread.updatedAt,
            staff: null,
          }, messageDto.message)
        ),
      ]);
    } catch (pusherError) {
      console.error("Failed to trigger release chat realtime event:", pusherError);
    }

    revalidatePath("/admin/messages");

    return {
      success: true,
      thread: {
        id: updatedThread.id,
        staffId: updatedThread.staffId,
        staffName: null,
        staffAvatar: null,
        staffRole: null,
        status: updatedThread.status,
        updatedAt: updatedThread.updatedAt.toISOString(),
        lastMessage: messageDto.message,
      },
      message: messageDto,
    };
  } catch (error) {
    console.error("Error releasing chat thread:", error);
    return { success: false, error: "Failed to release chat thread." };
  }
}

/**
 * Resolve or close a chat thread. Only Admins/Staff can do this.
 */
export async function updateThreadStatus(
  threadId: string,
  status: "RESOLVED" | "CLOSED"
) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    const isAdmin = isStaffRole(user.role);
    if (!isAdmin) return { success: false, error: "Access denied." };

    await db
      .update(chatThreads)
      .set({ status, updatedAt: new Date() })
      .where(eq(chatThreads.id, threadId));

    revalidatePath("/admin/messages");

    return { success: true };
  } catch (error) {
    console.error("Error updating thread status:", error);
    return { success: false, error: "Failed to update thread status." };
  }
}

/**
 * Sends a previously published content item to a linked LINE customer. The
 * live delivery helper is deliberately flag-gated, so local and test runs
 * can exercise authorization and compilation without contacting LINE.
 */
export async function sendPublishedLineContentToThread(threadId: string, contentId: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.inboxManage);
    const parsed = z.object({ threadId: ThreadIdSchema, contentId: z.string().uuid() }).safeParse({ threadId, contentId });
    if (!parsed.success) return { success: false as const, error: "Invalid conversation or content ID." };

    const thread = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, parsed.data.threadId) });
    if (!thread) return { success: false as const, error: "Chat thread not found." };
    if (thread.isArchived || thread.status === "CLOSED") return { success: false as const, error: "Closed conversations cannot receive a reply." };
    if (thread.automationEnabled) return { success: false as const, error: "Take over this conversation before sending a manual LINE reply." };

    const [content, customer] = await Promise.all([
      db.query.lineContentItems.findFirst({ where: and(eq(lineContentItems.id, parsed.data.contentId), eq(lineContentItems.status, "PUBLISHED")) }),
      db.query.users.findFirst({ where: eq(users.id, thread.customerId), columns: { id: true, fullName: true, name: true, avatarUrl: true, lineUserId: true } }),
    ]);
    if (!content?.publishedDocument) return { success: false as const, error: "Choose a published LINE content item." };
    if (!customer?.lineUserId) return { success: false as const, error: "This customer has no linked LINE account." };

    const document = lineContentDocumentSchema.safeParse(content.publishedDocument);
    if (!document.success) return { success: false as const, error: "The published content failed validation." };
    const messages = compileLineContentDocument(document.data, { customer_name: customer.fullName || customer.name || "there", user: customer.lineUserId });
    const delivery = await pushMessageToLine(customer.lineUserId, messages as unknown as Record<string, unknown>[]);
    if (!delivery.success) return { success: false as const, error: delivery.error || "LINE did not accept the reply." };

    const displayText = messages
      .map((message) => typeof message.text === "string" ? message.text : `[${message.type}]`)
      .join("\n")
      .trim()
      .slice(0, 2000) || `[${content.contentType}] ${content.internalName}`;
    const [inserted] = await db.transaction(async (tx) => {
      const [message] = await tx.insert(chatMessages).values({
        threadId: thread.id,
        senderId: actor.id,
        message: displayText,
        referenceType: "NONE",
        referenceId: null,
        isRead: true,
        isInternalNote: false,
        source: "HUMAN",
        contentType: content.contentType,
        payload: { contentId: content.id, contentName: content.internalName, messages },
      }).returning();
      await tx.update(chatThreads).set({ staffId: actor.id, updatedAt: new Date(), lastReplySource: "HUMAN" }).where(eq(chatThreads.id, thread.id));
      return [message];
    });
    if (!inserted) return { success: false as const, error: "The LINE reply was sent but could not be recorded." };

    const messageDto: ChatMessageDto = {
      id: inserted.id,
      threadId: inserted.threadId,
      senderId: inserted.senderId,
      senderName: actor.fullName || actor.name || "Staff",
      senderAvatar: actor.avatarUrl ?? null,
      message: inserted.message,
      referenceType: inserted.referenceType,
      referenceId: inserted.referenceId,
      isRead: inserted.isRead,
      isInternalNote: inserted.isInternalNote,
      createdAt: inserted.createdAt.toISOString(),
      source: inserted.source,
      contentType: inserted.contentType,
      payload: inserted.payload,
    };
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "SEND_LINE_CONTENT_FROM_INBOX", resourceType: "CHAT_THREAD", resourceId: thread.id, metadata: { contentId: content.id, contentType: content.contentType } });
    revalidatePath("/en/admin/messages");
    revalidatePath("/th/admin/messages");
    return { success: true as const, message: messageDto };
  } catch (error: unknown) {
    console.error("Error sending published LINE content from inbox:", error instanceof Error ? error.message : "Unknown error");
    return { success: false as const, error: "The published LINE content could not be sent." };
  }
}

/** Reset only the Dify session for this conversation. Customer messages and
 * the operational thread remain intact, so the next approved AI invocation
 * starts a fresh context for the same customer and LINE conversation. */
export async function resetDifyConversationForThread(threadId: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.inboxManage);
    const parsedId = ThreadIdSchema.safeParse(threadId);
    if (!parsedId.success) return { success: false as const, error: "Invalid thread ID." };
    const thread = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, parsedId.data), columns: { id: true, customerId: true, conversationKey: true, isArchived: true } });
    if (!thread) return { success: false as const, error: "Chat thread not found." };
    if (thread.isArchived) return { success: false as const, error: "Cannot reset an archived conversation." };
    if (thread.conversationKey) {
      await db.delete(difyConversations).where(and(eq(difyConversations.customerId, thread.customerId), eq(difyConversations.conversationKey, thread.conversationKey)));
    }
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "RESET_DIFY_CONVERSATION", resourceType: "CHAT_THREAD", resourceId: thread.id, metadata: { conversationKey: thread.conversationKey ? "present" : "missing" } });
    return { success: true as const };
  } catch (error: unknown) {
    console.error("Error resetting Dify conversation:", error instanceof Error ? error.message : "Unknown error");
    return { success: false as const, error: "The Dify conversation could not be reset." };
  }
}

/**
 * Explicitly pauses automation for a conversation and assigns it to the
 * current staff member. The permission is checked on the server.
 */
export async function takeOverChatThread(threadId: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.inboxManage);
    const parsedId = ThreadIdSchema.safeParse(threadId);
    if (!parsedId.success) return { success: false, error: "Invalid thread ID." };
    const [updated] = await db
      .update(chatThreads)
      .set({
        staffId: actor.id,
        status: "OPEN",
        automationEnabled: false,
        humanTakeoverAt: new Date(),
        humanTakeoverBy: actor.id,
        lastReplySource: "HUMAN",
        updatedAt: new Date(),
      })
      .where(and(eq(chatThreads.id, parsedId.data), eq(chatThreads.isArchived, false)))
      .returning();
    if (!updated) return { success: false, error: "Chat thread not found or archived." };
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "CHAT_HUMAN_TAKEOVER", resourceType: "CHAT_THREAD", resourceId: updated.id, metadata: { automationEnabled: false } });
    await triggerThreadUpdated(toThreadUpdateDto({ id: updated.id, staffId: updated.staffId, status: updated.status, updatedAt: updated.updatedAt, staff: { fullName: actor.fullName, name: actor.name, email: actor.email, avatarUrl: actor.avatarUrl, role: actor.role } }));
    revalidatePath("/admin/messages");
    return { success: true, thread: { id: updated.id, automationEnabled: updated.automationEnabled, humanTakeoverAt: updated.humanTakeoverAt?.toISOString() ?? null, staffId: updated.staffId, status: updated.status } };
  } catch (error: unknown) {
    console.error("Error taking over chat thread:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to take over chat thread." };
  }
}

/**
 * Returns a conversation to the automation queue without changing its
 * customer history. Live processing still has to pass webhook and
 * published-rule gates.
 */
export async function returnChatThreadToAutomation(threadId: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.inboxManage);
    const parsedId = ThreadIdSchema.safeParse(threadId);
    if (!parsedId.success) return { success: false, error: "Invalid thread ID." };
    const thread = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, parsedId.data) });
    if (!thread) return { success: false, error: "Chat thread not found." };
    if (thread.isArchived) return { success: false, error: "Cannot change an archived thread." };
    const nextStatus = thread.status === "OPEN" ? "UNASSIGNED" : thread.status;
    const [updated] = await db
      .update(chatThreads)
      .set({ staffId: nextStatus === "UNASSIGNED" ? null : thread.staffId, status: nextStatus, automationEnabled: true, humanTakeoverAt: null, humanTakeoverBy: null, lastReplySource: "RULE", updatedAt: new Date() })
      .where(eq(chatThreads.id, parsedId.data))
      .returning();
    if (!updated) return { success: false, error: "Chat thread could not be updated." };
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "CHAT_RETURN_TO_AUTOMATION", resourceType: "CHAT_THREAD", resourceId: updated.id, metadata: { automationEnabled: true } });
    await triggerThreadUpdated(toThreadUpdateDto({ id: updated.id, staffId: updated.staffId, status: updated.status, updatedAt: updated.updatedAt, staff: null }));
    revalidatePath("/admin/messages");
    return { success: true, thread: { id: updated.id, automationEnabled: updated.automationEnabled, humanTakeoverAt: null, staffId: updated.staffId, status: updated.status } };
  } catch (error: unknown) {
    console.error("Error returning chat thread to automation:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to return chat thread to automation." };
  }
}

/**
 * List active staff/admin users that the current staff member can transfer a chat to.
 */
export async function getActiveStaffForTransfer() {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    if (!isStaffRole(user.role)) return { success: false, error: "Access denied." };

    const staffRows = await db.query.users.findMany({
      where: and(
        inArray(users.role, STAFF_ROLES),
        eq(users.isActive, true),
        ne(users.id, user.id)
      ),
      orderBy: [asc(users.fullName), asc(users.email)],
      columns: {
        id: true,
        fullName: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
      },
    });

    const staff: ChatStaffDto[] = staffRows.map((staffUser) => ({
      id: staffUser.id,
      name: staffUser.fullName || staffUser.name || staffUser.email,
      email: staffUser.email,
      avatarUrl: staffUser.avatarUrl,
      role: staffUser.role,
    }));

    return { success: true, staff };
  } catch (error) {
    console.error("Error fetching transfer staff:", error);
    return { success: false, error: "Failed to fetch active staff." };
  }
}

/**
 * Transfer an active chat thread to another staff/admin user.
 */
export async function transferChatThread(threadId: string, newStaffId: string) {
  try {
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized. Please log in." };

    if (!isStaffRole(user.role)) return { success: false, error: "Access denied." };
    if (!newStaffId.trim()) return { success: false, error: "Target staff is required." };

    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
    });
    if (!thread) return { success: false, error: "Chat thread not found." };
    if (thread.isArchived) return { success: false, error: "Cannot transfer an archived thread." };
    if (thread.status === "CLOSED") return { success: false, error: "Cannot transfer a closed thread." };

    const targetStaff = await db.query.users.findFirst({
      where: and(
        eq(users.id, newStaffId),
        inArray(users.role, STAFF_ROLES),
        eq(users.isActive, true)
      ),
      columns: {
        id: true,
        fullName: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
      },
    });
    if (!targetStaff) return { success: false, error: "Target staff account is not active." };

    const [updated] = await db
      .update(chatThreads)
      .set({
        staffId: targetStaff.id,
        status: "OPEN",
        updatedAt: new Date(),
      })
      .where(eq(chatThreads.id, threadId))
      .returning();
    const updatedThread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, updated.id),
      with: { staff: true },
    });
    if (updatedThread) {
      await triggerThreadUpdated(toThreadUpdateDto(updatedThread));
    }

    revalidatePath("/admin/messages");

    return {
      success: true,
      thread: {
        id: updated.id,
        staffId: updated.staffId,
        staffName: getStaffDisplayName(targetStaff),
        staffAvatar: targetStaff.avatarUrl,
        staffRole: targetStaff.role,
        status: updated.status,
      },
    };
  } catch (error) {
    console.error("Error transferring chat thread:", error);
    return { success: false, error: "Failed to transfer chat thread." };
  }
}

/**
 * Broadcast typing status to Pusher channel
 */
export async function sendTypingStatus(threadId: string, _senderName?: string) {
  try {
    void _senderName;
    // 🔒 Session-derived identity — never trust client-supplied senderName
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // 🛡️ Validate threadId
    const parsedThreadId = ThreadIdSchema.safeParse(threadId);
    if (!parsedThreadId.success) return { success: false, error: "Invalid thread ID" };

    const sessionName = user.fullName || user.name || "User";
    const { pusherServer } = await import("@/lib/pusher");
    await pusherServer.trigger(`chat-thread-${parsedThreadId.data}`, "client-typing", {
      senderName: sessionName,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to trigger typing indicator:", error);
    return { success: false };
  }
}

/**
 * Mark all unread messages from others in thread as read
 */
export async function markMessagesAsRead(threadId: string, _currentUserId?: string) {
  try {
    void _currentUserId;
    // 🔒 Session-derived identity — the _currentUserId parameter is IGNORED
    //    to prevent identity spoofing. The real userId comes from the server session.
    const user = await getDbUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // 🛡️ Validate threadId
    const parsedThreadId = ThreadIdSchema.safeParse(threadId);
    if (!parsedThreadId.success) return { success: false, error: "Invalid thread ID" };

    const sessionUserId = user.id;

    await db
      .update(chatMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(chatMessages.threadId, parsedThreadId.data),
          ne(chatMessages.senderId, sessionUserId)
        )
      );

    const { pusherServer } = await import("@/lib/pusher");
    await pusherServer.trigger(`chat-thread-${parsedThreadId.data}`, "messages-read", {
      readerId: sessionUserId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error marking messages as read:", error);
    return { success: false, error: "Failed to mark messages as read." };
  }
}
