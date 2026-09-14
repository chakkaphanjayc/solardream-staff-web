import "server-only";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { getConfiguredAdminSiteUrl, getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

const DISCORD_WEBHOOK_TIMEOUT_MS = 8_000;
const MAX_DISCORD_ERROR_BODY_CHARS = 2_000;

export async function getDiscordWebhookUrl() {
    const storedUrl = (await getSystemSetting("discord_webhook_url"))?.trim();
    return storedUrl || process.env.DISCORD_WEBHOOK_URL?.trim() || "";
}

export type DiscordPaymentAlert = {
    customerName: string;
    quotationId: string;
    milestoneName: string;
    amount: number;
    bankAccount: string;
    transRef: string;
    actionUrl: string;
};

async function getPaymentDiscordWebhookUrl() {
    const storedUrl = (await getSystemSetting("discord_payment_webhook_url"))?.trim();
    return storedUrl || process.env.DISCORD_PAYMENT_WEBHOOK_URL?.trim() || getDiscordWebhookUrl();
}

function truncateDiscordField(value: string, maxLength = 1_000) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export async function sendDiscordPaymentAlert(payload: DiscordPaymentAlert) {
    const webhookUrl = await getPaymentDiscordWebhookUrl();
    if (!webhookUrl) {
        console.warn("[Discord Payment Alert] No payment webhook URL detected.");
        return false;
    }

    const amount = new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        maximumFractionDigits: 2,
    }).format(payload.amount);

    const embedPayload = {
        username: "SolarDream Payment Operations",
        avatar_url: `${getConfiguredPublicSiteUrl()}/asset/sd-logo.png`,
        embeds: [
            {
                title: "💰 Payment Received & Verified!",
                description: "EasySlip verified the bank transfer and the payment ledger has been updated.",
                color: 5763719,
                fields: [
                    { name: "Customer Name", value: truncateDiscordField(payload.customerName || "Customer"), inline: true },
                    { name: "Quotation ID", value: `\`${truncateDiscordField(payload.quotationId, 180)}\``, inline: true },
                    { name: "Milestone", value: truncateDiscordField(payload.milestoneName), inline: false },
                    { name: "Amount Paid", value: amount, inline: true },
                    { name: "Bank Account", value: `\`${truncateDiscordField(payload.bankAccount, 180)}\``, inline: true },
                    { name: "EasySlip TransRef", value: `\`${truncateDiscordField(payload.transRef, 180)}\``, inline: false },
                    { name: "Sales Order / Admin Console", value: `[Open Sales Order in Admin Console](${payload.actionUrl})`, inline: false },
                ],
                url: payload.actionUrl,
                timestamp: new Date().toISOString(),
                footer: { text: "SolarDream verified payment ledger" },
            },
        ],
        components: [
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 5,
                        label: "Open Admin Console",
                        url: payload.actionUrl,
                    },
                ],
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Payment alert webhook");
}

async function postDiscordWebhook(
    webhookUrl: string,
    payload: unknown,
    logLabel: string,
) {
    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(DISCORD_WEBHOOK_TIMEOUT_MS),
        });

        if (!response.ok) {
            const errorBody = (await response.text().catch(() => ""))
                .slice(0, MAX_DISCORD_ERROR_BODY_CHARS);
            console.error(`[Discord Utility] ${logLabel} returned non-OK response`, {
                status: response.status,
                statusText: response.statusText,
                errorBody,
            });
        }

        return response.ok;
    } catch (error) {
        console.error(`[Discord Utility] ${logLabel} network request failed:`, error);
        return false;
    }
}

export async function sendDiscordEmbedNotification(payload: {
    proposalId: string;
    customerName: string;
    customerEmail: string;
    systemSizeKwp: number;
    panelCount: number;
    totalPrice: number;
    version: number;
    driveLink?: string;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) {
        console.warn("[Discord Utility] No webhook URL detected in environment variables.");
        return false;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const adminUrl = getConfiguredAdminSiteUrl();
    const crmUrl = `${adminUrl}/th/admin/crm`;
    const formattedTotal = new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        maximumFractionDigits: 0,
    }).format(payload.totalPrice);

    const embedPayload = {
        username: "SolarDream Automation",
        avatar_url: `${siteUrl}/asset/sd-logo.png`,
        embeds: [
            {
                title: `Signed proposal received`,
                description: `The customer uploaded a signed proposal and the workflow moved to verification. Review the record in the CRM control board.`,
                color: 1883067, // รหัสสีพิกเซลธีมแอปคุณ (#1CBBBB)
                fields: [
                    {
                        name: "Document ID",
                        value: `\`${payload.proposalId}\``,
                        inline: false
                    },
                    {
                        name: "Customer Meta",
                        value: `**${payload.customerName}**\n${payload.customerEmail}`,
                        inline: true
                    },
                    {
                        name: "System Size",
                        value: `**${payload.systemSizeKwp.toFixed(2)} kWp**`,
                        inline: true
                    },
                    {
                        name: "Panel Count",
                        value: `**${payload.panelCount.toLocaleString()} panels**`,
                        inline: true
                    },
                    {
                        name: "Total Valuation",
                        value: `**${formattedTotal}**`,
                        inline: true
                    },
                    {
                        name: "Control Board",
                        value: `[Open /admin/crm](${crmUrl})`,
                        inline: false
                    }
                ],
                url: crmUrl,
                timestamp: new Date().toISOString(),
                footer: {
                    text: `SolarDream Client Automation Center • v${payload.version}`
                }
            }
        ]
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Signed upload webhook");
}

