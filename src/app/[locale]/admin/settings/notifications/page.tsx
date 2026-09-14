import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, BellRing } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, isNotNull } from "drizzle-orm";
import {
  getSalesNotificationChannelStatus,
  getSalesNotificationConfig,
} from "@/lib/salesNotificationServer";
import NotificationsSettingsClient from "./NotificationsSettingsClient";

export const instant = false;

export default async function NotificationsSettingsPage() {
  await connection();
  await requireAdmin();

  const [config, channelStatus, lineRecipients] = await Promise.all([
    getSalesNotificationConfig(),
    getSalesNotificationChannelStatus(),
    db.query.users.findMany({
      where: isNotNull(users.lineUserId),
      columns: {
        id: true,
        name: true,
        fullName: true,
        email: true,
        lineUserId: true,
      },
      orderBy: [desc(users.createdAt)],
      limit: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#B7D1EA]">
            <BellRing className="h-4 w-4" />
            Notifications
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-gray-100">
              Notification Integrations
            </h1>
            <p className="max-w-3xl text-sm font-medium leading-6 text-gray-400">
              Keep the alert stack modular: Listmonk manages transactional email, Discord handles operational alerts, and LINE remains an optional action channel.
            </p>
          </div>
        </div>

        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <NotificationsSettingsClient
        initialConfig={config}
        channelStatus={channelStatus}
        lineRecipients={lineRecipients}
      />
    </div>
  );
}
