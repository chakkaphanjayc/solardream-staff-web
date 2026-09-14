import "server-only";

import { sendConfiguredTemplateEmail } from "@/lib/email";
import { sendDiscordProposalApprovalNotification } from "@/lib/discord";
import { getMemberRichMenuId, linkMemberRichMenuToLineUser } from "@/lib/lineRichMenuLifecycle";
import { pushMessageToLine } from "@/lib/linePush";
import type { LifecycleEventType, LifecyclePayload } from "@/lib/customerLifecycle";
import { getSalesNotificationConfig } from "@/lib/salesNotificationServer";

const PAYMENT_CONFIRMED_SUBJECT = "ยินดีต้อนรับสู่ SolarDream Family! บัตรรับประกันดิจิทัลของคุณพร้อมใช้งานแล้ว";

export async function NotificationOrchestrator(eventType: LifecycleEventType, payload: LifecyclePayload): Promise<{ success: boolean; channelsDispatched: string[]; errors?: string[] }> {
  const channelsDispatched: string[] = [];
  const errors: string[] = [];
  const salesConfig = await getSalesNotificationConfig();
  const emailKey = eventType === "REQUEST_RECEIVED"
    ? "welcome"
    : eventType === "QUOTATION_READY" || eventType === "QUOTATION_ACCEPTED"
      ? "proposal_ready"
      : eventType === "PROJECT_COMPLETED"
        ? "project_completed"
        : eventType === "WARRANTY_REGISTERED"
          ? "warranty_registered"
          : eventType === "PAYMENT_VERIFIED"
            ? "payment_confirmed"
        : null;
  if (emailKey && payload.email) {
    const email = await sendConfiguredTemplateEmail({
      templateKey: emailKey,
      to: payload.email,
      values: {
        customer_name: payload.customerName,
        customer_email: payload.email,
        proposal_id: payload.quotationId || "",
        document_no: payload.quotationId || "",
        project_id: payload.projectId || "",
        action_url: payload.proposalUrl || "",
        warranty_years: payload.warrantyYears || "",
        warranty_card_url: payload.warrantyCardUrl || "",
        warranty_subject: payload.warrantySubject || "",
        warranty_days_remaining: payload.warrantyDaysRemaining ?? "",
        milestone: payload.milestone || "",
        amount: payload.paymentAmount ?? "",
        milestone_name: payload.paymentMilestoneName || "",
        bank_account: payload.paymentBankAccount || "",
        trans_ref: payload.paymentTransRef || "",
        payment_subject: eventType === "PAYMENT_VERIFIED" ? PAYMENT_CONFIRMED_SUBJECT : "",
        project_progress_url: payload.projectProgressUrl || payload.proposalUrl || "",
      },
    });
    if (email.success) channelsDispatched.push("listmonk_email");
    else errors.push(email.error || email.reason || "Listmonk email failed.");
  }
  try {
    if (eventType === "REQUEST_RECEIVED" && salesConfig.enabled && salesConfig.discordEnabled && salesConfig.rules.LEAD_RECEIVED.discord) {
      await sendDiscordProposalApprovalNotification({ proposalId: payload.leadId || "NEW-LEAD", customerName: payload.customerName, documentNo: payload.leadId || "LEAD-001", totalPrice: 154000 });
      channelsDispatched.push("discord_alert");
    }
    if (eventType === "QUOTATION_READY" && payload.lineUserId && salesConfig.enabled && salesConfig.lineEnabled && salesConfig.rules.QUOTATION_READY.line) {
      await pushMessageToLine(payload.lineUserId, [{ type: "text", text: `Your SolarDream quotation is ready. ${payload.proposalUrl || ""}` }]);
      channelsDispatched.push("line_quotation");
    }
    if (eventType === "PROJECT_UPDATE" && payload.lineUserId) {
      await pushMessageToLine(payload.lineUserId, [{ type: "text", text: `Project update: ${payload.milestone || ""}` }]);
      channelsDispatched.push("line_project_update");
    }
    if (eventType === "PROJECT_COMPLETED" && payload.lineUserId) {
      const menuId = await getMemberRichMenuId();
      if (menuId) await linkMemberRichMenuToLineUser(payload.lineUserId, menuId);
      channelsDispatched.push("line_rich_menu_swapped");
    }
    if (eventType === "WARRANTY_REGISTERED" && payload.lineUserId) {
      const warrantyCardUrl = payload.warrantyCardUrl || "";
      const subject = payload.warrantySubject || "Digital warranty card ready";
      await pushMessageToLine(payload.lineUserId, [{
        type: "flex",
        altText: subject,
        contents: {
          type: "bubble",
          size: "kilo",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0D1B2A",
            paddingAll: "20px",
            contents: [
              {
                type: "text",
                text: "SOLARDREAM",
                color: "#8DE28D",
                weight: "bold",
                size: "xs",
                letterSpacing: "1px",
              },
              {
                type: "text",
                text: "Digital Warranty Card",
                color: "#FFFFFF",
                weight: "bold",
                size: "lg",
                margin: "sm",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: `ยินดีต้อนรับสู่ SolarDream Family, ${payload.customerName}`,
                wrap: true,
                weight: "bold",
                size: "md",
                color: "#0D1B2A",
              },
              {
                type: "text",
                text: "บัตรรับประกันดิจิทัลของคุณพร้อมใช้งานแล้ว",
                wrap: true,
                size: "sm",
                color: "#52606D",
              },
              {
                type: "text",
                text: payload.warrantyDaysRemaining === null || payload.warrantyDaysRemaining === undefined
                  ? "ระบบติดตั้งของคุณได้รับการลงทะเบียนเรียบร้อยแล้ว"
                  : `คุ้มครองการติดตั้งเหลือ ${payload.warrantyDaysRemaining} วัน`,
                wrap: true,
                size: "xs",
                color: "#52606D",
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#1D8A3A",
                action: {
                  type: "uri",
                  label: "เปิดบัตรรับประกัน",
                  uri: warrantyCardUrl,
                },
              },
            ],
          },
        },
      }]);
      channelsDispatched.push("line_warranty_card");
    }
    if (eventType === "PAYMENT_VERIFIED" && payload.lineUserId) {
      const actionUrl = payload.projectProgressUrl || payload.paymentActionUrl || payload.proposalUrl || "";
      const amount = typeof payload.paymentAmount === "number"
        ? new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(payload.paymentAmount)
        : "";
      await pushMessageToLine(payload.lineUserId, [{
        type: "flex",
        altText: "ยืนยันการชำระเงิน SolarDream แล้ว",
        contents: {
          type: "bubble",
          size: "kilo",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0F172A",
            paddingAll: "20px",
            contents: [
              { type: "text", text: "SOLARDREAM", color: "#B7D1EA", weight: "bold", size: "xs" },
              { type: "text", text: "Payment Receipt", color: "#FFFFFF", weight: "bold", size: "xl", margin: "sm" },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              { type: "text", text: `ยืนยันการชำระเงินของคุณแล้ว ${payload.customerName}`, wrap: true, weight: "bold", size: "md", color: "#0F172A" },
              { type: "text", text: payload.paymentMilestoneName || "Payment milestone", wrap: true, size: "sm", color: "#475569" },
              { type: "text", text: amount, size: "xxl", weight: "bold", color: "#047857", margin: "md" },
              ...(payload.paymentTransRef ? [{ type: "text", text: `Ref: ${payload.paymentTransRef}`, wrap: true, size: "xs", color: "#64748B" }] : []),
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            contents: [{
              type: "button",
              style: "primary",
              color: "#1D8A3A",
              action: { type: "uri", label: "ดูความคืบหน้าโครงการ", uri: actionUrl },
            }],
          },
        },
      }]);
      channelsDispatched.push("line_payment_receipt");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Notification channel failed.");
  }
  return { success: errors.length === 0, channelsDispatched, errors: errors.length ? errors : undefined };
}