export async function sendDiscordQuotationCancellationNotification(payload: {
    proposalId: string;
    customerName: string;
    customerEmail: string;
    systemSizeKwp: number;
    totalPrice: number;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) {
        console.warn("[Discord Utility] No webhook URL detected in environment variables.");
        return false;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const adminUrl = getConfiguredAdminSiteUrl();
    const crmUrl = `${adminUrl}/th/admin/crm`;
    const formattedTotal = new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        maximumFractionDigits: 0,
    }).format(payload.totalPrice);

    const embedPayload = {
        username: "SolarDream Automation",
        avatar_url: `${siteUrl}/asset/sd-logo.png`,
        embeds: [
            {
                title: "🔴 ใบเสนอราคา/โครงการ ถูกยกเลิกแล้ว!",
                description: "Destructive quotation cancellation chain completed. Review the CRM record for operational history and ERPNext linkage status.",
                color: 15849144, // #F1D6B8
                fields: [
                    {
                        name: "Proposal ID",
                        value: `\`${payload.proposalId}\``,
                        inline: false
                    },
                    {
                        name: "Customer Meta",
                        value: `**${payload.customerName}**\n${payload.customerEmail}`,
                        inline: true
                    },
                    {
                        name: "System Size",
                        value: `**${payload.systemSizeKwp.toFixed(2)} kWp**`,
                        inline: true
                    },
                    {
                        name: "Project Total Valuation",
                        value: `**${formattedTotal}**`,
                        inline: true
                    },
                    {
                        name: "Warning Marker",
                        value: "`สถานะระบบ: CANCELLED (ระบบตัดการเชื่อมโยง ERPNext เรียบร้อยแล้ว)`",
                        inline: false
                    },
                    {
                        name: "Control Board",
                        value: `[Open /admin/crm](${crmUrl})`,
                        inline: false
                    }
                ],
                url: crmUrl,
                timestamp: new Date().toISOString(),
                footer: {
                    text: "SolarDream Cancellation Monitor"
                }
            }
        ]
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Cancellation webhook");
}

