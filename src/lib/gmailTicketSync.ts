import { getGmailClient } from "@/lib/google-client";

export type IngestedEmailTicket = {
  gmailMessageId: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  bodySnippet: string;
  receivedAt: string;
};

function parseSenderHeader(fromHeader?: string | null): { name: string; email: string } {
  if (!fromHeader) return { name: "Customer", email: "unknown@example.com" };
  const match = fromHeader.match(/^(?:"?([^"]*)"?\s)?<?([^\s>]+)>?$/);
  if (match) {
    const name = match[1]?.trim() || match[2]?.trim() || "Customer";
    const email = match[2]?.trim() || "unknown@example.com";
    return { name, email };
  }
  return { name: "Customer", email: fromHeader.trim() };
}

function encodeBase64Url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function syncGmailToTickets(): Promise<{
  success: boolean;
  ingestedTickets: IngestedEmailTicket[];
  count: number;
  error?: string;
}> {
  try {
    const gmail = getGmailClient();
    const userId = "me";

    // 1. List unread messages in inbox
    const listRes = await gmail.users.messages.list({
      userId,
      q: "is:unread label:INBOX",
      maxResults: 15,
    });

    const messages = listRes.data.messages || [];
    const ingestedTickets: IngestedEmailTicket[] = [];

    if (messages.length === 0) {
      return { success: true, ingestedTickets: [], count: 0 };
    }

    // Ensure PROCESSED label exists
    let processedLabelId = "PROCESSED_TICKETS";
    try {
      const labelsRes = await gmail.users.labels.list({ userId });
      const existingLabel = labelsRes.data.labels?.find((l) => l.name === "Processed");
      if (existingLabel?.id) {
        processedLabelId = existingLabel.id;
      } else {
        const createdLabel = await gmail.users.labels.create({
          userId,
          requestBody: {
            name: "Processed",
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
          },
        });
        if (createdLabel.data.id) {
          processedLabelId = createdLabel.data.id;
        }
      }
    } catch {
      // Label creation fallback if restricted
    }

    // 2. Process each email message
    for (const msg of messages) {
      if (!msg.id) continue;

      const fullMsg = await gmail.users.messages.get({
        userId,
        id: msg.id,
        format: "full",
      });

      const headers = fullMsg.data.payload?.headers || [];
      const fromHeader = headers.find((h) => h.name?.toLowerCase() === "from")?.value;
      const subjectHeader = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "Inbound Support Email";
      const dateHeader = headers.find((h) => h.name?.toLowerCase() === "date")?.value;

      const { name: senderName, email: senderEmail } = parseSenderHeader(fromHeader);
      const snippet = fullMsg.data.snippet || "New support request received via Gmail.";

      ingestedTickets.push({
        gmailMessageId: msg.id,
        threadId: fullMsg.data.threadId || msg.id || "",
        senderName,
        senderEmail,
        subject: subjectHeader,
        bodySnippet: snippet,
        receivedAt: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
      });

      // 3. Mark message as read and add "Processed" label
      try {
        await gmail.users.messages.modify({
          userId,
          id: msg.id,
          requestBody: {
            removeLabelIds: ["UNREAD"],
            addLabelIds: processedLabelId !== "PROCESSED_TICKETS" ? [processedLabelId] : [],
          },
        });
      } catch {
        // Fallback to unread removal
      }
    }

    return {
      success: true,
      ingestedTickets,
      count: ingestedTickets.length,
    };
  } catch (error: unknown) {
    console.error("[syncGmailToTickets Error]", error);
    return {
      success: false,
      ingestedTickets: [],
      count: 0,
      error: getErrorMessage(error, "Failed to sync Gmail inbox to tickets."),
    };
  }
}

export async function sendGmailTicketReply(payload: {
  to: string;
  subject: string;
  messageText: string;
  threadId?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const gmail = getGmailClient();
    const userId = "me";

    const subjectLine = payload.subject.startsWith("Re:") ? payload.subject : `Re: ${payload.subject}`;
    
    // Construct RFC 2822 MIME message
    const mimeLines = [
      `To: ${payload.to}`,
      `Subject: ${subjectLine}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      payload.messageText,
    ];

    const rawMime = mimeLines.join("\r\n");
    const encodedRaw = encodeBase64Url(rawMime);

    const res = await gmail.users.messages.send({
      userId,
      requestBody: {
        raw: encodedRaw,
        threadId: payload.threadId || undefined,
      },
    });

    return {
      success: true,
      messageId: res.data.id || undefined,
    };
  } catch (error: unknown) {
    console.error("[sendGmailTicketReply Error]", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to send email reply via Gmail API."),
    };
  }
}
