import { db } from "@/db";
import {
  paymentMilestones,
  paymentReminderLogs,
} from "@/db/schema";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { sendConfiguredTemplateEmail } from "@/lib/email";

type ReminderType = "3_DAYS_BEFORE" | "DUE_DATE" | "OVERDUE";

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

function getCalendarDate(date: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function calendarDayDifference(
  dueDate: Date,
  now: Date,
  timeZone: string,
): number {
  const due = getCalendarDate(dueDate, timeZone);
  const today = getCalendarDate(now, timeZone);
  const dueUtc = Date.UTC(due.year, due.month - 1, due.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((dueUtc - todayUtc) / DAY_IN_MS);
}

function getReminderType(daysRemaining: number): ReminderType | null {
  if (daysRemaining === 3) return "3_DAYS_BEFORE";
  if (daysRemaining === 0) return "DUE_DATE";
  if (daysRemaining < 0) return "OVERDUE";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getProjectName(
  orderId: string,
  configurationData: unknown,
): string {
  const config = asRecord(configurationData);
  for (const key of ["projectName", "project_name", "name", "title"]) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `SolarDream Project ${orderId.slice(0, 8).toUpperCase()}`;
}

function getSiteUrl(): string {
  const rawUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  const url = new URL(rawUrl);
  return url.toString().replace(/\/$/, "");
}

function formatMoney(value: string): string {
  return Number(value).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });
}

function formatDueDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone,
    dateStyle: "long",
  }).format(date);
}

export async function processDailyPaymentReminders() {
  const startedAt = new Date();
  const timeZone = process.env.APP_TIMEZONE?.trim() || "Asia/Bangkok";
  const siteUrl = getSiteUrl();
  const reminderWindowStart = new Date(
    startedAt.getTime() - REMINDER_WINDOW_MS,
  );

  const milestones = await db.query.paymentMilestones.findMany({
    where: and(
      inArray(paymentMilestones.status, ["ACTIVE", "OVERDUE"]),
      isNotNull(paymentMilestones.dueDate),
    ),
    with: {
      order: {
        columns: {
          id: true,
          configurationData: true,
        },
        with: {
          user: {
            columns: {
              email: true,
              name: true,
              fullName: true,
            },
          },
        },
      },
    },
  });

  const summary = {
    scanned: milestones.length,
    eligible: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    overdueUpdated: 0,
  };

  for (const milestone of milestones) {
    const dueDate = milestone.dueDate;
    if (!dueDate) {
      summary.skipped += 1;
      continue;
    }

    const daysRemaining = calendarDayDifference(
      dueDate,
      startedAt,
      timeZone,
    );
    const reminderType = getReminderType(daysRemaining);
    if (!reminderType) {
      summary.skipped += 1;
      continue;
    }
    summary.eligible += 1;

    if (reminderType === "OVERDUE" && milestone.status === "ACTIVE") {
      const [updated] = await db
        .update(paymentMilestones)
        .set({ status: "OVERDUE" })
        .where(
          and(
            eq(paymentMilestones.id, milestone.id),
            eq(paymentMilestones.status, "ACTIVE"),
          ),
        )
        .returning({ id: paymentMilestones.id });
      if (updated) summary.overdueUpdated += 1;
    }

    const recipient = milestone.order.user.email.trim();
    if (!recipient) {
      summary.failed += 1;
      console.warn("[PAYMENT REMINDER] Customer email is missing.", {
        milestoneId: milestone.id,
        orderId: milestone.orderId,
      });
      continue;
    }

    const paymentUrl = `${siteUrl}/checkout/${encodeURIComponent(
      milestone.orderId,
    )}/payment?milestone=${encodeURIComponent(milestone.id)}`;
    const customerName =
      milestone.order.user.fullName ||
      milestone.order.user.name ||
      recipient.split("@")[0];
    try {
      const deliveryStatus = await db.transaction(async (tx) => {
        const lockKey = `payment-reminder:${milestone.id}:${reminderType}`;
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`,
        );

        const recentLog = await tx.query.paymentReminderLogs.findFirst({
          where: and(
            eq(paymentReminderLogs.milestoneId, milestone.id),
            eq(paymentReminderLogs.channel, "EMAIL"),
            eq(paymentReminderLogs.reminderType, reminderType),
            gte(paymentReminderLogs.sentAt, reminderWindowStart),
          ),
          columns: { id: true },
        });

        if (recentLog) return "SKIPPED" as const;

        const result = await sendConfiguredTemplateEmail({
          templateKey: "payment_confirmed",
          to: recipient,
          values: {
            customer_name: customerName,
            project_name: getProjectName(milestone.orderId, milestone.order.configurationData),
            milestone_name: milestone.milestoneName,
            milestone_order: milestone.milestoneOrder,
            amount: formatMoney(milestone.amount),
            due_date: formatDueDate(dueDate, timeZone),
            reminder_type: reminderType,
            action_url: paymentUrl,
          },
        });

        if (!result.success) {
          throw new Error(result.error || result.reason || "Listmonk did not confirm delivery.");
        }

        await tx.insert(paymentReminderLogs).values({
          milestoneId: milestone.id,
          channel: "EMAIL",
          sentTo: recipient,
          reminderType,
        });

        return "SENT" as const;
      });

      if (deliveryStatus === "SKIPPED") {
        summary.skipped += 1;
      } else {
        summary.sent += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error("[PAYMENT REMINDER] Delivery failed.", {
        milestoneId: milestone.id,
        orderId: milestone.orderId,
        reminderType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    success: summary.failed === 0,
    processedAt: startedAt.toISOString(),
    ...summary,
  };
}