export async function sendDiscordProposalSignedNotification(payload: {
    customerName: string;
    documentNo: string;
    totalPrice: number;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) {
        console.warn("[Discord Utility] No webhook URL detected in environment variables.");
        return false;
    }

    const formattedTotal = `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(payload.totalPrice)} THB`;

    const embedPayload = {
        username: "SolarDream Automation",
        embeds: [
            {
                title: "🟢 New Proposal Signed! (เอกสารได้รับการอนุมัติ)",
                color: 3066993,
                fields: [
                    {
                        name: "Customer Name",
                        value: payload.customerName || "Unknown Customer",
                        inline: true,
                    },
                    {
                        name: "Document No",
                        value: payload.documentNo,
                        inline: true,
                    },
                    {
                        name: "Grand Total",
                        value: formattedTotal,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Signed proposal webhook");
}

export async function sendDiscordProposalApprovalNotification(payload: {
    proposalId: string;
    customerName: string;
    documentNo: string;
    totalPrice: number;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) {
        console.warn("[Discord Utility] No webhook URL detected in environment variables.");
        return false;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const adminUrl = getConfiguredAdminSiteUrl();
    const crmUrl = `${adminUrl}/th/admin/crm/${payload.proposalId}`;
    const formattedTotal = `${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(payload.totalPrice)} THB`;

    const embedPayload = {
        username: "SolarDream Automation",
        avatar_url: `${siteUrl}/asset/sd-logo.png`,
        embeds: [
            {
                title: "🟢 Customer approved finalized quotation",
                description: "The customer approved the finalized ERPNext quotation and is ready for the next staff workflow step.",
                color: 3066993,
                fields: [
                    {
                        name: "Customer Name",
                        value: payload.customerName || "Unknown Customer",
                        inline: true,
                    },
                    {
                        name: "Document No",
                        value: payload.documentNo,
                        inline: true,
                    },
                    {
                        name: "Grand Total",
                        value: formattedTotal,
                        inline: false,
                    },
                    {
                        name: "CRM Record",
                        value: `[Open CRM Workbench](${crmUrl})`,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Approval webhook");
}

export async function sendDiscordQuotationNegotiationAlert(payload: {
    proposalId: string;
    documentNo: string;
    customerName: string;
    message: string;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) {
        console.warn("[Discord Utility] No webhook URL detected in environment variables.");
        return false;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const adminUrl = getConfiguredAdminSiteUrl();
    const crmUrl = `${adminUrl}/th/admin/crm/${payload.proposalId}`;

    const truncatedMsg = payload.message.length > 200
        ? `${payload.message.slice(0, 200)}…`
        : payload.message;

    const embedPayload = {
        username: "SolarDream Automation",
        avatar_url: `${siteUrl}/asset/sd-logo.png`,
        embeds: [
            {
                title: "🟡 ลูกค้าขอปรับปรุงแก้ไขใบเสนอราคา",
                description: `ลูกค้าขอปรับปรุงแก้ไขใบเสนอราคา เลขที่ **${payload.documentNo}** กรุณาตรวจสอบและอัปเดตข้อมูล`,
                color: 16776960, // #FFFF00 — yellow
                fields: [
                    {
                        name: "Document No",
                        value: `\`${payload.documentNo}\``,
                        inline: true,
                    },
                    {
                        name: "Customer",
                        value: payload.customerName,
                        inline: true,
                    },
                    {
                        name: "ข้อความจากลูกค้า",
                        value: `> ${truncatedMsg}`,
                        inline: false,
                    },
                    {
                        name: "CRM Record",
                        value: `[เปิด CRM Workbench →](${crmUrl})`,
                        inline: false,
                    },
                ],
                url: crmUrl,
                timestamp: new Date().toISOString(),
                footer: {
                    text: "SolarDream Negotiation Monitor",
                },
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Negotiation webhook");
}

export async function notifyNewLead(payload: {
    customerName: string;
    phone: string;
    source: string;
    requestType: string;
    email?: string | null;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) return false;

    const adminUrl = getConfiguredAdminSiteUrl();
    const pipelineUrl = `${adminUrl}/th/admin/quotations?tab=leads`;

    const embedPayload = {
        username: "SolarDream Lead Alert",
        embeds: [
            {
                title: "🟢 New Lead Received! (ลูกค้าใหม่ลงทะเบียน)",
                description: `A new customer request (${payload.requestType}) has arrived via **${payload.source}**.`,
                color: 2278750, // Green (#22C55E)
                fields: [
                    {
                        name: "Customer Name",
                        value: `**${payload.customerName}**`,
                        inline: true,
                    },
                    {
                        name: "Phone Number",
                        value: `\`${payload.phone}\``,
                        inline: true,
                    },
                    {
                        name: "Source / Channel",
                        value: `\`${payload.source}\``,
                        inline: true,
                    },
                    {
                        name: "Config Type",
                        value: `\`${payload.requestType}\``,
                        inline: true,
                    },
                    {
                        name: "Sales Pipeline",
                        value: `[Open Sales Pipeline Tab 1 →](${pipelineUrl})`,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "New lead webhook");
}

export async function notifySLABreach(payload: {
    uncontactedLeads: Array<{ name: string; phone: string; ageHours: number; id: string }>;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) return false;

    const adminUrl = getConfiguredAdminSiteUrl();
    const pipelineUrl = `${adminUrl}/th/admin/quotations?tab=leads`;

    const leadListFormatted = payload.uncontactedLeads
        .map(
            (lead) =>
                `• **${lead.name}** (\`${lead.phone}\`) — Uncontacted for **${lead.ageHours} hours**`
        )
        .join("\n");

    const embedPayload = {
        content: "@here 🚨 **SLA Breach Alert: Uncontacted Leads > 24 Hours!**",
        username: "SolarDream SLA Alert",
        embeds: [
            {
                title: "🔴 SLA Violation: Pending Follow-up Needed!",
                description: `The following **${payload.uncontactedLeads.length} lead(s)** have been in **NEW** status for more than 24 hours without contact:`,
                color: 15683880, // Danger Red (#EF4444)
                fields: [
                    {
                        name: "Uncontacted Leads List",
                        value: leadListFormatted || "No details available.",
                        inline: false,
                    },
                    {
                        name: "Action Required",
                        value: `[Review & Contact in Sales Pipeline](${pipelineUrl})`,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "SLA breach webhook");
}

export async function notifyQuotationCreated(payload: {
    customerName: string;
    quotationId: string;
    totalPrice?: number;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) return false;

    const adminUrl = getConfiguredAdminSiteUrl();
    const pipelineUrl = `${adminUrl}/th/admin/quotations?tab=quotations`;
    const formattedTotal = payload.totalPrice
        ? `฿${payload.totalPrice.toLocaleString()}`
        : "Pending Valuation";

    const embedPayload = {
        username: "SolarDream Quotation Alert",
        embeds: [
            {
                title: "🔵 Lead Converted to Official Quotation!",
                description: `Formal quotation **#${payload.quotationId}** has been generated for customer **${payload.customerName}**.`,
                color: 3899894, // Blue (#3B82F6)
                fields: [
                    {
                        name: "Customer Name",
                        value: payload.customerName,
                        inline: true,
                    },
                    {
                        name: "Quotation ID",
                        value: `\`${payload.quotationId}\``,
                        inline: true,
                    },
                    {
                        name: "Estimated Total",
                        value: `**${formattedTotal}**`,
                        inline: true,
                    },
                    {
                        name: "Quotations CRM",
                        value: `[View Quotation in Tab 2 →](${pipelineUrl})`,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Quotation created webhook");
}

export async function sendDiscordCustomerDocumentUploadedNotification(payload: {
    proposalId: string;
    customerName: string;
    documentName: string;
    fileName: string;
    fileUrl?: string | null;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) return false;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const adminUrl = getConfiguredAdminSiteUrl();
    const crmUrl = `${adminUrl}/th/admin/crm/${payload.proposalId}`;

    const embedPayload = {
        username: "SolarDream Automation",
        avatar_url: `${siteUrl}/asset/sd-logo.png`,
        embeds: [
            {
                title: "📄 Customer Uploaded Requested Document (ลูกค้าอัปโหลดเอกสารแล้ว)",
                description: `Customer **${payload.customerName}** uploaded document **${payload.documentName}** for quotation \`#${payload.proposalId}\`.`,
                color: 3447003, // Blue (#3498DB)
                fields: [
                    {
                        name: "Customer Name",
                        value: payload.customerName || "Customer",
                        inline: true,
                    },
                    {
                        name: "Document Category",
                        value: payload.documentName,
                        inline: true,
                    },
                    {
                        name: "Uploaded File Name",
                        value: `\`${payload.fileName}\``,
                        inline: false,
                    },
                    {
                        name: "CRM Workbench",
                        value: `[Open CRM Record →](${crmUrl})`,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: "SolarDream Customer Document Ingestion",
                },
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Customer document uploaded webhook");
}

export async function sendDiscordSalesLifecycleNotification(payload: {
    eventLabel: string;
    customerName: string;
    reference: string;
    description: string;
    amount?: number | null;
    status?: string | null;
    requestType?: string | null;
    actionUrl?: string | null;
}) {
    const webhookUrl = await getDiscordWebhookUrl();
    if (!webhookUrl) return false;

    const amount = typeof payload.amount === "number" && Number.isFinite(payload.amount)
        ? new Intl.NumberFormat("th-TH", {
            style: "currency",
            currency: "THB",
            maximumFractionDigits: 0,
        }).format(payload.amount)
        : null;
    const adminUrl = getConfiguredAdminSiteUrl();
    const crmUrl = payload.actionUrl || `${adminUrl}/th/admin/crm`;
    const colors: Record<string, number> = {
        "New lead received": 3066993,
        "Quotation ready": 3447003,
        "Payment requested": 15844367,
        "Payment needs review": 16776960,
        "Payment received": 5763719,
    };

    const embedPayload = {
        username: "SolarDream Sales Pipeline",
        avatar_url: `${getConfiguredPublicSiteUrl()}/asset/sd-logo.png`,
        embeds: [
            {
                title: payload.eventLabel,
                description: payload.description,
                color: colors[payload.eventLabel] || 3447003,
                fields: [
                    { name: "Customer", value: payload.customerName || "Customer", inline: true },
                    { name: "Reference", value: `\`${payload.reference}\``, inline: true },
                    ...(payload.requestType ? [{ name: "Request type", value: payload.requestType, inline: true }] : []),
                    ...(payload.status ? [{ name: "Status", value: payload.status, inline: true }] : []),
                    ...(amount ? [{ name: "Amount", value: amount, inline: true }] : []),
                    { name: "CRM", value: `[Open CRM](${crmUrl})`, inline: false },
                ],
                url: crmUrl,
                timestamp: new Date().toISOString(),
                footer: { text: "SolarDream customer lifecycle" },
            },
        ],
    };

    return postDiscordWebhook(webhookUrl, embedPayload, "Sales lifecycle webhook");
}
