import { connection } from "next/server";
import { getBanners } from "@/app/actions/banner";
import NotificationsClient from "./NotificationsClient";
import { requireAdmin } from "@/lib/auth-guard";

export const metadata = {
  title: "Notifications - Admin Console",
  description: "Manage global banners and notifications.",
};

export default async function NotificationsPage() {
  await connection();
  await requireAdmin();
  const banners = await getBanners();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-gray-100 tracking-tight uppercase">
          Global Notifications
        </h1>
        <p className="text-sm text-gray-400 mt-2 font-medium">
          Manage system-wide banners and promotional messages shown to all users.
        </p>
      </div>

      <NotificationsClient initialBanners={banners} />
    </div>
  );
}
